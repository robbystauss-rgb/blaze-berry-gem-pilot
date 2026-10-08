import { randomUUID } from "node:crypto";
import type { Sql } from "@/lib/db";
import { PERMISSIONS, type Permission, type Role, type OrderRow } from "./types";

export function assertPermission(role: Role | null, permission: Permission) {
  if (!role || !PERMISSIONS[role].includes(permission))
    throw new Error("Access denied: this action requires a different staff permission.");
}
export async function audit(
  sql: Sql,
  actor: string,
  action: string,
  type: string,
  id: string,
  before: unknown = null,
  after: unknown = null,
) {
  await sql`insert into commerce_audit(id,actor_id,action,resource_type,resource_id,before_value,after_value)
 values(${randomUUID()},${actor},${action},${type},${id},${JSON.stringify(before)},${JSON.stringify(after)})`;
}
export async function notify(sql: Sql, key: string, title: string, orderId: string | null = null) {
  await sql`insert into commerce_notifications(id,event_key,title,order_id) values(${randomUUID()},${key},${title},${orderId}) on conflict(event_key) do nothing`;
}
export const ORDER_SELECT = `select o.*, coalesce(p.paid,0)::int as paid, coalesce(p.refunded,0)::int as refunded,
 case when exists(select 1 from commerce_disputes d where d.order_id=o.id and d.state not in ('won','lost','resolved')) then 'disputed'
 when coalesce(p.refunded,0)>0 and p.refunded>=p.paid then 'refunded'
 when coalesce(p.refunded,0)>0 then 'partially_refunded'
 when coalesce(p.paid,0)>=o.total and coalesce(p.paid,0)>0 then 'paid'
 when coalesce(p.paid,0)>0 then 'partially_paid'
 when exists(select 1 from commerce_checkouts c where c.order_id=o.id and c.state='failed') then 'failed'
 when exists(select 1 from commerce_checkouts c where c.order_id=o.id and c.state='pending') then 'pending' else 'unpaid' end as payment_status,
 coalesce((select string_agg(i.title,', ') from commerce_order_items i where i.order_id=o.id),'') as titles
 from commerce_orders o left join (select order_id,sum(amount) filter(where kind='payment') as paid,sum(amount) filter(where kind='refund') as refunded
 from commerce_payments group by order_id) p on p.order_id=o.id`;
export async function orderById(sql: Sql, id: string, lock = false) {
  if (lock) await sql`select id from commerce_orders where id=${id} for update`;
  const [order] = await sql.query<OrderRow>(`${ORDER_SELECT} where o.id=$1`, [id]);
  if (!order) throw new Error("Order not found.");
  return order;
}
export async function reserveInventory(sql: Sql, orderId: string, actor: string) {
  const rules = await sql<{
    inventory_id: string;
    quantity: number;
  }>`select r.inventory_id,sum(r.units_per_item*i.fulfilled_quantity)::int as quantity
 from commerce_order_items i join commerce_inventory_rules r on r.product_key=i.product_key where i.order_id=${orderId} group by r.inventory_id order by r.inventory_id`;
  for (const rule of rules) {
    const [stock] = await sql<{
      on_hand: number | null;
      reserved: number;
      committed: number;
    }>`select on_hand,reserved,committed from commerce_inventory where id=${rule.inventory_id} for update`;
    if (
      (
        await sql`select order_id from commerce_allocations where order_id=${orderId} and inventory_id=${rule.inventory_id}`
      ).length
    )
      continue;
    if (stock.on_hand === null)
      throw new Error("A mapped inventory item needs a verified stock count before checkout.");
    if (stock.on_hand - stock.reserved - stock.committed < rule.quantity)
      throw new Error("Not enough available stock for this order.");
    const inserted =
      await sql`insert into commerce_allocations(order_id,inventory_id,quantity,state) values(${orderId},${rule.inventory_id},${rule.quantity},'reserved') on conflict do nothing returning order_id`;
    if (!inserted.length) continue;
    await sql`update commerce_inventory set reserved=reserved+${rule.quantity},version=version+1 where id=${rule.inventory_id}`;
    await movement(
      sql,
      rule.inventory_id,
      orderId,
      0,
      rule.quantity,
      0,
      "Checkout reservation",
      actor,
      `reserve:${orderId}:${rule.inventory_id}`,
    );
  }
}
async function movement(
  sql: Sql,
  id: string,
  orderId: string | null,
  hand: number,
  reserved: number,
  committed: number,
  reason: string,
  actor: string,
  key: string,
) {
  await sql`insert into commerce_movements(id,inventory_id,order_id,on_hand_delta,reserved_delta,committed_delta,reason,actor_id,request_id)
 values(${randomUUID()},${id},${orderId},${hand},${reserved},${committed},${reason},${actor},${key})`;
  const [stock] = await sql<{
    on_hand: number | null;
    reserved: number;
    committed: number;
    threshold: number;
    version: number;
  }>`select * from commerce_inventory where id=${id}`;
  if (stock.on_hand !== null && stock.on_hand - stock.reserved - stock.committed <= stock.threshold)
    await notify(
      sql,
      `low:${id}:${stock.version}`,
      stock.on_hand - stock.reserved - stock.committed === 0
        ? "Product out of stock"
        : "Low inventory",
    );
}
export async function changeAllocation(
  sql: Sql,
  orderId: string,
  action: "commit" | "consume" | "release",
  actor: string,
) {
  const rows = await sql<{
    inventory_id: string;
    quantity: number;
    state: string;
  }>`select * from commerce_allocations where order_id=${orderId} order by inventory_id for update`;
  for (const a of rows) {
    if (a.state === "released" || a.state === "consumed") continue;
    if (action === "commit" && a.state !== "reserved") continue;
    const hand = action === "consume" ? -a.quantity : 0;
    const reserved = a.state === "reserved" ? -a.quantity : 0;
    const committed = action === "commit" ? a.quantity : a.state === "committed" ? -a.quantity : 0;
    const state =
      action === "commit" ? "committed" : action === "consume" ? "consumed" : "released";
    await sql`select id from commerce_inventory where id=${a.inventory_id} for update`;
    await sql`update commerce_inventory set on_hand=on_hand+${hand},reserved=reserved+${reserved},committed=committed+${committed},version=version+1 where id=${a.inventory_id}`;
    await sql`update commerce_allocations set state=${state} where order_id=${orderId} and inventory_id=${a.inventory_id}`;
    await movement(
      sql,
      a.inventory_id,
      orderId,
      hand,
      reserved,
      committed,
      `Order inventory ${action}`,
      actor,
      `${action}:${orderId}:${a.inventory_id}`,
    );
  }
}
export async function recordPayment(
  sql: Sql,
  input: {
    orderId: string;
    provider: string;
    reference: string;
    kind: "payment" | "refund";
    amount: number;
    occurredAt: string;
    fee?: number | null;
    actor?: string;
    reason?: string;
  },
) {
  const order = await orderById(sql, input.orderId, true);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new Error("Invalid payment amount.");
  const existing =
    await sql`select id,order_id,amount,fee from commerce_payments where provider=${input.provider} and reference=${input.reference} and kind=${input.kind}`;
  if (existing.length) {
    if (existing[0].order_id !== input.orderId || existing[0].amount !== input.amount)
      throw new Error(
        "Processor reference belongs to a different financial record. Reconcile before retrying.",
      );
    if (
      existing[0].fee === null &&
      input.fee !== null &&
      input.fee !== undefined &&
      Number.isSafeInteger(input.fee)
    ) {
      await sql`update commerce_payments set fee=${input.fee} where id=${existing[0].id} and fee is null`;
      await audit(
        sql,
        input.actor ?? input.provider,
        "payment.fee_recorded",
        "order",
        input.orderId,
        null,
        { reference: input.reference, fee: input.fee },
      );
    }
    return false;
  }
  if (input.kind === "refund" && input.amount > order.paid - order.refunded)
    throw new Error("Refund exceeds collected payment.");
  if (input.kind === "payment" && order.paid + input.amount > order.total)
    throw new Error("Payment exceeds order balance; reconcile provider records.");
  const rows =
    await sql`insert into commerce_payments(id,order_id,provider,reference,kind,amount,occurred_at,fee,actor_id,reason)
 values(${randomUUID()},${input.orderId},${input.provider},${input.reference},${input.kind},${input.amount},${input.occurredAt},${input.fee ?? null},${input.actor ?? null},${input.reason ?? null}) on conflict do nothing returning id`;
  if (!rows.length) return false;
  if (input.kind === "refund")
    await sql`update commerce_refund_requests set state='succeeded',updated_at=now() where provider_reference=${input.reference}`;
  if (input.kind === "payment") {
    await sql`update commerce_checkouts set state='paid' where order_id=${input.orderId}`;
    if (order.paid + input.amount >= order.total) {
      if (order.stage === "canceled")
        await notify(
          sql,
          `paid-canceled:${input.orderId}`,
          "Payment received for canceled order: review required",
          input.orderId,
        );
      else await changeAllocation(sql, input.orderId, "commit", input.actor ?? input.provider);
      await notify(sql, `paid:${input.orderId}`, "New paid order", input.orderId);
    }
  }
  await audit(
    sql,
    input.actor ?? input.provider,
    input.kind === "refund" ? "payment.refunded" : "payment.received",
    "order",
    input.orderId,
    null,
    { provider: input.provider, reference: input.reference, amount: input.amount },
  );
  return true;
}
export async function adjustInventory(
  sql: Sql,
  input: { id: string; version: number; delta: number; reason: string; requestId: string },
  actor: string,
) {
  if (
    await sql`select id from commerce_movements where request_id=${input.requestId}`.then(
      (r) => r.length,
    )
  )
    return;
  const [stock] = await sql<{
    on_hand: number | null;
    version: number;
    reserved: number;
    committed: number;
  }>`select * from commerce_inventory where id=${input.id} for update`;
  if (
    await sql`select id from commerce_movements where request_id=${input.requestId}`.then(
      (r) => r.length,
    )
  )
    return;
  if (!stock) throw new Error("Inventory item not found.");
  if (stock.version !== input.version)
    throw new Error("Stock changed. Refresh and review the count.");
  const next = (stock.on_hand ?? 0) + input.delta;
  if (next < stock.reserved + stock.committed)
    throw new Error("Count cannot be below reserved and committed stock.");
  await sql`update commerce_inventory set on_hand=${next},version=version+1 where id=${input.id}`;
  await movement(sql, input.id, null, input.delta, 0, 0, input.reason, actor, input.requestId);
  await audit(sql, actor, "inventory.adjusted", "inventory", input.id, stock, {
    on_hand: next,
    reason: input.reason,
  });
}
