import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "vite";
import Stripe from "stripe";

// This suite never loads deployment credentials or sends an external request.
// Its database is the same migrated PostgreSQL/PGlite engine as the application.
const credentialNames = [
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "RESEND_API_KEY",
];
for (const name of credentialNames)
  if (process.env[name]) throw Error(`Provider tests refuse configured ${name}.`);

const nativeFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const secret = "whsec_isolated_signed_http_fixture";
const now = () => Math.floor(Date.now() / 1000);
const replies = new Map();
const providerRequests = [];
let server, receiver, origin, sql, core, webhooks, email, paypalTransport;

const stripe = new Stripe("sk_test_isolated_no_network", {
  maxNetworkRetries: 0,
  httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.stripe.com");
    assert.equal(init.method, "GET", "webhook reconciliation may only retrieve provider state");
    providerRequests.push(url.pathname);
    const reply = replies.get(url.pathname);
    assert.ok(reply, `Unexpected provider request: ${url.pathname}`);
    return Response.json(typeof reply === "function" ? reply() : reply);
  }),
});

before(async () => {
  globalThis.fetch = async (input, init) => {
    if (paypalTransport) return paypalTransport(input, init);
    throw Error("External network access is disabled in provider boundary tests.");
  };
  process.env.STRIPE_SECRET_KEY = "sk_test_isolated_no_network";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  delete process.env.REC_ORDER_EMAIL_SENDER_VERIFIED;
  delete process.env.RESEND_API_KEY;
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  assert.equal(db.dbSource, "pglite");
  sql = await db.getSql();
  core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
  webhooks = await server.ssrLoadModule("/src/lib/commerce/webhooks.server.ts");
  email = await server.ssrLoadModule("/src/lib/commerce/order-email.server.ts");
  receiver = createHttpServer(async (req, res) => {
    try {
      if (
        req.method !== "POST" ||
        !["/api/webhooks/stripe", "/api/webhooks/paypal"].includes(req.url)
      ) {
        res.writeHead(404).end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`${origin}${req.url}`, {
        method: "POST",
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      const response =
        req.url === "/api/webhooks/stripe"
          ? await webhooks.stripeWebhook(request, stripe)
          : await webhooks.paypalWebhook(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500).end("Receiver failed");
    }
  });
  await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${receiver.address().port}`;
});

beforeEach(() => {
  replies.clear();
  providerRequests.length = 0;
  paypalTransport = null;
  delete process.env.RESEND_API_KEY;
  delete process.env.REC_ORDER_EMAIL_SENDER_VERIFIED;
});

after(async () => {
  await new Promise((resolve) => receiver?.close(resolve));
  await server?.close();
  globalThis.fetch = nativeFetch;
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

async function fixture({ stock = false } = {}) {
  const id = randomUUID();
  const item = randomUUID();
  const product = `test-provider:${id}`;
  await sql`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total)
    values(${id},'TEST FIXTURE ONLY','buyer@example.invalid','provider_boundary_test',6000,6000)`;
  const artwork = Buffer.from("%PDF-1.7\nTEST ORIGINAL ARTWORK; DO NOT PRODUCE\n");
  await sql`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type)
    values(${item},${id},${product},'TEST FIXTURE custom hat',1,1,6000,${JSON.stringify({ family: "112", colorway: "Black", patchDimensions: { width: 3, height: 2, unit: "in" }, normalizedPlacement: { x: 0.5, y: 0.5 } })},${artwork},'application/pdf')`;
  if (stock) {
    await sql`insert into commerce_inventory(id,sku,title,category,on_hand,threshold) values(${id},${product},'TEST FIXTURE stock','hat',5,1)`;
    await sql`insert into commerce_inventory_rules(product_key,inventory_id,units_per_item) values(${product},${id},1)`;
    await sql.transaction((tx) => core.reserveInventory(tx, id, "provider-test"));
  }
  return { id, item, artwork };
}

function event(type, reference, extra = {}) {
  return {
    id: "evt_test_" + randomUUID().replaceAll("-", ""),
    object: "event",
    type,
    created: now(),
    livemode: false,
    data: { object: { id: reference } },
    ...extra,
  };
}

async function deliver(value, { signature, timestamp, raw } = {}) {
  const payload = raw ?? JSON.stringify(value);
  const header =
    signature ?? stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
  return nativeFetch(`${origin}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
}

function checkout(id, { paid = true, ...overrides } = {}) {
  const reference = "cs_test_" + randomUUID().replaceAll("-", "");
  const intent = {
    id: "pi_test_" + randomUUID().replaceAll("-", ""),
    object: "payment_intent",
    status: "succeeded",
    currency: "usd",
    amount_received: 6000,
    latest_charge: { created: now(), balance_transaction: { fee: 204 } },
  };
  const session = {
    id: reference,
    object: "checkout.session",
    metadata: { rec_order_id: id },
    currency: "usd",
    amount_total: 6000,
    payment_status: paid ? "paid" : "unpaid",
    payment_intent: paid ? intent : null,
    ...overrides,
  };
  replies.set(`/v1/checkout/sessions/${reference}`, () => session);
  return { reference, intent, session };
}

test("signed Stripe HTTP request retrieves provider truth and commits one exact payment, stock movement and immutable artwork", async () => {
  const { id, item, artwork } = await fixture({ stock: true });
  const { reference, intent } = checkout(id);
  const notification = event("checkout.session.completed", reference);
  assert.equal((await deliver(notification)).status, 200);
  assert.equal((await deliver(notification)).status, 200);
  assert.equal((await deliver({ ...notification, id: "evt_test_" + randomUUID() })).status, 200);
  const order = await core.orderById(sql, id);
  assert.equal(order.paid, 6000);
  assert.equal(order.payment_status, "paid");
  const payments =
    await sql`select reference,amount,fee from commerce_payments where order_id=${id}`;
  assert.deepEqual(payments, [{ reference: intent.id, amount: 6000, fee: 204 }]);
  const [stock] =
    await sql`select on_hand,reserved,committed from commerce_inventory where id=${id}`;
  assert.deepEqual(stock, { on_hand: 5, reserved: 0, committed: 1 });
  assert.equal(
    (await sql`select id from commerce_notifications where event_key=${`paid:${id}`}`).length,
    1,
  );
  assert.equal((await sql`select id from commerce_order_emails where order_id=${id}`).length, 1);
  assert.deepEqual(
    Buffer.from((await sql`select artwork from commerce_order_items where id=${item}`)[0].artwork),
    artwork,
  );
  assert.equal(providerRequests.length, 2, "same event replay does not retrieve or mutate again");
});

test("signed asynchronous completion remains unpaid until successful provider confirmation", async () => {
  const { id } = await fixture({ stock: true });
  const { reference, session } = checkout(id, { paid: false });
  assert.equal((await deliver(event("checkout.session.completed", reference))).status, 200);
  assert.equal((await core.orderById(sql, id)).paid, 0);
  assert.equal((await sql`select reserved from commerce_inventory where id=${id}`)[0].reserved, 1);
  session.payment_status = "paid";
  session.payment_intent = {
    id: "pi_test_async_" + id,
    status: "succeeded",
    currency: "usd",
    amount_received: 6000,
  };
  assert.equal(
    (await deliver(event("checkout.session.async_payment_succeeded", reference))).status,
    200,
  );
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  assert.equal(
    (await sql`select committed from commerce_inventory where id=${id}`)[0].committed,
    1,
  );
});

test("missing, forged, altered and stale Stripe signatures fail before provider or ledger access", async () => {
  const { id } = await fixture();
  const notification = event("checkout.session.completed", "cs_test_unreachable");
  const payload = JSON.stringify(notification);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  for (const options of [
    { signature: "" },
    { signature: "t=1,v1=forged" },
    { signature: header, raw: payload + " " },
    { timestamp: now() - 600 },
  ])
    assert.equal((await deliver(notification, options)).status, 400);
  assert.equal((await core.orderById(sql, id)).paid, 0);
  assert.equal(
    (await sql`select event_id from commerce_events where event_id=${notification.id}`).length,
    0,
  );
  assert.equal(providerRequests.length, 0);
});

test("oversized and live-mode development webhook requests are rejected before API access", async () => {
  assert.equal((await deliver(null, { raw: "x".repeat(1_000_001) })).status, 413);
  assert.equal(
    (await deliver(event("checkout.session.completed", "cs_test_live", { livemode: true }))).status,
    400,
  );
  assert.equal(providerRequests.length, 0);
});

for (const [name, overrides] of [
  ["session total", { amount_total: 5999 }],
  ["session currency", { currency: "eur" }],
  [
    "intent total",
    {
      payment_intent: {
        id: "pi_test_invalid",
        status: "succeeded",
        currency: "usd",
        amount_received: 5999,
      },
    },
  ],
  [
    "intent currency",
    {
      payment_intent: {
        id: "pi_test_invalid",
        status: "succeeded",
        currency: "eur",
        amount_received: 6000,
      },
    },
  ],
  [
    "pending intent",
    {
      payment_intent: {
        id: "pi_test_invalid",
        status: "processing",
        currency: "usd",
        amount_received: 6000,
      },
    },
  ],
])
  test(`signed webhook with mismatched ${name} rolls back its event marker, ledger, stock and alerts`, async () => {
    const { id } = await fixture({ stock: true });
    const { reference, session, intent } = checkout(id, overrides);
    const notification = event("checkout.session.completed", reference);
    assert.equal((await deliver(notification)).status, 500);
    assert.equal(
      (await sql`select event_id from commerce_events where event_id=${notification.id}`).length,
      0,
    );
    assert.equal((await core.orderById(sql, id)).paid, 0);
    assert.deepEqual(
      (await sql`select reserved,committed from commerce_inventory where id=${id}`)[0],
      { reserved: 1, committed: 0 },
    );
    assert.equal((await sql`select id from commerce_notifications where order_id=${id}`).length, 0);
    Object.assign(session, { currency: "usd", amount_total: 6000, payment_intent: intent });
    assert.equal(
      (await deliver(notification)).status,
      200,
      "retry succeeds only after retrieved provider state agrees",
    );
    assert.equal((await core.orderById(sql, id)).paid, 6000);
  });

test("unpaid expiration releases reservations while a late failure cannot cancel a paid order", async () => {
  const { id } = await fixture({ stock: true });
  const { reference } = checkout(id, { paid: false });
  assert.equal((await deliver(event("checkout.session.expired", reference))).status, 200);
  assert.equal((await core.orderById(sql, id)).stage, "canceled");
  assert.deepEqual(
    (await sql`select reserved,committed from commerce_inventory where id=${id}`)[0],
    { reserved: 0, committed: 0 },
  );
  const paid = await fixture({ stock: true });
  const active = checkout(paid.id);
  assert.equal((await deliver(event("checkout.session.completed", active.reference))).status, 200);
  active.session.payment_status = "unpaid";
  active.session.payment_intent = null;
  assert.equal(
    (await deliver(event("checkout.session.async_payment_failed", active.reference))).status,
    200,
  );
  assert.equal((await core.orderById(sql, paid.id)).stage, "new");
  assert.equal((await core.orderById(sql, paid.id)).paid, 6000);
  assert.equal(
    (await sql`select committed from commerce_inventory where id=${paid.id}`)[0].committed,
    1,
  );
});

test("refund delivered before payment is retryable and records one refund after payment arrives", async () => {
  const { id } = await fixture();
  const { reference, intent } = checkout(id);
  const refundId = "re_test_" + randomUUID().replaceAll("-", "");
  replies.set(`/v1/refunds/${refundId}`, {
    id: refundId,
    payment_intent: intent.id,
    status: "succeeded",
    currency: "usd",
    amount: 2000,
    created: now(),
  });
  const refunded = event("refund.updated", refundId);
  assert.equal((await deliver(refunded)).status, 500);
  assert.equal(
    (await sql`select event_id from commerce_events where event_id=${refunded.id}`).length,
    0,
  );
  assert.equal((await deliver(event("checkout.session.completed", reference))).status, 200);
  assert.equal((await deliver(refunded)).status, 200);
  assert.equal((await deliver({ ...refunded, id: "evt_test_" + randomUUID() })).status, 200);
  assert.equal((await core.orderById(sql, id)).refunded, 2000);
  assert.equal(
    (await sql`select id from commerce_payments where order_id=${id} and kind='refund'`).length,
    1,
  );
});

test("signed unknown events are acknowledged without inventing an order or payment", async () => {
  const notification = event("customer.created", "cus_test_unrelated");
  const before = (await sql`select count(*)::int as count from commerce_payments`)[0].count;
  assert.equal((await deliver(notification)).status, 200);
  assert.equal(providerRequests.length, 0);
  assert.equal((await sql`select count(*)::int as count from commerce_payments`)[0].count, before);
});

test("invoice provider status and out-of-band credit alone cannot invent a received payment", async () => {
  const { id } = await fixture();
  const reference = "in_test_" + randomUUID().replaceAll("-", "");
  await sql`insert into commerce_invoices(order_id,provider_id,state) values(${id},${reference},'open')`;
  replies.set(`/v1/invoices/${reference}`, {
    id: reference,
    metadata: { rec_order_id: id },
    status: "paid",
    currency: "usd",
    total: 6000,
    hosted_invoice_url: null,
    invoice_pdf: null,
  });
  replies.set("/v1/invoice_payments", {
    object: "list",
    has_more: false,
    data: [
      {
        status: "paid",
        amount_paid: 6000,
        payment: { type: "payment_record", payment_record: "pyr_test_out_of_band" },
      },
    ],
  });
  assert.equal((await deliver(event("invoice.paid", reference))).status, 200);
  assert.equal((await core.orderById(sql, id)).paid, 0);
  assert.equal((await sql`select id from commerce_payments where order_id=${id}`).length, 0);
});

test("signed invoice event retrieves successful payment intent and deduplicates its actual received amount", async () => {
  const { id } = await fixture();
  const reference = "in_test_" + randomUUID().replaceAll("-", "");
  const intent = "pi_test_" + randomUUID().replaceAll("-", "");
  await sql`insert into commerce_invoices(order_id,provider_id,state) values(${id},${reference},'open')`;
  replies.set(`/v1/invoices/${reference}`, {
    id: reference,
    metadata: { rec_order_id: id },
    status: "paid",
    currency: "usd",
    total: 6000,
    hosted_invoice_url: null,
    invoice_pdf: null,
  });
  replies.set("/v1/invoice_payments", {
    object: "list",
    has_more: false,
    data: [
      {
        status: "paid",
        amount_paid: 6000,
        currency: "usd",
        invoice: reference,
        payment: { type: "payment_intent", payment_intent: intent },
      },
    ],
  });
  replies.set(`/v1/payment_intents/${intent}`, {
    id: intent,
    status: "succeeded",
    currency: "usd",
    amount_received: 6000,
  });
  assert.equal((await deliver(event("invoice.payment_succeeded", reference))).status, 200);
  assert.equal((await deliver(event("invoice.paid", reference))).status, 200);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  assert.equal((await sql`select id from commerce_payments where order_id=${id}`).length, 1);
});

async function paypalFixture() {
  process.env.PAYPAL_CLIENT_ID = "sandbox_fixture_client";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox_fixture_secret";
  process.env.PAYPAL_WEBHOOK_ID = "sandbox_fixture_receiver";
  process.env.PAYPAL_ENVIRONMENT = "sandbox";
  const row = await fixture({ stock: true });
  const reference = "TESTORDER" + randomUUID().replaceAll("-", "");
  await sql`insert into commerce_checkouts(order_id,provider,reference) values(${row.id},'paypal',${reference})`;
  return {
    ...row,
    reference,
    notification: {
      id: "WH-TEST-" + randomUUID(),
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      create_time: new Date().toISOString(),
      resource: {
        id: "TESTCAPTURE" + randomUUID().replaceAll("-", ""),
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "60.00" },
        seller_receivable_breakdown: { paypal_fee: { value: "2.04" } },
        supplementary_data: { related_ids: { order_id: reference } },
      },
    },
  };
}

async function deliverPaypal(notification) {
  return nativeFetch(`${origin}/api/webhooks/paypal`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.sandbox.paypal.com/test-only-cert",
      "paypal-transmission-id": "TEST-TRANSMISSION",
      "paypal-transmission-sig": "TEST-PROVIDER-VERIFICATION-ONLY",
      "paypal-transmission-time": new Date().toISOString(),
    },
    body: JSON.stringify(notification),
  });
}

function verifyPaypal({ valid = true, fail = false } = {}) {
  const calls = [];
  paypalTransport = async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api-m.sandbox.paypal.com");
    assert.equal(init.method, "POST");
    calls.push(url.pathname);
    if (url.pathname === "/v1/oauth2/token")
      return Response.json({ access_token: "sandbox-fixture-only" });
    assert.equal(url.pathname, "/v1/notifications/verify-webhook-signature");
    const body = JSON.parse(init.body);
    assert.equal(body.webhook_id, "sandbox_fixture_receiver");
    assert.equal(body.transmission_id, "TEST-TRANSMISSION");
    assert.equal(body.transmission_sig, "TEST-PROVIDER-VERIFICATION-ONLY");
    if (fail) throw Error("Simulated verification service outage");
    return Response.json({ verification_status: valid ? "SUCCESS" : "FAILURE" });
  };
  return calls;
}

test("PayPal HTTP receiver forwards exact signature contract to sandbox verifier and deduplicates capture", async () => {
  const { id, notification } = await paypalFixture();
  const calls = verifyPaypal();
  assert.equal((await deliverPaypal(notification)).status, 200);
  assert.equal((await deliverPaypal(notification)).status, 200);
  assert.equal(
    (await deliverPaypal({ ...notification, id: "WH-TEST-" + randomUUID() })).status,
    200,
  );
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  assert.deepEqual(await sql`select amount,fee from commerce_payments where order_id=${id}`, [
    { amount: 6000, fee: 204 },
  ]);
  assert.equal(calls.filter((path) => path.endsWith("verify-webhook-signature")).length, 3);
  assert.equal(
    (await sql`select committed from commerce_inventory where id=${id}`)[0].committed,
    1,
  );
});

test("failed PayPal signature verification cannot touch ledger and verification outage remains retryable", async () => {
  const { id, notification } = await paypalFixture();
  verifyPaypal({ valid: false });
  assert.equal((await deliverPaypal(notification)).status, 400);
  verifyPaypal({ fail: true });
  assert.equal((await deliverPaypal(notification)).status, 500);
  assert.equal(
    (await sql`select event_id from commerce_events where event_id=${notification.id}`).length,
    0,
  );
  assert.equal((await core.orderById(sql, id)).paid, 0);
  verifyPaypal();
  assert.equal((await deliverPaypal(notification)).status, 200);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
});

test("PayPal currency mismatch rolls back receipt and an authenticated retry preserves the original amount", async () => {
  const { id, notification } = await paypalFixture();
  verifyPaypal();
  notification.resource.amount.currency_code = "EUR";
  assert.equal((await deliverPaypal(notification)).status, 500);
  assert.equal((await core.orderById(sql, id)).paid, 0);
  assert.equal(
    (await sql`select event_id from commerce_events where event_id=${notification.id}`).length,
    0,
  );
  notification.resource.amount.currency_code = "USD";
  assert.equal((await deliverPaypal(notification)).status, 200);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
});

function configureEmail() {
  process.env.REC_ORDER_EMAIL_TO = "owner@example.invalid";
  process.env.REC_ORDER_EMAIL_FROM = "orders@recmamamade.com";
  process.env.REC_ORDER_EMAIL_SENDER_VERIFIED = "true";
  process.env.RESEND_API_KEY = "re_isolated_fake_never_transmitted";
}

test("accepted payment survives unavailable email delivery; outbox retries identical escaped content once", async () => {
  // Earlier fixture messages are unrelated to this test's deliberately failed sender.
  await sql`update commerce_order_emails set state='failed' where state='queued'`;
  const { id, artwork } = await fixture();
  await sql`update commerce_orders set customer_name='<script>TEST FIXTURE</script>' where id=${id}`;
  const { reference } = checkout(id);
  configureEmail();
  // The actual webhook invokes its sender, whose network access is denied above.
  assert.equal((await deliver(event("checkout.session.completed", reference))).status, 200);
  const [queued] = await sql`select state,attempts from commerce_order_emails where order_id=${id}`;
  assert.deepEqual(queued, { state: "queued", attempts: 1 });
  await sql`update commerce_order_emails set next_attempt_at=now() where order_id=${id}`;
  const calls = [];
  const transport = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    calls.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    if (calls.length === 1) throw Error("Simulated response loss after possible acceptance");
    return Response.json({ id: "email_test_fixture_accepted" });
  };
  assert.equal((await email.drainOrderEmails(sql, transport, 1, id)).accepted, 0);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  await sql`update commerce_order_emails set next_attempt_at=now() where order_id=${id}`;
  assert.equal((await email.drainOrderEmails(sql, transport, 1, id)).accepted, 1);
  assert.deepEqual(calls[0], calls[1]);
  const message = JSON.parse(calls[1].body);
  assert.match(message.text, /Actual payments recorded: \$60.00/);
  assert.match(message.text, /"width": 3/);
  assert.match(message.text, /"height": 2/);
  assert.ok(!message.html.includes("<script>"));
  assert.match(message.html, /&lt;script&gt;TEST FIXTURE&lt;\/script&gt;/);
  assert.equal(message.to[0], "owner@example.invalid");
  assert.deepEqual(Buffer.from(message.attachments[0].content, "base64"), artwork);
  assert.equal((await email.drainOrderEmails(sql, transport, 1, id)).attempted, 0);
  assert.equal(
    (await sql`select state from commerce_order_emails where order_id=${id}`)[0].state,
    "accepted",
  );
});

test("permanent email failure and ambiguous expired attempt require owner review without another send", async () => {
  configureEmail();
  const first = await fixture();
  await core.notify(sql, `draft:${first.id}`, "TEST FIXTURE draft", first.id);
  const failed = await email.drainOrderEmails(
    sql,
    async () => new Response("denied", { status: 403 }),
    1,
    first.id,
  );
  assert.equal(failed.accepted, 0);
  assert.equal(
    (await sql`select state from commerce_order_emails where order_id=${first.id}`)[0].state,
    "failed",
  );
  const uncertain = await fixture();
  await core.notify(sql, `draft:${uncertain.id}`, "TEST FIXTURE draft", uncertain.id);
  await sql`update commerce_order_emails set first_attempt_at=now()-interval '25 hours' where order_id=${uncertain.id}`;
  const noSend = async () => {
    throw Error("Expired uncertain delivery must not send");
  };
  assert.equal((await email.drainOrderEmails(sql, noSend, 1, uncertain.id)).attempted, 0);
  assert.equal(
    (await sql`select state from commerce_order_emails where order_id=${uncertain.id}`)[0].state,
    "review_required",
  );
});

test("email scheduler authentication rejects forged requests and unverified sender prevents transport", async () => {
  process.env.CRON_SECRET = "test-only-scheduler-secret";
  for (const authorization of ["", "Bearer invalid", "Bearer test-only-scheduler-secreu"]) {
    assert.equal(
      (
        await email.orderEmailCron(
          new Request(`${origin}/api/notifications/order-email`, { headers: { authorization } }),
        )
      ).status,
      401,
    );
  }
  const { id } = await fixture();
  await core.notify(sql, `draft:${id}`, "TEST FIXTURE draft", id);
  configureEmail();
  process.env.REC_ORDER_EMAIL_SENDER_VERIFIED = "false";
  let calls = 0;
  assert.equal(
    (
      await email.drainOrderEmails(
        sql,
        async () => {
          calls++;
          return Response.json({ id: "forbidden" });
        },
        1,
        id,
      )
    ).configured,
    false,
  );
  assert.equal(calls, 0);
});
