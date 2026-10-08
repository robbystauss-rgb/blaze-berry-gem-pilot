import type Stripe from "stripe";
import { createHash, randomUUID } from "node:crypto";
import { getSql } from "@/lib/db";
import { stripeClient } from "./providers.server";
import { audit, recordPayment } from "./core.server";
export async function previewStripeHistory(
  input: { from: string; to: string; cursor?: string },
  client?: Stripe,
) {
  const stripe = client ?? stripeClient();
  const result = await stripe.checkout.sessions.list({
    limit: 50,
    created: {
      gte: Math.floor(new Date(input.from).getTime() / 1000),
      lt: Math.floor(new Date(input.to).getTime() / 1000),
    },
    ...(input.cursor ? { starting_after: input.cursor } : {}),
  });
  const sql = await getSql();
  const rows = [];
  for (const s of result.data) {
    if (s.mode !== "payment" || s.payment_status !== "paid" || s.currency !== "usd") continue;
    const [record] =
      await sql`select order_id from commerce_checkouts where provider='stripe' and reference=${s.id}`;
    rows.push({
      id: s.id,
      created: new Date(s.created * 1000).toISOString(),
      customer: s.customer_details?.name ?? s.metadata?.customer_name ?? "Name unavailable",
      email: s.customer_details?.email ?? s.customer_email ?? "",
      amount: s.amount_total ?? 0,
      imported: !!record,
      existingOrderId: record?.order_id ?? null,
      metadata: s.metadata ?? {},
    });
  }
  return { rows, hasMore: result.has_more, cursor: result.data.at(-1)?.id ?? null };
}
export async function importStripeHistory(reference: string, actor: string, client?: Stripe) {
  const stripe = client ?? stripeClient();
  const session = await stripe.checkout.sessions.retrieve(reference, {
    expand: ["payment_intent.latest_charge.balance_transaction"],
  });
  if (
    session.mode !== "payment" ||
    session.currency !== "usd" ||
    session.payment_status !== "paid" ||
    !session.amount_total
  )
    throw new Error("Only collected USD checkout payments are eligible.");
  const intent =
    typeof session.payment_intent === "string"
      ? await stripe.paymentIntents.retrieve(session.payment_intent, {
          expand: ["latest_charge.balance_transaction"],
        })
      : session.payment_intent;
  if (
    !intent ||
    intent.status !== "succeeded" ||
    intent.currency !== "usd" ||
    intent.amount_received !== session.amount_total
  )
    throw new Error("Successful payment could not be reconciled.");
  const lines = await stripe.checkout.sessions.listLineItems(reference, { limit: 100 });
  if (lines.has_more) throw new Error("Line-item pagination requires separate reconciliation.");
  if (!lines.data.length) throw new Error("Original purchased items unavailable.");
  const subtotal = session.amount_subtotal ?? session.amount_total;
  const discount = session.total_details?.amount_discount ?? 0,
    shipping = session.total_details?.amount_shipping ?? 0,
    tax = session.total_details?.amount_tax ?? 0;
  if (subtotal - discount + shipping + tax !== session.amount_total)
    throw new Error("Original price components cannot be reconciled.");
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  const balance =
    charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
  const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 });
  if (refunds.has_more) throw new Error("Refund pagination requires separate reconciliation.");
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const bytes = createHash("sha256")
      .update("stripe-history:" + reference)
      .digest("hex")
      .slice(0, 32);
    const id = `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-a${bytes.slice(17, 20)}-${bytes.slice(20)}`;
    const [existing] = await tx<{
      order_id: string;
    }>`select order_id from commerce_checkouts where provider='stripe' and reference=${reference}`;
    if (existing) return { id: existing.order_id, imported: false };
    if (session.metadata?.rec_order_id) {
      const [known] =
        await tx`select id from commerce_orders where id=${session.metadata.rec_order_id}`;
      if (known)
        throw new Error(
          "Current order association needs webhook reconciliation rather than historical import.",
        );
    }
    const inserted =
      await tx`insert into commerce_orders(id,created_at,customer_name,customer_email,shipping_address,source,subtotal,discount,shipping,tax,total) values(${id},${new Date(session.created * 1000).toISOString()},${session.customer_details?.name ?? session.metadata?.customer_name ?? "Name unavailable"},${session.customer_details?.email ?? session.customer_email ?? ""},${session.collected_information?.shipping_details?.address ? JSON.stringify(session.collected_information.shipping_details.address) : null},'stripe_history_review',${subtotal},${discount},${shipping},${tax},${session.amount_total}) on conflict do nothing returning id`;
    if (!inserted.length) return { id, imported: false };
    for (const line of lines.data) {
      const quantity = line.quantity ?? 1;
      await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications) values(${randomUUID()},${id},${"historical:" + reference + ":" + line.id},${line.description ?? "Historical purchased item"},${quantity},${quantity},${Math.round(line.amount_subtotal / quantity)},${JSON.stringify({ providerMetadata: session.metadata ?? {}, historicalLimitations: "Original artwork, exact preview placement, bonus quantities and fulfillment stage are not independently verified. Review existing business records before production.", providerLineItem: line.id })})`;
    }
    await tx`insert into commerce_checkouts(provider,reference,order_id,state) values('stripe',${reference},${id},'paid')`;
    await recordPayment(tx, {
      orderId: id,
      provider: "stripe",
      reference: intent.id,
      kind: "payment",
      amount: intent.amount_received,
      occurredAt: new Date((charge?.created ?? session.created) * 1000).toISOString(),
      fee: balance?.fee ?? null,
    });
    for (const refund of refunds.data) {
      if (refund.status === "succeeded" && refund.currency === "usd")
        await recordPayment(tx, {
          orderId: id,
          provider: "stripe",
          reference: refund.id,
          kind: "refund",
          amount: refund.amount,
          occurredAt: new Date(refund.created * 1000).toISOString(),
        });
    }
    await audit(tx, actor, "order.historical_imported", "order", id, null, {
      provider: "stripe",
      reference,
      inventory: "No inventory allocations or deductions",
      fulfillment: "Requires historical review",
    });
    return { id, imported: true };
  });
}
