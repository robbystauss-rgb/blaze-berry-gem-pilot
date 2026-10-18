import type { Sql } from "@/lib/db";
import type { OrderRow } from "./types";
export async function proofReadiness(sql: Sql, orderId: string) {
  const [r] = await sql<{
    required: boolean;
    configured: boolean;
    state: string | null;
    proof_version: number | null;
    expired: boolean | null;
  }>`select coalesce(c.required,o.stage='customer_approval') as required,c.order_id is not null as configured,d.state,d.proof_version,(d.expires_at<=now()) as expired from commerce_orders o left join commerce_proof_controls c on c.order_id=o.id left join commerce_studio_documents d on d.id=c.current_proof_id where o.id=${orderId}`;
  return {
    configured: r?.configured ?? false,
    required: r?.required ?? false,
    status: r?.required ? (r.state ?? "awaiting_approval") : "not_required",
    proofVersion: r?.proof_version ?? null,
    blocked: !!r?.required && r.state !== "approved",
  };
}
/** Caller holds the existing order row lock; proof issuance/response takes the same lock. */
export async function assertProofReady(sql: Sql, order: OrderRow) {
  const p = await proofReadiness(sql, order.id);
  if (p.blocked || (order.stage === "customer_approval" && !p.configured))
    throw Error("Artwork Approval Hold: the current proof must be approved before production.");
}
