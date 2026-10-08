import { getSql } from "@/lib/db";
import { orderById, audit } from "./core.server";
import { stripeClient } from "./providers.server";
import { financialConfig } from "./read.server";
import type Stripe from "stripe";

export async function manageInvoice(
  orderId: string,
  action: "create" | "send" | "resend",
  actor: string,
  client?: Stripe,
) {
  const sql = await getSql();
  const stripe = client ?? stripeClient();
  // Do not silently substitute another business's identity or configured Stripe sender.
  if (!financialConfig().invoices)
    throw new Error(
      "Confirm REC Mama Made Stripe branding, sender identity and signed webhook configuration before invoicing.",
    );
  const account = await stripe.accounts.retrieve(null);
  if (account.business_profile?.name !== "REC Mama Made")
    throw new Error("The Stripe account business name must be REC Mama Made.");
  if (account.business_profile?.support_email !== process.env.REC_INVOICE_SENDER)
    throw new Error("Invoice sender must match the reviewed REC Mama Made Stripe support email.");
  const claim = await sql.transaction(async (tx) => {
    const order = await orderById(tx, orderId, true);
    if (order.stage === "canceled" || order.paid > 0)
      throw new Error("Invoices require an unpaid, uncanceled order.");
    const checkout = await tx`select reference from commerce_checkouts where order_id=${orderId}`;
    if (checkout.length)
      throw new Error(
        "An existing checkout already owns this payment obligation. Cancel/expire and reconcile it before creating an invoice.",
      );
    const [existing] = await tx<{
      provider_id: string | null;
      customer_id: string | null;
      state: string;
      sent_at: string | null;
      updated_at: string;
    }>`select * from commerce_invoices where order_id=${orderId} for update`;
    if (
      existing?.state === "processing" &&
      Date.now() - new Date(existing.updated_at).getTime() < 120000
    )
      throw new Error("Invoice action is already in progress.");
    if (action !== "create" && !existing?.provider_id)
      throw new Error("Create and review the invoice first.");
    if (action === "send" && existing?.sent_at)
      throw new Error("Invoice was already sent. Use Resend explicitly.");
    await tx`insert into commerce_invoices(order_id,state) values(${orderId},'processing') on conflict(order_id) do update set state='processing',updated_at=now(),last_error=null`;
    return { order, existing };
  });
  try {
    let invoice: Stripe.Invoice;
    if (claim.existing?.provider_id)
      invoice = await stripe.invoices.retrieve(claim.existing.provider_id);
    else {
      const customer = claim.existing?.customer_id
        ? await stripe.customers.retrieve(claim.existing.customer_id)
        : await stripe.customers.create(
            {
              name: claim.order.customer_name,
              email: claim.order.customer_email,
              metadata: { rec_order_id: orderId },
            },
            { idempotencyKey: `rec-invoice-customer:${orderId}` },
          );
      await sql`update commerce_invoices set customer_id=${customer.id} where order_id=${orderId}`;
      invoice = await stripe.invoices.create(
        {
          customer: customer.id,
          collection_method: "send_invoice",
          days_until_due: 14,
          auto_advance: false,
          pending_invoice_items_behavior: "exclude",
          metadata: { rec_order_id: orderId },
          description: `REC Mama Made · Order #${claim.order.number}`,
          footer:
            "Thank you for supporting REC Mama Made. Custom work is confirmed before production.",
        },
        { idempotencyKey: `rec-invoice:${orderId}` },
      );
      // Persist the provider id before later calls so partial failures resume the same invoice.
      await sql`update commerce_invoices set provider_id=${invoice.id} where order_id=${orderId}`;
    }
    if (invoice.status === "draft") {
      const existingLines = await stripe.invoices.listLineItems(invoice.id, { limit: 100 });
      if (existingLines.has_more) throw new Error("Invoice requires line-item reconciliation.");
      const items = await sql<{
        id: string;
        title: string;
        quantity: number;
        unit_amount: number;
      }>`select id,title,quantity,unit_amount from commerce_order_items where order_id=${orderId}`;
      for (const item of items) {
        if (existingLines.data.some((line) => line.metadata?.rec_order_item_id === item.id))
          continue;
        await stripe.invoiceItems.create(
          {
            customer:
              typeof invoice.customer === "string" ? invoice.customer : invoice.customer!.id,
            invoice: invoice.id,
            amount: item.quantity * item.unit_amount,
            currency: "usd",
            description: `${item.title} × ${item.quantity}`,
            metadata: { rec_order_item_id: item.id },
          },
          { idempotencyKey: `rec-invoice-item:${orderId}:${item.id}` },
        );
      }
      for (const [name, amount] of [
        ["Shipping", claim.order.shipping],
        ["Tax (recorded on order)", claim.order.tax],
        ["Discount", -claim.order.discount],
      ] as const) {
        if (amount && !existingLines.data.some((line) => line.metadata?.rec_extra === name))
          await stripe.invoiceItems.create(
            {
              customer:
                typeof invoice.customer === "string" ? invoice.customer : invoice.customer!.id,
              invoice: invoice.id,
              amount,
              currency: "usd",
              description: name,
              metadata: { rec_extra: name },
            },
            { idempotencyKey: `rec-invoice-extra:${orderId}:${name}` },
          );
      }
      invoice = await stripe.invoices.retrieve(invoice.id);
      if (invoice.total !== claim.order.total)
        throw new Error(
          "Provider invoice total does not match the immutable order total. Review before sending.",
        );
      invoice = await stripe.invoices.finalizeInvoice(
        invoice.id,
        { auto_advance: false },
        { idempotencyKey: `rec-invoice-finalize:${orderId}` },
      );
    }
    if (
      invoice.total !== claim.order.total ||
      invoice.currency !== "usd" ||
      invoice.customer_email !== claim.order.customer_email
    )
      throw new Error("Invoice amount or recipient does not match the order.");
    if (action !== "create") {
      if (invoice.status !== "open") throw new Error("Only an open invoice can be sent.");
      const resendKey = claim.existing?.sent_at ?? "initial";
      invoice = await stripe.invoices.sendInvoice(
        invoice.id,
        {},
        { idempotencyKey: `rec-send:${orderId}:${action === "resend" ? resendKey : "initial"}` },
      );
    }
    await sql.transaction(async (tx) => {
      await tx`update commerce_invoices set state=${invoice.status ?? "unknown"},hosted_url=${invoice.hosted_invoice_url},pdf_url=${invoice.invoice_pdf},sent_at=case when ${action !== "create"} then now() else sent_at end,last_error=null,updated_at=now() where order_id=${orderId}`;
      await audit(
        tx,
        actor,
        action === "create"
          ? "invoice.created"
          : action === "send"
            ? "invoice.sent"
            : "invoice.resent",
        "order",
        orderId,
        null,
        {
          provider_id: invoice.id,
          delivery: invoice.livemode
            ? "submitted to Stripe; delivery not confirmed"
            : "test mode; no customer email sent",
        },
      );
    });
    return {
      id: invoice.id,
      url: invoice.hosted_invoice_url,
      state: invoice.status,
      testMode: !invoice.livemode,
    };
  } catch (error) {
    await sql`update commerce_invoices set state='error',last_error='Provider action failed; review and retry the same invoice.',updated_at=now() where order_id=${orderId}`;
    throw error;
  }
}
