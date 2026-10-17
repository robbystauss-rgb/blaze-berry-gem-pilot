import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSql, type Sql } from "@/lib/db";
import { assertPermission, audit, notify, reserveInventory } from "./core.server";
import type { Role } from "./types";
import {
  estimateSchema,
  saveEstimateSchema,
  quoteActionSchema,
  quoteResponseSchema,
  quoteTokenSchema,
  requestQuoteSchema,
  quoteTotals,
  type OwnerQuote,
  type PublicQuote,
  type QuoteRequest,
} from "./quote-schemas";

type Actor = { userId: string; role: Role };
const selectQuote = `select id,number,state,body,subtotal,total,version,created_at,updated_at,issued_at,responded_at,order_id,request_id,
 (body->>'expiresAt')::timestamptz<=clock_timestamp() as expired from commerce_quotes`;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
async function lock(sql: Sql, id: string) {
  await sql`select pg_advisory_xact_lock(hashtext(${"quote:" + id}))`;
  const [row] = await sql.query<OwnerQuote>(`${selectQuote} where id=$1 for update`, [id]);
  return row;
}
function current(row: OwnerQuote | undefined, version: number) {
  if (!row) throw Error("Quote not found.");
  if (row.version !== version) throw Error("This quote changed. Refresh before continuing.");
  return row;
}

export async function listQuotes(actor: Actor, search = "") {
  assertPermission(actor.role, "finance");
  const sql = await getSql(),
    query = "%" + search.trim().slice(0, 100) + "%";
  const [quotes, requests, inventory] = await Promise.all([
    sql.query<OwnerQuote>(
      `${selectQuote} where body->>'customerName' ilike $1 or body->>'customerEmail' ilike $1 or body->>'title' ilike $1 or number::text=$2 order by updated_at desc limit 100`,
      [query, search.trim()],
    ),
    sql<QuoteRequest>`select id,name,email,company,quantity,details,state,created_at from commerce_quote_requests where state<>'archived' and (name ilike ${query} or email ilike ${query} or details ilike ${query}) order by created_at desc limit 100`,
    sql<{
      key: string;
      title: string;
    }>`select r.product_key as key,string_agg(i.title,' / ' order by i.title) as title from commerce_inventory_rules r join commerce_inventory i on i.id=r.inventory_id group by r.product_key order by title`,
  ]);
  return { quotes, requests, inventory };
}

export async function saveQuote(input: unknown, actor: Actor) {
  assertPermission(actor.role, "finance");
  const data = saveEstimateSchema.parse(input),
    body = estimateSchema.parse(data.body),
    totals = quoteTotals(body);
  if (totals.total <= 0) throw Error("A quote must have a positive total.");
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    const row = await lock(tx, data.id);
    if (row) {
      current(row, data.version);
      if (row.state !== "draft")
        throw Error("Issued quotes are frozen. Duplicate the quote to revise it.");
      if (data.requestId && data.requestId !== row.request_id)
        throw Error("The quote request association cannot change.");
      await tx`update commerce_quotes set body=${JSON.stringify(body)},subtotal=${totals.subtotal},total=${totals.total},version=version+1,updated_at=now() where id=${data.id}`;
    } else {
      if (data.version !== 0) throw Error("Quote not found. Refresh before saving.");
      if (data.requestId) {
        const [request] =
          await tx`select id from commerce_quote_requests where id=${data.requestId} for update`;
        if (!request) throw Error("Customer request not found.");
        await tx`update commerce_quote_requests set state='reviewed' where id=${data.requestId}`;
      }
      await tx`insert into commerce_quotes(id,body,subtotal,total,actor_id,request_id) values(${data.id},${JSON.stringify(body)},${totals.subtotal},${totals.total},${actor.userId},${data.requestId ?? null})`;
    }
    await audit(
      tx,
      actor.userId,
      "quote.draft_saved",
      "quote",
      data.id,
      row ? { version: row.version } : null,
      { version: (row?.version ?? 0) + 1, total: totals.total },
    );
    return { id: data.id, version: (row?.version ?? 0) + 1 };
  });
}

export async function actOnQuote(input: unknown, actor: Actor) {
  assertPermission(actor.role, "finance");
  const data = quoteActionSchema.parse(input),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    const row = current(await lock(tx, data.id), data.version);
    if (data.action === "revoke") {
      if (!["draft", "issued"].includes(row.state))
        throw Error("Only an unaccepted draft or issued quote can be revoked.");
      await tx`update commerce_quotes set state='revoked',token_hash=null,version=version+1,updated_at=now() where id=${row.id}`;
      await audit(
        tx,
        actor.userId,
        "quote.revoked",
        "quote",
        row.id,
        { state: row.state },
        { state: "revoked" },
      );
      return { id: row.id, path: null };
    }
    if (!["draft", "issued"].includes(row.state))
      throw Error("Only a draft or active issued quote can receive a review link.");
    if (row.expired) throw Error("Choose a future expiration before issuing this quote.");
    if (!row.body.availabilityConfirmed || !row.body.totalsConfirmed)
      throw Error(
        "Confirm product availability and the complete shipping/tax total before issuing.",
      );
    // Explicit mappings may use only the shop's existing inventory rules.
    for (const line of row.body.lines)
      if (line.productKey) {
        const [rule] =
          await tx`select product_key from commerce_inventory_rules where product_key=${line.productKey} limit 1`;
        if (!rule)
          throw Error(
            "An inventory mapping is no longer available. Review and duplicate this quote.",
          );
      }
    const token = randomBytes(32).toString("base64url");
    await tx`update commerce_quotes set state='issued',token_hash=${hash(token)},issued_at=coalesce(issued_at,now()),version=version+1,updated_at=now() where id=${row.id}`;
    await audit(
      tx,
      actor.userId,
      row.state === "issued" ? "quote.link_replaced" : "quote.issued",
      "quote",
      row.id,
      { state: row.state },
      { state: "issued", total: row.total, expiresAt: row.body.expiresAt },
    );
    // The raw capability is returned once, never persisted in the database or audit.
    return { id: row.id, path: `/quote/${token}` };
  });
}

export async function publicQuote(token: string): Promise<PublicQuote | null> {
  if (!quoteTokenSchema.safeParse(token).success) return null;
  const sql = await getSql();
  const [row] = await sql.query<OwnerQuote>(
    `${selectQuote} where token_hash=$1 and state in ('issued','accepted','declined')`,
    [hash(token)],
  );
  if (!row) return null;
  return {
    number: row.number,
    title: row.body.title,
    customerName: row.body.customerName,
    state: row.state,
    lines: row.body.lines.map(({ productKey: _privateMapping, ...line }) => ({
      ...line,
      productKey: "",
    })),
    subtotal: row.subtotal,
    shipping: row.body.shipping,
    tax: row.body.tax,
    total: row.total,
    terms: row.body.terms,
    expiresAt: row.body.expiresAt,
    expired: row.expired,
    version: row.version,
  };
}

export async function respondToQuote(input: unknown) {
  const data = quoteResponseSchema.parse(input),
    sql = await getSql();
  return sql.transaction(async (tx) => {
    const [candidate] = await tx<{
      id: string;
    }>`select id from commerce_quotes where token_hash=${hash(data.token)}`;
    if (!candidate) throw Error("This private quote link is unavailable.");
    const row = await lock(tx, candidate.id);
    // Recheck after the lock: an owner may have rotated or revoked the token.
    const [active] =
      await tx`select id from commerce_quotes where id=${candidate.id} and token_hash=${hash(data.token)}`;
    if (!row || !active) throw Error("This private quote link is unavailable.");
    if (
      (row.state === "accepted" && data.action === "accept") ||
      (row.state === "declined" && data.action === "decline")
    )
      return { state: row.state };
    current(row, data.version);
    if (row.state !== "issued") throw Error("This quote has already been answered or withdrawn.");
    if (row.expired) throw Error("This quote expired. Contact the shop for an updated estimate.");
    if (data.action === "decline") {
      await tx`update commerce_quotes set state='declined',responded_at=now(),version=version+1,updated_at=now() where id=${row.id}`;
      await audit(tx, "quote-recipient", "quote.declined", "quote", row.id, null, {
        number: row.number,
      });
      await notify(tx, `quote-declined:${row.id}`, `Quote #${row.number} declined`);
      return { state: "declined" as const };
    }
    const orderId = randomUUID();
    await tx`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,shipping,tax,total)
      values(${orderId},${row.body.customerName},${row.body.customerEmail},'accepted_quote',${row.subtotal},${row.body.shipping},${row.body.tax},${row.total})`;
    for (const line of row.body.lines) {
      const specifications = {
        quoteId: row.id,
        quoteNumber: row.number,
        quoteLineId: line.id,
        kind: line.kind,
        instructions: line.specifications,
        acceptedTerms: row.body.terms,
        priceDefinition:
          "Owner-issued estimate accepted before expiration; USD shipping/tax explicitly recorded",
      };
      await tx`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications)
        values(${randomUUID()},${orderId},${line.productKey || `quote:${row.id}:${line.id}`},${line.title},${line.quantity},${line.quantity},${line.unitAmount},${JSON.stringify(specifications)})`;
    }
    await reserveInventory(tx, orderId, "quote-recipient");
    if (row.body.privateNotes)
      await tx`insert into commerce_notes(id,order_id,actor_id,body) values(${randomUUID()},${orderId},${"quote-owner:" + row.id},${row.body.privateNotes})`;
    await tx`update commerce_quotes set state='accepted',order_id=${orderId},responded_at=now(),version=version+1,updated_at=now() where id=${row.id}`;
    await audit(tx, "quote-recipient", "quote.accepted", "quote", row.id, null, {
      order_id: orderId,
      total: row.total,
    });
    await audit(tx, "quote-recipient", "order.created_from_quote", "order", orderId, null, {
      quote_id: row.id,
      total: row.total,
    });
    await notify(
      tx,
      `quote-accepted:${row.id}`,
      `Quote #${row.number} accepted — payment required`,
      orderId,
    );
    // No charge, provider invoice or email is sent by acceptance. Existing owner invoice actions own payment.
    return { state: "accepted" as const };
  });
}

export async function receiveQuoteRequest(input: unknown) {
  const data = requestQuoteSchema.parse(input),
    sql = await getSql();
  await sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"quote-request:" + data.id}))`;
    const [existing] =
      await tx<QuoteRequest>`select * from commerce_quote_requests where id=${data.id}`;
    if (existing) {
      if (
        existing.name !== data.name ||
        existing.email !== data.email ||
        existing.company !== data.company ||
        existing.quantity !== data.quantity ||
        existing.details !== data.details
      )
        throw Error("This request changed. Start a new request.");
      return;
    }
    await tx`insert into commerce_quote_requests(id,name,email,company,quantity,details,permission_to_respond)
      values(${data.id},${data.name},${data.email},${data.company},${data.quantity},${data.details},true)`;
    await notify(tx, `quote-request:${data.id}`, "New custom / bulk quote request");
  });
  return { received: true };
}
