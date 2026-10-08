import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import { audit, orderById } from "./core.server";
import { stripeClient } from "./providers.server";
export async function voidInvoice(orderId: string, actor: string, client?: Stripe) {
  const sql = await getSql(),
    stripe = client ?? stripeClient();
  const claimed = await sql.transaction(async (tx) => {
    const order = await orderById(tx, orderId, true);
    if (order.paid > 0) throw new Error("Collected orders cannot have their invoices voided here.");
    const [invoice] = await tx<{
      provider_id: string;
      state: string;
      updated_at: string;
    }>`select * from commerce_invoices where order_id=${orderId} for update`;
    if (!invoice?.provider_id) throw new Error("No provider invoice exists.");
    if (
      invoice.state === "processing" &&
      Date.now() - new Date(invoice.updated_at).getTime() < 120000
    )
      throw new Error("Invoice action is already in progress.");
    await tx`update commerce_invoices set state='processing',updated_at=now() where order_id=${orderId}`;
    return invoice;
  });
  try {
    let invoice = await stripe.invoices.retrieve(claimed.provider_id);
    if (invoice.metadata?.rec_order_id !== orderId)
      throw new Error("Invoice association does not match this order.");
    if (invoice.status !== "open" && invoice.status !== "void")
      throw new Error(
        "Only an unpaid open invoice can be voided. Reconcile provider payments before continuing.",
      );
    if (invoice.status === "open")
      invoice = await stripe.invoices.voidInvoice(
        invoice.id,
        {},
        { idempotencyKey: `rec-invoice-void:${orderId}` },
      );
    if (invoice.status !== "void")
      throw new Error("Provider did not confirm the invoice was voided.");
    await sql.transaction(async (tx) => {
      const order = await orderById(tx, orderId, true);
      if (order.paid > 0)
        throw new Error("A payment arrived during this action. Reconcile the provider record.");
      await tx`update commerce_invoices set state='void',hosted_url=${invoice.hosted_invoice_url},pdf_url=${invoice.invoice_pdf},last_error=null,updated_at=now() where order_id=${orderId}`;
      if (claimed.state !== "void")
        await audit(
          tx,
          actor,
          "invoice.voided",
          "order",
          orderId,
          { state: claimed.state },
          { state: "void", provider_id: invoice.id },
        );
    });
    return {
      id: invoice.id,
      url: invoice.hosted_invoice_url,
      state: invoice.status,
      testMode: !invoice.livemode,
    };
  } catch (error) {
    await sql`update commerce_invoices set state='error',last_error='Invoice void failed. Reconcile the provider record before manual payment.',updated_at=now() where order_id=${orderId}`;
    throw error;
  }
}
