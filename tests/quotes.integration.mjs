import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { createServer } from "vite";
import { requestHandler } from "@tanstack/start-server-core/request-response";

for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "PAYPAL_CLIENT_SECRET", "RESEND_API_KEY"])
  if (process.env[key]) throw Error(`Quote tests refuse configured ${key}.`);
const owner = { userId: "test-quote-owner", role: "owner" };
let server, sql, quotes, core, auth, requireAccess;
const nativeFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = async () => {
    throw Error("Quote tests forbid all outbound network requests, payments and email.");
  };
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  quotes = await server.ssrLoadModule("/src/lib/commerce/quotes.server.ts");
  core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
  ({ auth } = await server.ssrLoadModule("/src/lib/auth/server.ts"));
  ({ requireAccess } = await server.ssrLoadModule("/src/lib/commerce/access.server.ts"));
});
after(async () => {
  globalThis.fetch = nativeFetch;
  await server?.close();
});

function estimate(patch = {}) {
  return {
    title: "TEST FIXTURE team order",
    customerName: "TEST FIXTURE Customer",
    customerEmail: "quotes@example.invalid",
    lines: [
      {
        id: randomUUID(),
        kind: "product",
        title: "TEST FIXTURE Richardson 112 Black",
        quantity: 12,
        unitAmount: 3000,
        specifications: "112 Black, 3 × 2 inch laser-cut leatherette; no stitched edge",
        productKey: "",
      },
      {
        id: randomUUID(),
        kind: "setup",
        title: "TEST FIXTURE artwork setup",
        quantity: 1,
        unitAmount: 1500,
        specifications: "One explicit setup fee",
        productKey: "",
      },
    ],
    shipping: 1200,
    tax: 0,
    terms: "TEST FIXTURE: payment required before production; artwork approval required.",
    expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    privateNotes: "PRIVATE TEST FIXTURE shop note",
    availabilityConfirmed: true,
    totalsConfirmed: true,
    ...patch,
  };
}
async function draft(body = estimate(), id = randomUUID()) {
  await quotes.saveQuote({ id, version: 0, body }, owner);
  return (await quotes.listQuotes(owner)).quotes.find((q) => q.id === id);
}
async function issued(body = estimate()) {
  const row = await draft(body);
  const { path } = await quotes.actOnQuote(
    { id: row.id, version: row.version, action: "issue" },
    owner,
  );
  const token = path.split("/").pop();
  return { row, token, public: await quotes.publicQuote(token) };
}
async function inSession(headers, work, requestOptions = {}) {
  let result, failure;
  const handle = requestHandler(async () => {
    try {
      result = await work();
    } catch (e) {
      failure = e;
    }
    return new Response(null, { status: 204 });
  });
  await handle(new Request("http://localhost:8080/admin", { headers, ...requestOptions }), {});
  if (failure) throw failure;
  return result;
}
async function session(role) {
  const email = `quote-auth-${randomUUID()}@example.invalid`,
    password = randomBytes(24).toString("base64url");
  const request = (path, data) =>
    new Request(`http://localhost:8080/api/auth/${path}`, {
      method: "POST",
      headers: { Origin: "http://localhost:8080", "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  const response = await auth.handler(
    request("sign-up/email", { name: "TEST quote authentication", email, password }),
  );
  assert.equal(response.status, 200);
  const { user } = await response.json();
  if (role !== "customer")
    await sql`insert into merchant_staff(user_id,role) values(${user.id},${role})`;
  const login = await auth.handler(request("sign-in/email", { email, password }));
  return {
    user,
    headers: new Headers({
      cookie: login.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; "),
    }),
  };
}

test("real authentication and finance roles deny anonymous, forged, customer, manager and production quote access", async () => {
  await assert.rejects(
    () => inSession(new Headers(), () => requireAccess(owner.userId, "finance")),
    /Unauthorized/,
  );
  await assert.rejects(
    () =>
      inSession(new Headers({ cookie: "__Host-grok-auth.session_token=forged" }), () =>
        requireAccess(owner.userId, "finance"),
      ),
    /Unauthorized/,
  );
  for (const role of ["customer", "manager", "production", "owner"]) {
    const login = await session(role);
    const work = () =>
      inSession(login.headers, async () =>
        quotes.listQuotes(await requireAccess(login.user.id, "finance")),
      );
    if (role === "owner") assert.ok(Array.isArray((await work()).quotes));
    else await assert.rejects(work, /Access denied/);
  }
  for (const role of ["manager", "production", null]) {
    const actor = { userId: "untrusted", role };
    await assert.rejects(
      () => quotes.saveQuote({ id: randomUUID(), version: 0, body: estimate() }, actor),
      /Access denied/,
    );
    await assert.rejects(
      () => quotes.actOnQuote({ id: randomUUID(), version: 1, action: "issue" }, actor),
      /Access denied/,
    );
  }
});

test("multiline draft computes integer cents and updates optimistically without creating orders, email or provider obligations", async () => {
  const before = (await sql`select count(*)::int as n from commerce_orders`)[0].n;
  const row = await draft();
  assert.equal(row.subtotal, 37500);
  assert.equal(row.total, 38700);
  const body = { ...row.body, shipping: 800, privateNotes: "Updated private note" };
  assert.equal((await quotes.saveQuote({ id: row.id, version: 1, body }, owner)).version, 2);
  await assert.rejects(() => quotes.saveQuote({ id: row.id, version: 1, body }, owner), /changed/);
  assert.equal((await sql`select count(*)::int as n from commerce_orders`)[0].n, before);
  assert.equal((await sql`select count(*)::int as n from commerce_invoices`)[0].n, 0);
  assert.equal((await sql`select count(*)::int as n from commerce_order_emails`)[0].n, 0);
  assert.equal(
    (
      await sql`select id from commerce_audit where resource_id=${row.id} and action='quote.draft_saved'`
    ).length,
    2,
  );
});

test("malformed money, hidden totals, duplicate lines, unsupported fields and service inventory mappings fail validation", async () => {
  const body = estimate();
  const invalid = [
    { ...body, tax: -1 },
    { ...body, shipping: 0.1 },
    { ...body, lines: [{ ...body.lines[0], unitAmount: NaN }] },
    { ...body, lines: [{ ...body.lines[0], unitAmount: 10_000_000 }] },
    { ...body, lines: [body.lines[0], body.lines[0]] },
    { ...body, lines: [{ ...body.lines[0], kind: "setup", productKey: "hat:112:Black" }] },
    { ...body, total: 1 },
    { ...body, customerEmail: "not-email" },
    { ...body, expiresAt: "tomorrow" },
  ];
  for (const value of invalid)
    await assert.rejects(() =>
      quotes.saveQuote({ id: randomUUID(), version: 0, body: value }, owner),
    );
});

test("issuing requires a reviewed full total and availability; expired drafts cannot publish", async () => {
  for (const patch of [
    { availabilityConfirmed: false },
    { totalsConfirmed: false },
    { expiresAt: new Date(Date.now() - 1000).toISOString() },
  ]) {
    const row = await draft(estimate(patch));
    await assert.rejects(
      () => quotes.actOnQuote({ id: row.id, version: 1, action: "issue" }, owner),
      /Confirm|future/,
    );
    assert.equal(
      (await sql`select state from commerce_quotes where id=${row.id}`)[0].state,
      "draft",
    );
  }
});

test("private link stores only a hash and excludes customer email, private notes, inventory keys and order identifiers", async () => {
  const { row, token, public: view } = await issued();
  const [stored] = await sql`select token_hash,body from commerce_quotes where id=${row.id}`;
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal(view.total, 38700);
  const serialized = JSON.stringify(view);
  for (const secret of [
    row.body.customerEmail,
    row.body.privateNotes,
    "order_id",
    "token_hash",
    row.id,
  ])
    assert.ok(!serialized.includes(secret));
  assert.equal(await quotes.publicQuote(randomBytes(32).toString("base64url")), null);
  assert.equal(await quotes.publicQuote(row.id), null);
  const audit =
    await sql`select before_value,after_value from commerce_audit where resource_id=${row.id}`;
  assert.ok(!JSON.stringify(audit).includes(token));
});

test("issued quote contents are frozen in application and database; duplication leaves its reviewed price intact", async () => {
  const { row } = await issued();
  const current = (await quotes.listQuotes(owner)).quotes.find((q) => q.id === row.id);
  await assert.rejects(
    () =>
      quotes.saveQuote(
        { id: row.id, version: current.version, body: { ...row.body, tax: 100 } },
        owner,
      ),
    /frozen/,
  );
  await assert.rejects(
    () =>
      sql`update commerce_quotes set body=${JSON.stringify({ ...row.body, tax: 100 })} where id=${row.id}`,
    /immutable/,
  );
  await assert.rejects(() => sql`delete from commerce_quotes where id=${row.id}`, /immutable/);
  const duplicate = await draft({ ...row.body, tax: 100 });
  assert.equal(duplicate.total, 38800);
  assert.equal((await sql`select total from commerce_quotes where id=${row.id}`)[0].total, 38700);
});

test("rotating or revoking review links immediately invalidates prior capabilities", async () => {
  const { row, token, public: view } = await issued();
  const replacement = await quotes.actOnQuote(
    { id: row.id, version: view.version, action: "issue" },
    owner,
  );
  assert.equal(await quotes.publicQuote(token), null);
  await assert.rejects(
    () => quotes.respondToQuote({ token, version: view.version, action: "accept" }),
    /unavailable/,
  );
  const freshToken = replacement.path.split("/").pop(),
    fresh = await quotes.publicQuote(freshToken);
  assert.equal(fresh.total, row.total);
  await quotes.actOnQuote({ id: row.id, version: fresh.version, action: "revoke" }, owner);
  assert.equal(await quotes.publicQuote(freshToken), null);
  await assert.rejects(
    () => quotes.respondToQuote({ token: freshToken, version: fresh.version, action: "accept" }),
    /unavailable/,
  );
});

test("simultaneous acceptance and retries create exactly one unpaid normal order with complete immutable line snapshots", async () => {
  const { row, token, public: view } = await issued();
  const request = { token, version: view.version, action: "accept" };
  const results = await Promise.all([
    quotes.respondToQuote(request),
    quotes.respondToQuote(request),
    quotes.respondToQuote(request),
  ]);
  assert.ok(results.every((r) => r.state === "accepted"));
  const [accepted] = await sql`select order_id,state from commerce_quotes where id=${row.id}`;
  const order = await core.orderById(sql, accepted.order_id);
  assert.equal(order.total, row.total);
  assert.equal(order.subtotal, 37500);
  assert.equal(order.shipping, 1200);
  assert.equal(order.tax, 0);
  assert.equal(order.source, "accepted_quote");
  assert.equal(order.paid, 0);
  assert.equal(order.payment_status, "unpaid");
  const items =
    await sql`select title,quantity,unit_amount,specifications from commerce_order_items where order_id=${order.id}`;
  assert.equal(items.length, 2);
  assert.equal(
    items.reduce((sum, line) => sum + line.quantity * line.unit_amount, 0),
    37500,
  );
  assert.ok(items.every((line) => line.specifications.acceptedTerms === row.body.terms));
  assert.equal(
    (
      await sql`select id from commerce_notes where order_id=${order.id} and body=${row.body.privateNotes}`
    ).length,
    1,
  );
  assert.equal(
    (
      await sql`select id from commerce_audit where action='quote.accepted' and resource_id=${row.id}`
    ).length,
    1,
  );
  assert.equal((await sql`select id from commerce_payments where order_id=${order.id}`).length, 0);
  assert.equal(
    (await sql`select order_id from commerce_invoices where order_id=${order.id}`).length,
    0,
  );
  assert.equal(
    (await sql`select id from commerce_order_emails where order_id=${order.id}`).length,
    0,
  );
  await assert.rejects(
    () => sql`update commerce_order_items set unit_amount=1 where order_id=${order.id}`,
    /immutable/,
  );
  await assert.rejects(
    () => quotes.actOnQuote({ id: row.id, version: view.version + 1, action: "revoke" }, owner),
    /unaccepted/,
  );
});

test("mapped quote inventory is reserved atomically on acceptance and insufficient stock rolls back the entire order", async () => {
  const stockId = randomUUID(),
    productKey = `hat:112:TEST-${stockId}`;
  await sql`insert into commerce_inventory(id,sku,title,category,on_hand) values(${stockId},${productKey},'TEST 112 exact stock','hat',12)`;
  await sql`insert into commerce_inventory_rules(product_key,inventory_id,units_per_item) values(${productKey},${stockId},1)`;
  const body = estimate();
  body.lines[0].productKey = productKey;
  const first = await issued(body),
    second = await issued(body);
  assert.equal(
    (await sql`select reserved from commerce_inventory where id=${stockId}`)[0].reserved,
    0,
  );
  await quotes.respondToQuote({
    token: first.token,
    version: first.public.version,
    action: "accept",
  });
  assert.equal(
    (await sql`select reserved from commerce_inventory where id=${stockId}`)[0].reserved,
    12,
  );
  const before = (await sql`select count(*)::int as n from commerce_orders`)[0].n;
  await assert.rejects(
    () =>
      quotes.respondToQuote({
        token: second.token,
        version: second.public.version,
        action: "accept",
      }),
    /Not enough/,
  );
  assert.equal((await sql`select count(*)::int as n from commerce_orders`)[0].n, before);
  assert.deepEqual(
    (await sql`select state,order_id from commerce_quotes where id=${second.row.id}`)[0],
    { state: "issued", order_id: null },
  );
});

test("customer cannot alter an accepted total and decline never creates an order", async () => {
  const { row, token, public: view } = await issued();
  await assert.rejects(() =>
    quotes.respondToQuote({ token, version: view.version, action: "accept", total: 1 }),
  );
  assert.equal(
    (await quotes.respondToQuote({ token, version: view.version, action: "decline" })).state,
    "declined",
  );
  assert.equal(
    (await quotes.respondToQuote({ token, version: view.version, action: "decline" })).state,
    "declined",
  );
  await assert.rejects(
    () => quotes.respondToQuote({ token, version: view.version + 1, action: "accept" }),
    /answered|withdrawn/,
  );
  assert.equal(
    (await sql`select order_id from commerce_quotes where id=${row.id}`)[0].order_id,
    null,
  );
});

test("server expiration blocks acceptance and decline even if the customer page was loaded before expiry", async () => {
  const { token, public: view } = await issued(
    estimate({ expiresAt: new Date(Date.now() + 700).toISOString() }),
  );
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal((await quotes.publicQuote(token)).expired, true);
  for (const action of ["accept", "decline"])
    await assert.rejects(
      () => quotes.respondToQuote({ token, version: view.version, action }),
      /expired/,
    );
});

test("customer request is validated, idempotent and private; preparing its draft marks it reviewed without any email", async () => {
  const request = {
    id: randomUUID(),
    name: "TEST Request Customer",
    email: "request@example.invalid",
    company: "TEST Company",
    quantity: 24,
    details: "TEST FIXTURE: 112 Black team hats; owner must verify exact availability",
    permissionToRespond: true,
    website: "",
  };
  assert.equal((await quotes.receiveQuoteRequest(request)).received, true);
  assert.equal((await quotes.receiveQuoteRequest(request)).received, true);
  await assert.rejects(() => quotes.receiveQuoteRequest({ ...request, quantity: 25 }), /changed/);
  await assert.rejects(() =>
    quotes.receiveQuoteRequest({ ...request, id: randomUUID(), permissionToRespond: false }),
  );
  await assert.rejects(() =>
    quotes.receiveQuoteRequest({ ...request, id: randomUUID(), website: "spam.invalid" }),
  );
  const data = await quotes.listQuotes(owner, "TEST Request Customer");
  assert.equal(data.requests.length, 1);
  assert.equal(data.requests[0].state, "new");
  const id = randomUUID();
  await quotes.saveQuote({ id, version: 0, body: estimate(), requestId: request.id }, owner);
  assert.equal(
    (await sql`select state from commerce_quote_requests where id=${request.id}`)[0].state,
    "reviewed",
  );
  assert.equal(
    (
      await sql`select id from commerce_notifications where event_key=${`quote-request:${request.id}`}`
    ).length,
    1,
  );
  assert.equal(
    (
      await sql`select id from commerce_order_emails where event_key=${`quote-request:${request.id}`}`
    ).length,
    0,
  );
});

test("cross-site quote mutations are rejected by the same origin boundary used by authenticated commerce", async () => {
  const { assertQuoteMutationOrigin } = await server.ssrLoadModule(
    "/src/lib/commerce/quote-request-boundary.server.ts",
  );
  for (const headers of [
    new Headers({ origin: "https://evil.invalid" }),
    new Headers({ "sec-fetch-site": "cross-site" }),
  ]) {
    await assert.rejects(() =>
      inSession(headers, () => assertQuoteMutationOrigin(), { method: "POST" }),
    );
  }
});
