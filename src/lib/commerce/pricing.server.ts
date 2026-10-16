import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql, type Sql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { DEFAULT_PRICING, promotionSchema, type PriceBook } from "./owner-schemas";
import {
  calculatePrice,
  promotionEligible,
  type PriceSelection,
  type Promotion,
} from "./price-calculation";
import { assertPermission, audit } from "./core.server";
import type { Role } from "./types";
export async function rateLimit(scope: string, maximum: number) {
  let address = "local-test";
  try {
    const h = getRequest().headers;
    address = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  } catch {
    /* Isolated integration calls have no HTTP request. */
  }
  const sql = await getSql(),
    key = scope + ":" + createHash("sha256").update(address).digest("hex");
  const [row] = await sql<{
    hits: number;
  }>`insert into commerce_rate_limits(key,hits,resets_at) values(${key},1,now()+interval '1 minute') on conflict(key) do update set hits=case when commerce_rate_limits.resets_at<now() then 1 else commerce_rate_limits.hits+1 end,resets_at=case when commerce_rate_limits.resets_at<now() then now()+interval '1 minute' else commerce_rate_limits.resets_at end returning hits`;
  if (row.hits > maximum) throw Error("Too many attempts. Please wait a minute and try again.");
}
export async function priceBook(sql?: Sql) {
  const tx = sql ?? (await getSql());
  const [row] = await tx<{
    published: PriceBook | null;
    published_revision: number;
  }>`select published,published_revision from commerce_documents where scope='pricing' and key='main'`;
  return {
    book: row?.published ?? DEFAULT_PRICING,
    revision: row?.published ? row.published_revision : 0,
  };
}
type Identity = { id: string; email: string | null } | null;
async function identityEligible(
  tx: Sql,
  p: Promotion,
  identity: Identity,
  email: string,
  orderId?: string,
) {
  const d = p.definition;
  if (d.customerEmail || d.firstOrder || d.perCustomer) {
    const [account] = await tx<{
      emailVerified: boolean;
    }>`select "emailVerified" from "user" where id=${identity?.id ?? ""}`;
    if (!account?.emailVerified) return false;
  }
  if (
    (d.customerEmail || d.firstOrder || d.perCustomer) &&
    (!identity?.email || identity.email.toLowerCase() !== email.toLowerCase())
  )
    return false;
  if (d.customerEmail && d.customerEmail.toLowerCase() !== identity?.email?.toLowerCase())
    return false;
  if (d.firstOrder) {
    const history =
      await tx`select o.id from commerce_orders o where (o.customer_user_id=${identity?.id ?? ""} or lower(o.customer_email)=lower(${email})) and o.id<>${orderId ?? ""} and (exists(select 1 from commerce_payments p where p.order_id=o.id and p.kind='payment') or exists(select 1 from commerce_promotion_uses u where u.order_id=o.id and u.state in ('reserved','redeemed'))) limit 1`;
    if (history.length) return false;
  }
  const [counts] = await tx<{
    total: number;
    customer: number;
  }>`select count(*)::int as total,count(*) filter(where customer_key=${identity?.id ?? ""})::int as customer from commerce_promotion_uses where promotion_id=${p.id} and state in ('reserved','redeemed') and order_id<>${orderId ?? ""}`;
  return (
    (!d.maximumUses || counts.total < d.maximumUses) &&
    (!d.perCustomer || counts.customer < d.perCustomer)
  );
}
export async function quoteSelection(
  s: PriceSelection,
  code: string,
  email = "",
  connection?: Sql,
  identity?: Identity,
  orderId?: string,
) {
  const sql = connection ?? (await getSql()),
    user = identity === undefined ? await getSessionUser() : identity;
  if (connection) await sql`select pg_advisory_xact_lock(hashtext('promotion-configuration'))`;
  await (await import("./availability.server")).checkBuildAvailability(sql, s, orderId);
  const { book, revision } = await priceBook(sql);
  const normalized = code.trim().toUpperCase();
  if (normalized && !/^[A-Z0-9_-]{3,40}$/.test(normalized))
    throw Error("This promotion is not available for this order.");
  const promos =
    await sql<Promotion>`select * from commerce_promotions where state='active' and (code=${normalized} or definition->>'automatic'='true') order by id`;
  if (connection)
    for (const p of promos)
      await sql`select id from commerce_promotions where id=${p.id} for update`;
  // Read again after the row locks: an owner may have deactivated a code while waiting.
  const fresh = connection
    ? await sql<Promotion>`select * from commerce_promotions where state='active' and (code=${normalized} or definition->>'automatic'='true') order by id`
    : promos;
  const base = calculatePrice(s, book);
  let best = base,
    manualValid = !normalized;
  for (const p of fresh) {
    if (
      !promotionEligible(p, s, base.subtotalCents, Date.now()) ||
      !(await identityEligible(sql, p, user, email, orderId))
    )
      continue;
    const amount =
      p.definition.type === "percent"
        ? Math.round((base.subtotalCents * p.definition.amount) / 100)
        : p.definition.amount * (p.definition.perItem ? s.quantity : 1);
    if (amount >= base.subtotalCents) continue;
    if (p.code === normalized) manualValid = true;
    const result = calculatePrice(s, book, p);
    if (result.totalCents < best.totalCents) best = result;
  }
  if (!manualValid)
    throw Error(
      "This promotion is not available for this order. Check eligibility, dates and sign-in requirements.",
    );
  return { ...best, priceRevision: revision };
}
export async function reservePromotion(
  tx: Sql,
  orderId: string,
  selection: PriceSelection,
  code: string,
  email: string,
  expected: Awaited<ReturnType<typeof quoteSelection>>,
  user: Identity,
) {
  await tx`select pg_advisory_xact_lock(hashtext('document:pricing:main'))`;
  const actual = await quoteSelection(selection, code, email, tx, user, orderId);
  if (
    actual.totalCents !== expected.totalCents ||
    actual.priceRevision !== expected.priceRevision ||
    actual.promotionId !== expected.promotionId ||
    actual.promotionVersion !== expected.promotionVersion
  )
    throw Error(
      "Pricing or promotion availability changed. Review your updated quote before checkout.",
    );
  if (actual.promotionId)
    await tx`insert into commerce_promotion_uses(order_id,promotion_id,customer_key,discount,state) values(${orderId},${actual.promotionId},${user?.id ?? "guest:" + createHash("sha256").update(email.toLowerCase()).digest("hex")},${actual.discountCents},'reserved')`;
}
export async function savePromotion(raw: unknown, actor: { userId: string; role: Role }) {
  assertPermission(actor.role, "finance");
  const p = promotionSchema.parse(raw),
    sql = await getSql();
  await sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('promotion-configuration'))`;
    await tx`select pg_advisory_xact_lock(hashtext(${"promotion:" + p.id}))`;
    const [before] =
      await tx<Promotion>`select * from commerce_promotions where id=${p.id} for update`;
    if ((before?.version ?? 0) !== p.version)
      throw Error("Promotion changed. Refresh before saving.");
    if (
      before &&
      before.code !== p.code &&
      (await tx`select order_id from commerce_promotion_uses where promotion_id=${p.id} limit 1`)
        .length
    )
      throw Error(
        "Duplicate this promotion to use a new code; redemption history keeps its original code.",
      );
    await tx`insert into commerce_promotions(id,code,definition,state) values(${p.id},${p.code},${JSON.stringify(p.definition)},${p.state}) on conflict(id) do update set code=excluded.code,definition=excluded.definition,state=excluded.state,version=commerce_promotions.version+1`;
    await audit(tx, actor.userId, "promotion.saved", "promotion", p.id, before ?? null, p);
  });
}
export async function promotionList() {
  const sql = await getSql();
  return sql<
    Promotion & { redemptions: number; discount_value: number; reservations: number }
  >`select p.*,count(u.order_id) filter(where u.state='redeemed')::int as redemptions,coalesce(sum(u.discount) filter(where u.state='redeemed'),0)::int as discount_value,count(u.order_id) filter(where u.state='reserved')::int as reservations from commerce_promotions p left join commerce_promotion_uses u on u.promotion_id=p.id group by p.id order by p.created_at desc`;
}
