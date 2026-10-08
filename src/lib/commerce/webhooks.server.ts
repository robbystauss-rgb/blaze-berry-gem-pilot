import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import { stripeClient, paypalToken, paypalBase } from "./providers.server";
import { recordPayment, changeAllocation, audit, notify, orderById } from "./core.server";

export async function stripeWebhook(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });
  const body = await request.text();
  if (body.length > 1_000_000) return new Response("Payload too large", { status: 413 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      request.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (process.env.NODE_ENV !== "production" && event.livemode)
    return new Response("Live events are disabled in development", { status: 400 });
  try {
    await processStripeEvent(event, stripe);
    return Response.json({ received: true });
  } catch {
    console.error("[commerce] Stripe event could not be committed", event.id);
    return new Response("Retry event", { status: 500 });
  }
}
export async function processStripeEvent(event: Stripe.Event, stripe: Stripe) {
  const sql = await getSql();
  await sql.transaction(async (tx) => {
    const inserted =
      await tx`insert into commerce_events(provider,event_id,event_type) values('stripe',${event.id},${event.type}) on conflict do nothing returning event_id`;
    if (!inserted.length) return;
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed",
        "checkout.session.expired",
      ].includes(event.type)
    ) {
      const supplied = event.data.object as Stripe.Checkout.Session;
      const session = await stripe.checkout.sessions.retrieve(supplied.id, {
        expand: ["payment_intent.latest_charge.balance_transaction"],
      });
      const id = session.metadata?.rec_order_id;
      if (!id) return;
      const order = await orderById(tx, id, true);
      await tx`insert into commerce_checkouts(order_id,provider,reference) values(${id},'stripe',${session.id}) on conflict do nothing`;
      if (session.currency !== "usd" || session.amount_total !== order.total)
        throw new Error("Order amount mismatch");
      if (session.payment_status === "paid") {
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
          intent.amount_received !== order.total
        )
          throw new Error("Payment intent mismatch");
        const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
        const balance =
          charge && typeof charge.balance_transaction === "object"
            ? charge.balance_transaction
            : null;
        await recordPayment(tx, {
          orderId: id,
          provider: "stripe",
          reference: intent.id,
          kind: "payment",
          amount: intent.amount_received,
          occurredAt: new Date((charge?.created ?? event.created) * 1000).toISOString(),
          fee: balance?.fee ?? null,
        });
        if (session.collected_information?.shipping_details?.address)
          await tx`update commerce_orders set shipping_address=${JSON.stringify(session.collected_information.shipping_details.address)} where id=${id}`;
      } else if (
        event.type === "checkout.session.expired" ||
        event.type === "checkout.session.async_payment_failed"
      ) {
        if (!order.paid) {
          await changeAllocation(tx, id, "release", "stripe");
          await tx`update commerce_checkouts set state=${event.type === "checkout.session.expired" ? "expired" : "failed"} where order_id=${id}`;
          await tx`update commerce_orders set stage='canceled',version=version+1 where id=${id} and stage='new'`;
          await notify(tx, `payment-failed:${id}`, "Payment failed or checkout expired", id);
          await audit(tx, "stripe", "order.checkout_expired", "order", id);
        }
      }
    } else if (event.type.startsWith("invoice.")) {
      const supplied = event.data.object as Stripe.Invoice;
      const invoice = await stripe.invoices.retrieve(supplied.id);
      const id = invoice.metadata?.rec_order_id;
      if (!id) return;
      const [local] =
        await tx`select order_id from commerce_invoices where order_id=${id} and provider_id=${invoice.id}`;
      if (!local) return;
      await tx`update commerce_invoices set state=${invoice.status ?? "unknown"},hosted_url=${invoice.hosted_invoice_url},pdf_url=${invoice.invoice_pdf},updated_at=now() where order_id=${id}`;
      if (invoice.status === "paid") {
        // Invoice payment status alone can include credit or out-of-band payments. Count actual successful PaymentIntents only.
        const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 });
        if (payments.has_more) throw new Error("Invoice payment pagination needs reconciliation.");
        for (const payment of payments.data) {
          if (
            payment.status !== "paid" ||
            payment.payment.type !== "payment_intent" ||
            !payment.payment.payment_intent
          )
            continue;
          const reference =
            typeof payment.payment.payment_intent === "string"
              ? payment.payment.payment_intent
              : payment.payment.payment_intent.id;
          const intent = await stripe.paymentIntents.retrieve(reference);
          if (intent.status === "succeeded" && intent.currency === "usd" && payment.amount_paid)
            await recordPayment(tx, {
              orderId: id,
              provider: "stripe",
              reference,
              kind: "payment",
              amount: payment.amount_paid,
              occurredAt: new Date(event.created * 1000).toISOString(),
            });
        }
        await notify(tx, `invoice-paid:${id}`, "Invoice paid", id);
      }
      if (event.type === "invoice.payment_failed")
        await notify(tx, `invoice-failed:${event.id}`, "Invoice payment failed", id);
    } else if (event.type === "charge.refunded") {
      const supplied = event.data.object as Stripe.Charge;
      const charge = await stripe.charges.retrieve(supplied.id);
      const reference =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      const [payment] = await tx<{
        order_id: string;
      }>`select order_id from commerce_payments where provider='stripe' and reference=${reference ?? ""} and kind='payment'`;
      if (!payment) throw new Error("Payment must arrive before its refund");
      const refunds = await stripe.refunds.list({ charge: charge.id, limit: 100 });
      if (refunds.has_more) throw new Error("Refund pagination needs reconciliation");
      for (const refund of refunds.data) {
        if (refund.status === "succeeded" && refund.currency === "usd")
          await recordPayment(tx, {
            orderId: payment.order_id,
            provider: "stripe",
            reference: refund.id,
            kind: "refund",
            amount: refund.amount,
            occurredAt: new Date(refund.created * 1000).toISOString(),
          });
      }
    } else if (["refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
      const supplied = event.data.object as Stripe.Refund;
      const refund = await stripe.refunds.retrieve(supplied.id);
      const reference =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id;
      const [payment] = await tx<{
        order_id: string;
      }>`select order_id from commerce_payments where provider='stripe' and reference=${reference ?? ""} and kind='payment'`;
      if (!payment) throw new Error("Payment must arrive before refund");
      await orderById(tx, payment.order_id, true);
      await tx`update commerce_refund_requests set state=${refund.status === "succeeded" ? "succeeded" : refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending"},provider_reference=${refund.id},updated_at=now() where provider_reference=${refund.id} or (id::text=${refund.metadata?.rec_refund_request_id ?? ""} and order_id=${payment.order_id})`;
      if (refund.status === "succeeded" && refund.currency === "usd")
        await recordPayment(tx, {
          orderId: payment.order_id,
          provider: "stripe",
          reference: refund.id,
          kind: "refund",
          amount: refund.amount,
          occurredAt: new Date(refund.created * 1000).toISOString(),
        });
    } else if (event.type.startsWith("charge.dispute.")) {
      const dispute = event.data.object as Stripe.Dispute;
      const reference =
        typeof dispute.payment_intent === "string"
          ? dispute.payment_intent
          : dispute.payment_intent?.id;
      const [payment] = await tx<{
        order_id: string;
      }>`select order_id from commerce_payments where provider='stripe' and reference=${reference ?? ""} and kind='payment'`;
      if (!payment) throw new Error("Payment must arrive before dispute");
      await tx`insert into commerce_disputes(reference,order_id,state) values(${dispute.id},${payment.order_id},${dispute.status}) on conflict(reference) do update set state=excluded.state,updated_at=now()`;
      await notify(
        tx,
        `dispute:${event.id}`,
        "Payment dispute requires attention",
        payment.order_id,
      );
    }
  });
}
type PayPalEvent = {
  id: string;
  event_type: string;
  create_time: string;
  resource: {
    id: string;
    status: string;
    amount?: { currency_code: string; value: string };
    supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } };
    seller_receivable_breakdown?: { paypal_fee?: { value: string } };
    links?: Array<{ rel: string; href: string }>;
  };
};
export async function paypalWebhook(request: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID)
    return new Response("Webhook not configured", { status: 503 });
  const body = await request.text();
  if (body.length > 1_000_000) return new Response("Payload too large", { status: 413 });
  let event: PayPalEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  try {
    const token = await paypalToken();
    const headers = request.headers;
    const response = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: event,
      }),
    });
    const verified = (await response.json()) as { verification_status: string };
    if (!response.ok || verified.verification_status !== "SUCCESS")
      return new Response("Invalid signature", { status: 400 });
    const sql = await getSql();
    await sql.transaction(async (tx) => {
      const inserted =
        await tx`insert into commerce_events(provider,event_id,event_type) values('paypal',${event.id},${event.event_type}) on conflict do nothing returning event_id`;
      if (!inserted.length) return;
      const resource = event.resource;
      const related = resource.supplementary_data?.related_ids;
      if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const [checkout] = await tx<{
          order_id: string;
        }>`select order_id from commerce_checkouts where provider='paypal' and reference=${related?.order_id ?? ""}`;
        if (!checkout) throw new Error("Checkout association not available yet");
        if (resource.amount?.currency_code !== "USD") throw new Error("Currency mismatch");
        await recordPayment(tx, {
          orderId: checkout.order_id,
          provider: "paypal",
          reference: resource.id,
          kind: "payment",
          amount: Math.round(Number(resource.amount.value) * 100),
          occurredAt: event.create_time,
          fee: resource.seller_receivable_breakdown?.paypal_fee
            ? Math.round(Number(resource.seller_receivable_breakdown.paypal_fee.value) * 100)
            : null,
        });
      } else if (event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
        const captureId =
          related?.capture_id ??
          resource.links
            ?.find(
              (link) =>
                link.rel === "up" &&
                /^https:\/\/api(?:-m)?\.(?:sandbox\.)?paypal\.com\/v2\/payments\/captures\/[A-Z0-9]+$/i.test(
                  link.href,
                ),
            )
            ?.href.split("/")
            .pop();
        const [payment] = await tx<{
          order_id: string;
        }>`select order_id from commerce_payments where provider='paypal' and reference=${captureId ?? ""} and kind='payment'`;
        if (!payment) throw new Error("Capture must arrive before refund");
        if (resource.amount?.currency_code !== "USD") throw new Error("Currency mismatch");
        await recordPayment(tx, {
          orderId: payment.order_id,
          provider: "paypal",
          reference: resource.id,
          kind: "refund",
          amount: Math.round(Number(resource.amount.value) * 100),
          occurredAt: event.create_time,
        });
      } else if (event.event_type === "PAYMENT.CAPTURE.DENIED") {
        const [checkout] = await tx<{
          order_id: string;
        }>`select order_id from commerce_checkouts where provider='paypal' and reference=${related?.order_id ?? ""}`;
        if (checkout) {
          const order = await orderById(tx, checkout.order_id, true);
          await tx`update commerce_checkouts set state='failed' where order_id=${checkout.order_id} and state<>'paid'`;
          if (!order.paid && order.stage === "new") {
            await changeAllocation(tx, checkout.order_id, "release", "paypal");
            await tx`update commerce_orders set stage='canceled',version=version+1 where id=${checkout.order_id}`;
            await audit(tx, "paypal", "order.checkout_failed", "order", checkout.order_id);
          }
          await notify(tx, `paypal-failed:${event.id}`, "PayPal payment failed", checkout.order_id);
        }
      }
    });
    return Response.json({ received: true });
  } catch {
    console.error("[commerce] PayPal event could not be committed", event.id);
    return new Response("Retry event", { status: 500 });
  }
}
