import { getSql } from "@/lib/db";
import { ORDER_SELECT, orderById } from "./core.server";
import type {
  Role,
  OrderRow,
  ItemRow,
  InventoryRow,
  ProductRow,
  VariantRow,
  AuditRow,
  InvoiceRow,
  PaymentRow,
  CustomerRow,
  NoteRow,
} from "./types";

export type ReadInput = {
  section: string;
  search: string;
  page: number;
  from?: string;
  to?: string;
  status: string;
};
export type AdminData = {
  orders: OrderRow[];
  inventory: InventoryRow[];
  products: ProductRow[];
  builderProducts: ProductRow[];
  variants: VariantRow[];
  customers: CustomerRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  audit: AuditRow[];
  notifications: {
    id: string;
    title: string;
    order_id: string | null;
    created_at: string;
    is_read: boolean;
  }[];
  staff: { user_id: string; role: Role; active: boolean; name: string; email: string }[];
  content: { key: string; value: string; version: number }[];
  rules: { product_key: string; inventory_id: string; units_per_item: number }[];
  movements: {
    id: string;
    inventory_id: string;
    reason: string;
    on_hand_delta: number;
    reserved_delta: number;
    committed_delta: number;
    actor_id: string;
    created_at: string;
  }[];
  metrics: Record<string, number>;
  trend: { day: string; collected: number; refunds: number }[];
  topProducts: { product_key: string; title: string; quantity: number }[];
  total: number;
  config: {
    stripe: boolean;
    paypal: boolean;
    invoices: boolean;
    sender: string | null;
    historicalWarning: string;
    version: string | null;
  };
};
export function financialConfig() {
  return {
    stripe: !!process.env.STRIPE_SECRET_KEY,
    paypal: !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET,
    invoices:
      !!process.env.STRIPE_SECRET_KEY &&
      process.env.REC_INVOICE_BRANDING_VERIFIED === "true" &&
      !!process.env.REC_INVOICE_SENDER &&
      !!process.env.STRIPE_WEBHOOK_SECRET,
    sender:
      process.env.REC_INVOICE_BRANDING_VERIFIED === "true"
        ? (process.env.REC_INVOICE_SENDER ?? null)
        : null,
    historicalWarning:
      "Orders are captured from activation onward. Earlier processor transactions need reconciliation; unavailable artwork and historical specifications cannot be recreated.",
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  };
}
export async function readAdmin(
  input: ReadInput,
  actor: { userId: string; role: Role },
): Promise<AdminData> {
  const sql = await getSql();
  const from = input.from ?? new Date(Date.now() - 30 * 86400000).toISOString();
  const to = input.to ?? new Date().toISOString();
  if (new Date(from) >= new Date(to)) throw new Error("Choose an end date after the start date.");
  const result: AdminData = {
    orders: [],
    inventory: [],
    products: [],
    builderProducts: [],
    variants: [],
    customers: [],
    invoices: [],
    payments: [],
    audit: [],
    notifications: [],
    staff: [],
    content: [],
    rules: [],
    movements: [],
    metrics: {},
    trend: [],
    topProducts: [],
    total: 0,
    config: financialConfig(),
  };
  const search = `%${input.search}%`;
  if (["orders", "production", "payments"].includes(input.section)) {
    const production = input.section === "production";
    const where = `where ($1='' or o.customer_name ilike $2 or o.customer_email ilike $2 or o.number::text ilike $2 or exists(select 1 from commerce_order_items i where i.order_id=o.id and (i.title ilike $2 or i.specifications::text ilike $2)))
   and ($3='' or ${input.section === "payments" ? `o.id in (select id from (${ORDER_SELECT}) financial where financial.payment_status=$3)` : "o.stage=$3"}) and ($4::timestamptz is null or o.created_at>=$4) and ($5::timestamptz is null or o.created_at<$5)
   and (not $6 or o.stage not in ('completed','canceled','shipped','delivered')) and ($7::text is null or o.assigned_to=$7)`;
    const params = [
      input.search,
      search,
      input.status,
      input.from ?? null,
      input.to ?? null,
      production,
      actor.role === "production" ? actor.userId : null,
    ];
    result.orders = await sql.query<OrderRow>(
      `${ORDER_SELECT} ${where} order by o.created_at desc limit 50 offset $8`,
      [...params, input.page * 50],
    );
    const [count] = await sql.query<{ count: number }>(
      `select count(*)::int as count from commerce_orders o ${where}`,
      params,
    );
    result.total = count.count;
    if (actor.role === "production")
      result.orders = result.orders.map((o) => ({
        ...o,
        customer_email: "",
        shipping_address: null,
        total: 0,
        subtotal: 0,
        discount: 0,
        shipping: 0,
        tax: 0,
        paid: 0,
        refunded: 0,
      }));
    if (input.section === "payments") {
      result.invoices =
        await sql<InvoiceRow>`select * from commerce_invoices where order_id=any(${result.orders.map((o) => o.id)}::text[])`;
      result.payments =
        await sql<PaymentRow>`select * from commerce_payments where order_id=any(${result.orders.map((o) => o.id)}::text[]) order by occurred_at desc`;
    }
  }
  if (input.section === "inventory") {
    const where = `where (title ilike $1 or sku ilike $1) and ($2='' or ($2='setup_required' and on_hand is null) or ($2='low_stock' and on_hand-reserved-committed<=threshold) or ($2='out_of_stock' and on_hand-reserved-committed<=0) or ($2='available' and on_hand-reserved-committed>0))`;
    result.inventory = await sql.query<InventoryRow>(
      `select * from commerce_inventory ${where} order by title limit 50 offset $3`,
      [search, input.status, input.page * 50],
    );
    const [count] = await sql.query<{ count: number }>(
      `select count(*)::int as count from commerce_inventory ${where}`,
      [search, input.status],
    );
    result.total = count.count;
    result.rules = await sql<
      AdminData["rules"][number]
    >`select * from commerce_inventory_rules where inventory_id=any(${result.inventory.map((i) => i.id)}::text[])`;
    result.movements = await sql<
      AdminData["movements"][number]
    >`select * from commerce_movements where inventory_id=any(${result.inventory.map((i) => i.id)}::text[]) order by created_at desc limit 100`;
  }
  if (input.section === "products") {
    result.builderProducts =
      await sql<ProductRow>`select * from commerce_products where builder_family is not null order by builder_family`;
    result.products =
      await sql<ProductRow>`select * from commerce_products where builder_family is null and (title ilike ${search} or category ilike ${search}) and (${input.status}='' or state=${input.status}) order by updated_at desc limit 50 offset ${input.page * 50}`;
    const [count] = await sql<{
      count: number;
    }>`select count(*)::int as count from commerce_products where builder_family is null and (title ilike ${search} or category ilike ${search}) and (${input.status}='' or state=${input.status})`;
    result.total = count.count;
    result.variants =
      await sql<VariantRow>`select * from commerce_variants where product_id=any(${result.products.map((p) => p.id)}::text[]) order by title`;
  }
  if (input.section === "customers") {
    result.customers =
      await sql<CustomerRow>`select lower(o.customer_email) as email,max(o.customer_name) as name,count(*)::int as order_count,
  coalesce(sum(p.paid),0)::int as paid,coalesce(sum(p.refunded),0)::int as refunded,count(*) filter(where o.stage not in ('completed','canceled'))::int as open_orders,
  count(*) filter(where i.state in ('open','draft','creating'))::int as unpaid_invoices from commerce_orders o
  left join(select order_id,sum(amount) filter(where kind='payment') as paid,sum(amount) filter(where kind='refund') as refunded from commerce_payments group by order_id)p on p.order_id=o.id
  left join commerce_invoices i on i.order_id=o.id where o.customer_name ilike ${search} or o.customer_email ilike ${search}
  group by lower(o.customer_email) order by max(o.created_at) desc limit 50 offset ${input.page * 50}`;
    const [count] = await sql<{
      count: number;
    }>`select count(distinct lower(customer_email))::int as count from commerce_orders where customer_name ilike ${search} or customer_email ilike ${search}`;
    result.total = count.count;
  }
  if (input.section === "website")
    result.content = await sql<
      AdminData["content"][number]
    >`select * from commerce_content order by key`;
  if (input.section === "activity") {
    result.audit =
      await sql<AuditRow>`select a.*,coalesce(u.name,a.actor_id) as actor_name from commerce_audit a left join "user" u on u.id=a.actor_id
  where (a.action ilike ${search} or a.resource_id ilike ${search} or a.actor_id ilike ${search} or u.name ilike ${search}) and (${input.status}='' or a.resource_type=${input.status})
  and (${input.from ?? null}::timestamptz is null or a.created_at>=${input.from ?? null}) and (${input.to ?? null}::timestamptz is null or a.created_at<${input.to ?? null}) order by created_at desc limit 50 offset ${input.page * 50}`;
    const [count] = await sql<{
      count: number;
    }>`select count(*)::int as count from commerce_audit a left join "user" u on u.id=a.actor_id where (a.action ilike ${search} or a.resource_id ilike ${search} or a.actor_id ilike ${search} or u.name ilike ${search}) and (${input.status}='' or a.resource_type=${input.status}) and (${input.from ?? null}::timestamptz is null or a.created_at>=${input.from ?? null}) and (${input.to ?? null}::timestamptz is null or a.created_at<${input.to ?? null})`;
    result.total = count.count;
  }
  if (input.section === "staff")
    result.staff = await sql<
      AdminData["staff"][number]
    >`select s.*,u.name,u.email from merchant_staff s join "user" u on u.id=s.user_id order by s.role,u.name`;
  if (input.section === "notifications") {
    result.notifications = await sql<
      AdminData["notifications"][number]
    >`select n.*,r.user_id is not null as is_read from commerce_notifications n left join commerce_notification_reads r on r.notification_id=n.id and r.user_id=${actor.userId} order by n.created_at desc limit 50 offset ${input.page * 50}`;
    const [count] = await sql<{
      count: number;
    }>`select count(*)::int as count from commerce_notifications`;
    result.total = count.count;
  }
  if (["overview", "reports"].includes(input.section)) {
    const [metrics] = await sql<Record<string, number>>`select
  coalesce(sum(amount) filter(where kind='payment' and occurred_at>=${from} and occurred_at<${to}),0)::int as collected,
  coalesce(sum(amount) filter(where kind='refund' and occurred_at>=${from} and occurred_at<${to}),0)::int as refunds,
  coalesce(sum(case when kind='payment' then amount else -amount end) filter(where occurred_at>=${from} and occurred_at<${to}),0)::int as net_collected,
  coalesce(sum(amount) filter(where kind='payment' and occurred_at>=${from}::timestamptz-(${to}::timestamptz-${from}::timestamptz) and occurred_at<${from}),0)::int as previous_collected,
  coalesce(sum(amount) filter(where kind='payment' and occurred_at>=date_trunc('day',now() at time zone 'America/Chicago') at time zone 'America/Chicago'),0)::int as today,
  coalesce(sum(amount) filter(where kind='payment' and occurred_at>=now()-interval '7 days'),0)::int as days7,
  coalesce(sum(amount) filter(where kind='payment' and occurred_at>=now()-interval '30 days'),0)::int as days30,
  coalesce(sum(amount) filter(where kind='payment' and occurred_at>=now()-interval '90 days'),0)::int as days90 from commerce_payments`;
    const [counts] = await sql<
      Record<string, number>
    >`select count(*)::int as orders,count(*) filter(where stage='new' and source<>'stripe_history_review')::int as new_orders,
  count(*) filter(where stage='new' and source='stripe_history_review')::int as history_review,
  count(*) filter(where stage='completed')::int as completed,count(*) filter(where stage in ('shipped','delivered','completed'))::int as fulfilled,
  count(*) filter(where stage in ('artwork_review','customer_approval','ready_for_production','engraving','assembly','quality_check','packaging'))::int as production,
  count(*) filter(where stage='ready_to_ship')::int as ready_to_ship,
  count(*) filter(where stage<>'canceled' and total>coalesce((select sum(amount) from commerce_payments p where p.order_id=o.id and kind='payment'),0))::int as awaiting_payment from commerce_orders o`;
    const [stock] = await sql<
      Record<string, number>
    >`select count(*) filter(where on_hand is not null and on_hand-reserved-committed<=threshold)::int as low_stock,count(*) filter(where on_hand is null)::int as stock_setup from commerce_inventory`;
    const [invoices] = await sql<{
      open_invoices: number;
    }>`select count(*)::int as open_invoices from commerce_invoices where state in ('open','draft','creating')`;
    result.metrics = { ...metrics, ...counts, ...stock, ...invoices };
    result.trend = await sql<
      AdminData["trend"][number]
    >`select (occurred_at at time zone 'America/Chicago')::date::text as day,
  coalesce(sum(amount) filter(where kind='payment'),0)::int as collected,coalesce(sum(amount) filter(where kind='refund'),0)::int as refunds from commerce_payments where occurred_at>=${from} and occurred_at<${to} group by day order by day`;
    result.topProducts = await sql<
      AdminData["topProducts"][number]
    >`select i.product_key,max(i.title) as title,sum(i.quantity)::int as quantity from commerce_order_items i join commerce_orders o on o.id=i.order_id
  where o.created_at>=${from} and o.created_at<${to} and o.total<=coalesce((select sum(amount) from commerce_payments p where p.order_id=o.id and kind='payment'),0) group by i.product_key order by quantity desc limit 20`;
    result.orders = await sql.query<OrderRow>(`${ORDER_SELECT} order by o.created_at desc limit 8`);
    result.audit =
      await sql<AuditRow>`select a.*,coalesce(u.name,a.actor_id) as actor_name from commerce_audit a left join "user" u on u.id=a.actor_id order by created_at desc limit 8`;
  }
  return result;
}
export async function readOrder(id: string, actor: { userId: string; role: Role }) {
  const sql = await getSql();
  let order = await orderById(sql, id);
  if (actor.role === "production" && order.assigned_to !== actor.userId)
    throw new Error("Access denied: this order is not assigned to you.");
  const items =
    await sql<ItemRow>`select id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork is not null as has_artwork,artwork_type from commerce_order_items where order_id=${id}`;
  const notes =
    await sql<NoteRow>`select id,actor_id,body,created_at from commerce_notes where order_id=${id} order by created_at`;
  const audit =
    await sql<AuditRow>`select a.*,coalesce(u.name,a.actor_id) as actor_name from commerce_audit a left join "user" u on u.id=a.actor_id where resource_type='order' and resource_id=${id} order by created_at`;
  const payments =
    actor.role === "owner"
      ? await sql<PaymentRow>`select * from commerce_payments where order_id=${id} order by occurred_at`
      : [];
  const [invoice] =
    actor.role === "owner"
      ? await sql<InvoiceRow>`select * from commerce_invoices where order_id=${id}`
      : [];
  if (actor.role === "production") {
    order = {
      ...order,
      customer_email: "",
      shipping_address: null,
      total: 0,
      subtotal: 0,
      discount: 0,
      shipping: 0,
      tax: 0,
      paid: 0,
      refunded: 0,
    };
    items.forEach((i) => {
      i.unit_amount = 0;
      delete i.specifications.customerEmail;
      delete i.specifications.customerName;
    });
  }
  return {
    order,
    items,
    notes,
    audit:
      actor.role === "production"
        ? audit
            .filter((a) => a.action.startsWith("order."))
            .map((a) => ({ ...a, before_value: null, after_value: null }))
        : audit,
    payments,
    invoice: invoice ?? null,
  };
}
