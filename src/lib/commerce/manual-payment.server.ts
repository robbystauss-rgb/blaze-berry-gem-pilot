import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { assertPermission, orderById, recordPayment } from "./core.server";
import { manualPaymentSchema } from "./manual-payment";
import type { Role } from "./types";

export async function recordManualPayment(
  sql: Sql,
  payload: unknown,
  actor: { userId: string; role: Role },
) {
  assertPermission(actor.role, "finance");
  const p = manualPaymentSchema.parse(payload);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        id: p.id,
        amount: p.amount,
        method: p.method,
        reference: p.reference.toLowerCase(),
        reason: p.reason,
        occurredAt: p.occurredAt,
      }),
    )
    .digest("hex");
  // Serialize retries even when the same request/receipt is accidentally used for
  // two different orders. Locks are transaction-scoped (pooled Postgres safe).
  await sql`select pg_advisory_xact_lock(hashtext(${"manual-request:" + p.requestId}))`;
  await sql`select pg_advisory_xact_lock(hashtext(${"manual-receipt:" + p.reference.toLowerCase()}))`;
  const order = await orderById(sql, p.id, true);
  const receiptResult = async (receiptId: string, duplicate: boolean) => {
    const current = await orderById(sql, p.id);
    return {
      id: p.id,
      receiptId,
      duplicate,
      paid: current.paid,
      refunded: current.refunded,
      remaining: Math.max(0, current.total - current.paid + current.refunded),
      paymentStatus: current.payment_status,
    };
  };
  const [retry] = await sql<{
    id: string;
    request_fingerprint: string;
  }>`select id,request_fingerprint from commerce_payments where request_id=${p.requestId}`;
  if (retry) {
    if (retry.request_fingerprint !== fingerprint)
      throw Error(
        "This payment request was already used with different details. Review payment history before starting another receipt.",
      );
    return receiptResult(retry.id, true);
  }
  const [existing] = await sql<{
    id: string;
    order_id: string;
    amount: number;
    method: string | null;
    reason: string | null;
    occurred_at: string;
  }>`select id,order_id,amount,method,reason,occurred_at from commerce_payments where provider='manual' and lower(btrim(reference))=${p.reference.toLowerCase()} and kind='payment'`;
  if (existing) {
    if (
      existing.order_id === p.id &&
      existing.amount === p.amount &&
      existing.method === p.method &&
      existing.reason === p.reason &&
      new Date(existing.occurred_at).getTime() === Date.parse(p.occurredAt)
    )
      return receiptResult(existing.id, true);
    throw Error(
      "This receipt reference is already recorded. Review the existing payment; use a new reference only for a separate receipt.",
    );
  }
  if (new Date(p.occurredAt) > new Date())
    throw Error("The date received cannot be in the future.");
  if (order.stage === "canceled")
    throw Error("This order is canceled. Review the order before recording a new payment.");
  if (order.currency !== "usd") throw Error("Manual receipts currently require a USD order.");
  if (order.refunded > 0)
    throw Error(
      "This order has refunds. Finance must review the ledger before collecting another payment.",
    );
  if (p.amount > order.total - order.paid)
    throw Error(
      "Amount received exceeds the remaining order balance. Review payments before recording this receipt.",
    );
  const invoices =
    await sql`select order_id from commerce_invoices where order_id=${p.id} and state<>'void'`;
  if (invoices.length)
    throw Error(
      "A Stripe invoice is active or awaiting reconciliation. Review Invoice actions, void only an unpaid open invoice with Stripe confirmation, then retry. A Studio Invoice alone does not block an external receipt.",
    );
  if (
    (await sql`select order_id from commerce_checkouts where order_id=${p.id} and state<>'expired'`)
      .length
  )
    throw Error(
      "A checkout can still collect payment. Open Payment link safety below to expire and reconcile the checkout before recording an external receipt.",
    );
  if (
    ["stripe_checkout", "paypal_checkout", "catalog_checkout"].includes(order.source) &&
    !(await sql`select order_id from commerce_checkouts where order_id=${p.id} and state='expired'`)
      .length
  )
    throw Error(
      "The original checkout has not been reconciled. Finance must confirm provider expiry before an external receipt can be recorded.",
    );
  const pendingRefunds =
    await sql`select id from commerce_refund_requests where order_id=${p.id} and state in ('processing','pending','review_required')`;
  if (pendingRefunds.length)
    throw Error(
      "A refund is pending or needs review. Reconcile it before recording another payment.",
    );
  await recordPayment(sql, {
    orderId: p.id,
    provider: "manual",
    reference: p.reference,
    kind: "payment",
    amount: p.amount,
    occurredAt: p.occurredAt,
    actor: actor.userId,
    reason: p.reason,
    method: p.method,
    requestId: p.requestId,
    requestFingerprint: fingerprint,
  });
  const [saved] = await sql<{
    id: string;
  }>`select id from commerce_payments where request_id=${p.requestId}`;
  if (!saved)
    throw Error(
      "Receipt could not be confirmed. Refresh payment history before retrying the same request.",
    );
  return receiptResult(saved.id, false);
}
