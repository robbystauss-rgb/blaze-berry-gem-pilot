import type Stripe from "stripe";
import { getSql } from "@/lib/db";
import { assertPermission, audit, orderById } from "./core.server";
import { stripeClient } from "./providers.server";
import type { Role } from "./types";

export async function expireCheckoutForOfflinePayment(
  orderId: string,
  actor: { userId: string; role: Role },
  client?: Stripe,
) {
  assertPermission(actor.role, "finance");
  const sql = await getSql();
  const [checkout] = await sql<{
    reference: string;
    provider: string;
    state: string;
  }>`select reference,provider,state from commerce_checkouts where order_id=${orderId}`;
  if (!checkout || checkout.state !== "pending")
    throw Error("There is no pending checkout to expire. Refresh payment history.");
  if (checkout.provider !== "stripe")
    throw Error(
      "This PayPal checkout needs provider review. Confirm its authorization/capture state with finance before recording an external payment; it cannot be expired here.",
    );
  const stripe = client ?? stripeClient();
  let session = await stripe.checkout.sessions.retrieve(checkout.reference);
  const verify = () => {
    if (session.metadata?.rec_order_id !== orderId)
      throw Error("Checkout association does not match this order. Reconciliation is required.");
    if (
      session.payment_status !== "unpaid" ||
      session.status === "complete" ||
      session.payment_intent
    )
      throw Error(
        "Stripe reports a completed checkout or a payment attempt. Reconcile that payment with Stripe before recording an external receipt.",
      );
  };
  verify();
  if (session.status === "open")
    session = await stripe.checkout.sessions.expire(
      session.id,
      {},
      { idempotencyKey: `rec-offline-expire:${orderId}:${session.id}` },
    );
  verify();
  if (session.status !== "expired")
    throw Error("Stripe has not confirmed checkout expiry. The external payment remains blocked.");
  return sql.transaction(async (tx) => {
    const order = await orderById(tx, orderId, true);
    if (order.paid > 0)
      throw Error("A payment arrived while expiring this checkout. Reconcile the payment history.");
    const updated =
      await tx`update commerce_checkouts set state='expired' where order_id=${orderId} and provider='stripe' and reference=${session.id} and state='pending' returning reference`;
    if (updated.length)
      await audit(
        tx,
        actor.userId,
        "checkout.expired_for_external_receipt",
        "order",
        orderId,
        { state: "pending" },
        { state: "expired", provider: "stripe" },
      );
    return { id: orderId, state: "expired" };
  });
}
