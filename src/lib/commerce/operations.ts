import type { OrderRow } from "./types";
export const OPERATION_VIEWS = ["needs_payment", "needs_proof", "ready_to_make"] as const;
export function orderNextAction(
  order: Pick<OrderRow, "source" | "stage" | "payment_status" | "proof_status">,
) {
  if (["canceled", "completed", "delivered"].includes(order.stage))
    return {
      title: "Historical order",
      detail: "Review original records. Create a fresh order for new work.",
      target: "history",
    };
  if (order.source === "stripe_history_review" && order.stage === "new")
    return {
      title: "Review imported history",
      detail:
        "Confirm the original transaction and available specifications before scheduling work.",
      target: "specifications",
    };
  if (["disputed", "failed", "refunded", "partially_refunded"].includes(order.payment_status))
    return {
      title: "Review the financial record",
      detail: "Resolve the payment exception before collecting or advancing production.",
      target: "financial",
    };
  if (order.payment_status !== "paid")
    return {
      title: "Confirm payment",
      detail:
        "Review the outstanding balance and active payment links. Record external money only after independent verification.",
      target: "financial",
    };
  if (order.proof_status && !["approved", "not_required"].includes(order.proof_status))
    return {
      title:
        order.proof_status === "changes_requested"
          ? "Prepare the requested proof revision"
          : "Get current artwork approval",
      detail: "Payment is recorded. The current required proof must be approved before production.",
      target: "proof",
    };
  if (order.stage === "shipped")
    return {
      title: "Follow shipment progress",
      detail: "Tracking is recorded. Preserve shipping history and confirm delivery when known.",
      target: "fulfillment",
    };
  return {
    title: ["new", "artwork_review", "customer_approval", "ready_for_production"].includes(
      order.stage,
    )
      ? "Review and schedule production"
      : "Continue the production stage",
    detail:
      "Payment and required artwork approval are satisfied. Check the exact specifications, source files and stock before advancing.",
    target: "fulfillment",
  };
}
/** Predicates use reconciled ledger values and the current independent proof. */
export const OPERATION_FILTERS: Record<string, string> = {
  needs_payment:
    "o.id in (select id from (" +
    "ORDER_QUERY" +
    ") readiness where readiness.paid-readiness.refunded<readiness.total)",
  needs_proof:
    "o.id in (select id from (ORDER_QUERY) readiness where readiness.proof_status not in ('approved','not_required'))",
  ready_to_make:
    "o.id in (select id from (ORDER_QUERY) readiness where readiness.paid-readiness.refunded>=readiness.total and readiness.payment_status='paid' and readiness.proof_status in ('approved','not_required') and readiness.stage in ('new','artwork_review','customer_approval','ready_for_production'))",
};
