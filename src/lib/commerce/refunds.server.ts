import { getSql } from "@/lib/db";
import { stripeClient, paypalToken, paypalBase } from "./providers.server";
import { audit, orderById, recordPayment } from "./core.server";
import type Stripe from "stripe";
export async function requestRefund(
  input: { orderId: string; paymentId: string; amount: number; reason: string; requestId: string },
  actor: string,
  client?: Stripe,
) {
  const sql = await getSql();
  const claim = await sql.transaction(async (tx) => {
    const order = await orderById(tx, input.orderId, true);
    const [existing] = await tx<{
      state: string;
      provider_reference: string | null;
      created_at: string;
      amount: number;
      payment_id: string;
      order_id: string;
    }>`select * from commerce_refund_requests where id=${input.requestId}`;
    if (existing) {
      if (
        existing.amount !== input.amount ||
        existing.payment_id !== input.paymentId ||
        existing.order_id !== input.orderId
      )
        throw new Error("Refund request changed.");
      if (existing.state === "succeeded" || existing.provider_reference)
        return { existing, payment: null };
    }
    const [payment] = await tx<{
      provider: string;
      reference: string;
      amount: number;
    }>`select * from commerce_payments where id=${input.paymentId} and order_id=${input.orderId} and kind='payment'`;
    if (!payment || !["stripe", "paypal"].includes(payment.provider))
      throw new Error("This payment provider does not support dashboard refunds.");
    if (
      existing &&
      Date.now() - new Date(existing.created_at).getTime() >
        (payment.provider === "paypal" ? 5 : 23) * 3600000
    )
      throw new Error(
        "Uncertain refund is too old for automatic retry. Reconcile the provider before another request.",
      );
    if (!existing) {
      const [pending] = await tx<{
        amount: number;
      }>`select coalesce(sum(amount),0)::int as amount from commerce_refund_requests where order_id=${input.orderId} and state in ('processing','pending','review_required')`;
      if (
        input.amount > payment.amount ||
        input.amount > order.paid - order.refunded - pending.amount
      )
        throw new Error("Refund exceeds the available collected balance.");
      await tx`insert into commerce_refund_requests(id,order_id,payment_id,amount,reason,actor_id,state) values(${input.requestId},${input.orderId},${input.paymentId},${input.amount},${input.reason},${actor},'processing')`;
      await audit(tx, actor, "refund.initiated", "order", input.orderId, null, {
        request_id: input.requestId,
        amount: input.amount,
        payment_reference: payment.reference,
        reason: input.reason,
      });
    }
    return { existing, payment };
  });
  if (!claim.payment)
    return { state: claim.existing!.state, reference: claim.existing!.provider_reference };
  try {
    let reference: string, state: string, createdAt: string;
    if (claim.payment.provider === "stripe") {
      const stripe = client ?? stripeClient();
      const refund = await stripe.refunds.create(
        {
          payment_intent: claim.payment.reference,
          amount: input.amount,
          metadata: { rec_order_id: input.orderId, rec_refund_request_id: input.requestId },
        },
        { idempotencyKey: `rec-refund:${input.requestId}` },
      );
      reference = refund.id;
      state = refund.status ?? "pending";
      createdAt = new Date(refund.created * 1000).toISOString();
    } else {
      const token = await paypalToken();
      const response = await fetch(
        `${paypalBase()}/v2/payments/captures/${encodeURIComponent(claim.payment.reference)}/refund`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": input.requestId,
          },
          body: JSON.stringify({
            amount: { currency_code: "USD", value: (input.amount / 100).toFixed(2) },
            note_to_payer: "REC Mama Made refund",
          }),
        },
      );
      const refund = (await response.json()) as {
        id?: string;
        status?: string;
        create_time?: string;
      };
      if (!response.ok || !refund.id)
        throw new Error("PayPal refund could not be confirmed; reconcile before retrying.");
      reference = refund.id;
      state = refund.status === "COMPLETED" ? "succeeded" : "pending";
      createdAt = refund.create_time ?? new Date().toISOString();
    }
    await sql.transaction(async (tx) => {
      await orderById(tx, input.orderId, true);
      await tx`update commerce_refund_requests set state=${state === "succeeded" ? "succeeded" : state === "failed" || state === "canceled" ? "failed" : "pending"},provider_reference=${reference},updated_at=now() where id=${input.requestId}`;
      if (state === "succeeded")
        await recordPayment(tx, {
          orderId: input.orderId,
          provider: claim.payment!.provider,
          reference,
          kind: "refund",
          amount: input.amount,
          occurredAt: createdAt,
          actor,
          reason: input.reason,
        });
    });
    return { state, reference };
  } catch (error) {
    await sql`update commerce_refund_requests set state='review_required',updated_at=now() where id=${input.requestId} and provider_reference is null`;
    throw error;
  }
}
