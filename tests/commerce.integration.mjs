import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createServer } from "vite";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.PAYPAL_CLIENT_SECRET)
  throw Error("Integration tests require isolated local storage and no provider credentials.");
let server, sql, core, mutations, read, webhooks, mfa;
const owner = { userId: "test-owner", role: "owner" },
  manager = { userId: "test-manager", role: "manager" },
  production = { userId: "test-production", role: "production" };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  ({ getSql: sql } = await server.ssrLoadModule("/src/lib/db.ts"));
  sql = await sql();
  core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
  mutations = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
  read = await server.ssrLoadModule("/src/lib/commerce/read.server.ts");
  webhooks = await server.ssrLoadModule("/src/lib/commerce/webhooks.server.ts");
  mfa = await server.ssrLoadModule("/src/lib/commerce/access.server.ts");
  for (const actor of [owner, manager, production]) {
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${actor.userId},${actor.role},${actor.userId + "@example.invalid"},true,now(),now())`;
    await sql`insert into merchant_staff(user_id,role) values(${actor.userId},${actor.role})`;
  }
});
after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await server?.close();
});
async function draft(extra = {}) {
  return (
    await mutations.mutate(
      "order.draft",
      {
        customerName: "Sandbox Customer",
        customerEmail: "buyer@example.invalid",
        title: "Custom hat",
        quantity: 2,
        unitAmount: 3000,
        specifications: "112 Black; medium rounded rectangle; buckskin; exact custom instructions",
        dueAt: null,
        requestId: randomUUID(),
        ...extra,
      },
      owner,
    )
  ).id;
}
test("role permissions restrict financial, customer, website and cross-assignment operations", async () => {
  assert.throws(() => core.assertPermission("manager", "finance"), /Access denied/);
  assert.throws(() => core.assertPermission("production", "customers"), /Access denied/);
  assert.throws(() => core.assertPermission(null, "orders"), /Access denied/);
  const id = await draft();
  await assert.rejects(
    () =>
      mutations.mutate(
        "payment.manual",
        {
          id,
          amount: 6000,
          reference: randomUUID(),
          reason: "sandbox receipt",
          occurredAt: new Date().toISOString(),
          requestId: randomUUID(),
        },
        manager,
      ),
    /Access denied/,
  );
  await assert.rejects(() => read.readOrder(id, production), /not assigned/);
  await assert.rejects(
    () => mutations.mutate("order.update", { id, version: 1, stage: "artwork_review" }, production),
    /not assigned/,
  );
});
test("immutable historical items and audit cannot be rewritten; ordinary order changes preserve specs", async () => {
  const id = await draft();
  const detail = await read.readOrder(id, owner);
  assert.match(detail.items[0].specifications.instructions, /medium rounded rectangle/);
  await assert.rejects(
    () => sql`update commerce_order_items set specifications='{}' where order_id=${id}`,
    /immutable/,
  );
  await assert.rejects(() => sql`delete from commerce_audit where resource_id=${id}`, /immutable/);
  await mutations.mutate("order.note", { id, body: "Original artwork needs review" }, owner);
  const next = await read.readOrder(id, owner);
  assert.deepEqual(next.items[0].specifications, detail.items[0].specifications);
  assert.equal(next.notes[0].actor_id, owner.userId);
});
test("unpaid orders excluded; partial payments, refunds, duplicate transactions and actual fees", async () => {
  const id = await draft();
  const before = (
    await read.readAdmin({ section: "overview", search: "", status: "", page: 0 }, owner)
  ).metrics.collected;
  const pay = {
    orderId: id,
    provider: "stripe",
    reference: "pi_" + randomUUID(),
    kind: "payment",
    amount: 3000,
    occurredAt: new Date().toISOString(),
  };
  await sql.transaction((tx) => core.recordPayment(tx, pay));
  assert.equal(await sql.transaction((tx) => core.recordPayment(tx, { ...pay, fee: 87 })), false);
  await sql.transaction((tx) => core.recordPayment(tx, { ...pay, fee: 87 }));
  const fees = await sql`select fee from commerce_payments where reference=${pay.reference}`;
  assert.equal(fees.length, 1);
  assert.equal(fees[0].fee, 87);
  const feeAudit =
    await sql`select actor_id from commerce_audit where resource_id=${id} and action='payment.fee_recorded'`;
  assert.equal(feeAudit.length, 1);
  assert.equal(feeAudit[0].actor_id, "stripe");
  assert.equal((await core.orderById(sql, id)).paid, 3000);
  assert.equal((await core.orderById(sql, id)).payment_status, "partially_paid");
  await sql.transaction((tx) =>
    core.recordPayment(tx, { ...pay, reference: "pi_" + randomUUID() }),
  );
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      ...pay,
      reference: "re_" + randomUUID(),
      kind: "refund",
      amount: 1000,
    }),
  );
  const order = await core.orderById(sql, id);
  assert.equal(order.paid, 6000);
  assert.equal(order.refunded, 1000);
  assert.equal(order.payment_status, "partially_refunded");
  const metrics = (
    await read.readAdmin({ section: "overview", search: "", status: "", page: 0 }, owner)
  ).metrics;
  assert.equal(metrics.collected - before, 6000);
  await assert.rejects(
    () =>
      sql.transaction((tx) =>
        core.recordPayment(tx, { ...pay, reference: randomUUID(), kind: "refund", amount: 6000 }),
      ),
    /exceeds/,
  );
});
test("inventory unknown by default, explicit recipe reservations, once-only commit/consume and cancellation", async () => {
  const { id: stock } = await mutations.mutate(
    "inventory.create",
    { sku: randomUUID(), title: "112 Black blank", category: "blank_hat", threshold: 2 },
    owner,
  );
  const [unknown] = await sql`select * from commerce_inventory where id=${stock}`;
  assert.equal(unknown.on_hand, null);
  const order = await draft();
  await mutations.mutate(
    "inventory.rule",
    { inventoryId: stock, productKey: "custom_draft", units: 1 },
    owner,
  );
  await assert.rejects(
    () => sql.transaction((tx) => core.reserveInventory(tx, order, "checkout")),
    /verified stock/,
  );
  const requestId = randomUUID();
  await mutations.mutate(
    "inventory.adjust",
    { id: stock, version: 1, delta: 10, reason: "Verified initial count", requestId },
    owner,
  );
  await mutations.mutate(
    "inventory.adjust",
    { id: stock, version: 1, delta: 10, reason: "Verified initial count", requestId },
    owner,
  );
  await sql.transaction((tx) => core.reserveInventory(tx, order, "checkout"));
  await sql.transaction((tx) => core.reserveInventory(tx, order, "checkout"));
  let [row] = await sql`select * from commerce_inventory where id=${stock}`;
  assert.equal(row.on_hand, 10);
  assert.equal(row.reserved, 2);
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      orderId: order,
      provider: "manual",
      reference: randomUUID(),
      kind: "payment",
      amount: 6000,
      occurredAt: new Date().toISOString(),
    }),
  );
  [row] = await sql`select * from commerce_inventory where id=${stock}`;
  assert.equal(row.reserved, 0);
  assert.equal(row.committed, 2);
  await mutations.mutate("order.update", { id: order, version: 1, stage: "engraving" }, owner);
  await mutations.mutate("order.update", { id: order, version: 2, stage: "assembly" }, owner);
  [row] = await sql`select * from commerce_inventory where id=${stock}`;
  assert.equal(row.on_hand, 8);
  assert.equal(row.committed, 0);
  const canceled = await draft();
  await sql.transaction((tx) => core.reserveInventory(tx, canceled, "checkout"));
  await mutations.mutate("order.update", { id: canceled, version: 1, stage: "canceled" }, owner);
  [row] = await sql`select * from commerce_inventory where id=${stock}`;
  assert.equal(row.on_hand, 8);
  assert.equal(row.reserved, 0);
  const entries =
    await sql`select * from commerce_movements where order_id=${order} and reason='Order inventory consume'`;
  assert.equal(entries.length, 1);
  await mutations.mutate(
    "inventory.rule",
    { inventoryId: stock, productKey: "custom_draft", units: 0 },
    owner,
  );
});
test("insufficient stock, stale updates and unpaid fulfillment are rejected atomically", async () => {
  const order = await draft();
  await assert.rejects(
    () =>
      mutations.mutate(
        "order.update",
        { id: order, version: 1, stage: "shipped", tracking: "TEST" },
        owner,
      ),
    /Full verified payment/,
  );
  await mutations.mutate(
    "order.update",
    { id: order, version: 1, stage: "artwork_review", assignedTo: production.userId },
    owner,
  );
  await assert.rejects(
    () => mutations.mutate("order.update", { id: order, version: 1, stage: "new" }, owner),
    /Order changed/,
  );
  const detail = await read.readOrder(order, production);
  assert.equal(detail.order.customer_email, "");
  assert.equal(detail.order.total, 0);
  await mutations.mutate(
    "order.update",
    { id: order, version: 2, stage: "customer_approval" },
    production,
  );
  await assert.rejects(
    () =>
      mutations.mutate("order.update", { id: order, version: 3, stage: "canceled" }, production),
    /production stages only/,
  );
});
test("product variants persist, public activation validated and builder configuration protected", async () => {
  const p = {
    title: "Sandbox shirt",
    description: "Cotton tee",
    category: "apparel",
    state: "draft",
    images: [],
    variants: [
      {
        title: "M / black",
        sku: randomUUID(),
        price: 2500,
        active: true,
        options: { size: "M", color: "black" },
      },
    ],
  };
  const { id } = await mutations.mutate("product.save", p, owner);
  let [product] = await sql`select * from commerce_products where id=${id}`;
  assert.equal(product.state, "draft");
  await assert.rejects(
    () => mutations.mutate("product.save", { ...p, id, version: 1, state: "active" }, owner),
    /real image/,
  );
  await assert.rejects(
    () => mutations.mutate("product.save", { ...p, builderFamily: "112" }, owner),
    /protected/,
  );
  await mutations.mutate(
    "product.save",
    { ...p, id, version: 1, images: ["/brand/rec-mama-made-louisiana-logo.jpeg"], state: "active" },
    owner,
  );
  const variants = await sql`select * from commerce_variants where product_id=${id}`;
  assert.equal(variants.filter((v) => v.active).length, 1);
  const { id: copy } = await mutations.mutate("product.duplicate", { id }, owner);
  assert.equal((await sql`select state from commerce_products where id=${copy}`)[0].state, "draft");
});
test("website content edits and controlled restore preserve audit and reject newer changes", async () => {
  await mutations.mutate(
    "content.save",
    { key: "announcement", value: "Sandbox announcement", version: 0 },
    owner,
  );
  const [entry] =
    await sql`select * from commerce_audit where resource_type='content' order by created_at desc limit 1`;
  await mutations.mutate("content.restore", { id: entry.id, version: 1 }, owner);
  assert.equal(
    (await sql`select value from commerce_content where key='announcement'`)[0].value,
    "",
  );
  await assert.rejects(
    () => mutations.mutate("content.restore", { id: entry.id, version: 2 }, owner),
    /Newer changes/,
  );
});
test("signed processor event is idempotent across duplicate event ids and transaction ids", async () => {
  const id = await draft();
  const session = {
    id: "cs_test_" + randomUUID(),
    metadata: { rec_order_id: id },
    currency: "usd",
    amount_total: 6000,
    payment_status: "paid",
    payment_intent: {
      id: "pi_test_" + randomUUID(),
      status: "succeeded",
      currency: "usd",
      amount_received: 6000,
      latest_charge: { created: Math.floor(Date.now() / 1000), balance_transaction: { fee: 180 } },
    },
  };
  const stripe = { checkout: { sessions: { retrieve: async () => session } } };
  const event = {
    id: "evt_" + randomUUID(),
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: session.id } },
  };
  await webhooks.processStripeEvent(event, stripe);
  await webhooks.processStripeEvent(event, stripe);
  await webhooks.processStripeEvent({ ...event, id: "evt_" + randomUUID() }, stripe);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  assert.equal((await sql`select id from commerce_payments where order_id=${id}`).length, 1);
  assert.equal(
    (await sql`select id from commerce_notifications where event_key=${"paid:" + id}`).length,
    1,
  );
});
test("failed webhook transaction rolls back event marker so retry can succeed", async () => {
  const id = await draft();
  let valid = false;
  const session = {
    id: "cs_" + randomUUID(),
    metadata: { rec_order_id: id },
    currency: "usd",
    amount_total: 5000,
    payment_status: "paid",
    payment_intent: {
      id: "pi_" + randomUUID(),
      status: "succeeded",
      currency: "usd",
      amount_received: 6000,
    },
  };
  const event = {
    id: "evt_" + randomUUID(),
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: session.id } },
  };
  const stripe = {
    checkout: {
      sessions: { retrieve: async () => ({ ...session, amount_total: valid ? 6000 : 5000 }) },
    },
  };
  await assert.rejects(() => webhooks.processStripeEvent(event, stripe), /mismatch/);
  assert.equal((await sql`select * from commerce_events where event_id=${event.id}`).length, 0);
  valid = true;
  await webhooks.processStripeEvent(event, stripe);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
});
test("MFA secret encryption, correct TOTP, reused codes and persistent failure lockout", async () => {
  process.env.ADMIN_MFA_ENCRYPTION_KEY = "1".repeat(64);
  const enrollment = await sql.transaction((tx) => mfa.enrollMfa(tx, owner.userId));
  const counter = Math.floor(Date.now() / 30000);
  const code = mfa.totp(enrollment.secret, counter);
  assert.equal(
    await sql.transaction((tx) => mfa.verifyMfa(tx, owner.userId, code, "test-session")),
    true,
  );
  assert.equal(
    await sql.transaction((tx) => mfa.verifyMfa(tx, owner.userId, code, "another-session")),
    false,
  );
  for (let i = 0; i < 5; i++)
    await sql.transaction((tx) => mfa.verifyMfa(tx, owner.userId, "xxxxxx", "test-session"));
  const [row] = await sql`select * from commerce_mfa where user_id=${owner.userId}`;
  assert.ok(row.blocked_until);
  assert.ok(!row.secret_encrypted.includes(enrollment.secret));
  delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
});
test("invoice review/create/send/resend uses one branded provider invoice and records no email-delivery claim", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_isolated_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_isolated_mock";
  process.env.REC_INVOICE_BRANDING_VERIFIED = "true";
  process.env.REC_INVOICE_SENDER = "invoices@example.invalid";
  try {
    const { manageInvoice } = await server.ssrLoadModule("/src/lib/commerce/invoices.server.ts");
    const id = await draft({ shipping: 500, tax: 200, discount: 100 });
    let creates = 0,
      sends = 0,
      customer = null,
      invoice = null;
    const lines = [];
    const mock = {
      accounts: {
        retrieve: async () => ({
          business_profile: { name: "REC Mama Made", support_email: "invoices@example.invalid" },
        }),
      },
      customers: {
        create: async (input) => (customer = { id: "cus_test_invoice", ...input }),
        retrieve: async () => customer,
      },
      invoices: {
        create: async (input) => {
          creates++;
          return (invoice = {
            id: "in_test_" + randomUUID(),
            status: "draft",
            customer: input.customer,
            customer_email: customer.email,
            total: 0,
            currency: "usd",
            metadata: input.metadata,
            livemode: false,
            hosted_invoice_url: "https://invoice.stripe.com/test",
            invoice_pdf: null,
          });
        },
        retrieve: async () => ({ ...invoice }),
        listLineItems: async () => ({ data: lines, has_more: false }),
        finalizeInvoice: async () => {
          invoice.status = "open";
          return { ...invoice };
        },
        sendInvoice: async () => {
          sends++;
          return { ...invoice };
        },
      },
      invoiceItems: {
        create: async (input) => {
          lines.push({ metadata: input.metadata, amount: input.amount });
          invoice.total += input.amount;
          return { id: randomUUID() };
        },
      },
    };
    await manageInvoice(id, "create", owner.userId, mock);
    await manageInvoice(id, "create", owner.userId, mock);
    assert.equal(creates, 1);
    assert.equal(invoice.total, 6600);
    assert.equal(lines.length, 4);
    const sent = await manageInvoice(id, "send", owner.userId, mock);
    assert.equal(sent.testMode, true);
    await assert.rejects(() => manageInvoice(id, "send", owner.userId, mock), /already sent/);
    await manageInvoice(id, "resend", owner.userId, mock);
    assert.equal(sends, 2);
    const logs =
      await sql`select after_value from commerce_audit where action='invoice.sent' and resource_id=${id}`;
    assert.match(logs[0].after_value.delivery, /no customer email sent/);
    assert.equal((await core.orderById(sql, id)).paid, 0);
  } finally {
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "REC_INVOICE_BRANDING_VERIFIED",
      "REC_INVOICE_SENDER",
    ])
      delete process.env[key];
  }
});
test("invalid webhook signatures cannot mutate records; native Stripe verifier accepts a signed test event", async () => {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe("sk_test_isolated_mock");
  const payload = JSON.stringify({
    id: "evt_signature_test",
    type: "checkout.session.completed",
    data: { object: { id: "cs_test" } },
  });
  const secret = "whsec_isolated_mock";
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, signature, secret).id, "evt_signature_test");
  process.env.STRIPE_SECRET_KEY = "sk_test_isolated_mock";
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  try {
    const before = (await sql`select count(*)::int as count from commerce_events`)[0].count;
    const response = await webhooks.stripeWebhook(
      new Request("http://localhost:8080/api/webhooks/stripe", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": "invalid" },
      }),
    );
    assert.equal(response.status, 400);
    assert.equal((await sql`select count(*)::int as count from commerce_events`)[0].count, before);
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

test("owner refund requests preserve the sale and are idempotent with pending-balance protection", async () => {
  const { requestRefund } = await server.ssrLoadModule("/src/lib/commerce/refunds.server.ts");
  const id = await draft();
  const reference = "pi_refund_" + randomUUID();
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      orderId: id,
      provider: "stripe",
      reference,
      kind: "payment",
      amount: 6000,
      occurredAt: new Date().toISOString(),
    }),
  );
  const [payment] = await sql`select id from commerce_payments where reference=${reference}`;
  let calls = 0;
  const mock = {
    refunds: {
      create: async (input) => {
        calls++;
        return {
          id: "re_" + randomUUID(),
          status: "succeeded",
          created: Math.floor(Date.now() / 1000),
          amount: input.amount,
        };
      },
    },
  };
  const input = {
    orderId: id,
    paymentId: payment.id,
    amount: 1000,
    reason: "Sandbox verified refund",
    requestId: randomUUID(),
  };
  await requestRefund(input, owner.userId, mock);
  await requestRefund(input, owner.userId, mock);
  assert.equal(calls, 1);
  assert.equal((await core.orderById(sql, id)).refunded, 1000);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  await assert.rejects(
    () => requestRefund({ ...input, requestId: randomUUID(), amount: 6000 }, owner.userId, mock),
    /exceeds/,
  );
  const pending = {
    refunds: {
      create: async () => ({
        id: "re_pending_" + randomUUID(),
        status: "pending",
        created: Math.floor(Date.now() / 1000),
      }),
    },
  };
  await requestRefund({ ...input, requestId: randomUUID(), amount: 4000 }, owner.userId, pending);
  await assert.rejects(
    () => requestRefund({ ...input, requestId: randomUUID(), amount: 2000 }, owner.userId, mock),
    /exceeds/,
  );
  assert.equal(
    (await sql`select * from commerce_audit where action='refund.initiated' and resource_id=${id}`)
      .length,
    2,
  );
  await assert.rejects(
    () => mutations.mutate("order.update", { id, version: 1, stage: "engraving" }, owner),
    /Full verified payment/,
  );
});

test("catalog text overlays preserve existing builder models, pricing and historical specifications", async () => {
  const catalog = await server.ssrLoadModule("/src/lib/catalog.ts");
  const before = JSON.stringify(catalog.FAMILIES);
  const id = await draft();
  const original = (await read.readOrder(id, owner)).items[0].specifications;
  await mutations.mutate(
    "product.builder_content",
    {
      family: "112",
      title: "TEST Catalog title",
      description: "TEST Safe catalog description",
      version: 0,
    },
    owner,
  );
  const [row] = await sql`select * from commerce_products where builder_family='112'`;
  assert.equal(row.title, "TEST Catalog title");
  assert.equal((await sql`select * from commerce_variants where product_id=${row.id}`).length, 0);
  assert.equal(JSON.stringify(catalog.FAMILIES), before);
  assert.deepEqual((await read.readOrder(id, owner)).items[0].specifications, original);
  await assert.rejects(
    () =>
      mutations.mutate(
        "product.save",
        {
          id: row.id,
          version: 1,
          title: "Unsafe",
          description: "",
          category: "Custom hats",
          state: "archived",
          images: [],
          variants: [],
        },
        owner,
      ),
    /cannot be rewritten/,
  );
});

test("custom checkout freezes artwork, exact options and placement without counting pending money", async () => {
  const checkout = await server.ssrLoadModule("/src/lib/commerce/checkout.server.ts");
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYwoAAAAASUVORK5CYII=";
  assert.throws(
    () => checkout.decodeArtwork("data:image/png;base64," + Buffer.from("fake").toString("base64")),
    /content/,
  );
  const build = {
    customerName: "Sandbox Custom Buyer",
    customerEmail: "custom@example.invalid",
    orderType: "hat",
    family: "112",
    colorway: "Black",
    leatherette: "buckskin",
    patchShape: "rectangle",
    patchSize: "medium",
    placement: "front",
    quantity: 2,
    patchText: "",
    hasArtwork: true,
    notes: "Preserve exact instructions",
    promo: "",
    artworkDataUrl: png,
    checkoutRequestId: randomUUID(),
    previewPlacement: { offsetX: 3, offsetY: -2, scale: 1.1, position: { u: 0.5, v: 0.4 } },
  };
  const quote = {
    build,
    lineName: "Sandbox custom 112",
    description: "Original customer configuration",
    unit: 30,
    purchased: 2,
    bonus: 0,
    fulfilled: 2,
    total: 60,
  };
  const id = await checkout.createCheckoutOrder(quote, "stripe", async () => null);
  await checkout.createCheckoutOrder(quote, "stripe", async () => null);
  const detail = await read.readOrder(id, owner);
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].has_artwork, true);
  assert.equal(detail.items[0].specifications.leatherette, "buckskin");
  assert.deepEqual(detail.items[0].specifications.previewPlacement, build.previewPlacement);
  assert.equal(detail.order.paid, 0);
  await assert.rejects(
    () =>
      checkout.createCheckoutOrder(
        { ...quote, build: { ...build, notes: "Changed" } },
        "stripe",
        async () => null,
      ),
    /Checkout changed/,
  );
});

test("PayPal verified sandbox capture/refund events use trusted references and process once", async () => {
  const id = await draft();
  const reference = "PPORDER" + randomUUID().replaceAll("-", "");
  const capture = "PPCAPTURE" + randomUUID().replaceAll("-", "");
  await sql`insert into commerce_checkouts(provider,reference,order_id) values('paypal',${reference},${id})`;
  const originalFetch = globalThis.fetch;
  process.env.PAYPAL_CLIENT_ID = "sandbox_test";
  process.env.PAYPAL_CLIENT_SECRET = "sandbox_test";
  process.env.PAYPAL_WEBHOOK_ID = "sandbox_webhook";
  process.env.PAYPAL_ENVIRONMENT = "sandbox";
  globalThis.fetch = async (url) =>
    new Response(
      JSON.stringify(
        String(url).includes("oauth2")
          ? { access_token: "mock_token" }
          : { verification_status: "SUCCESS" },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const deliver = (event) =>
      webhooks.paypalWebhook(
        new Request("http://localhost/api/webhooks/paypal", {
          method: "POST",
          body: JSON.stringify(event),
        }),
      );
    const event = {
      id: "WH-" + randomUUID(),
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      create_time: new Date().toISOString(),
      resource: {
        id: capture,
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "60.00" },
        supplementary_data: { related_ids: { order_id: reference } },
      },
    };
    assert.equal((await deliver(event)).status, 200);
    assert.equal((await deliver(event)).status, 200);
    assert.equal((await core.orderById(sql, id)).paid, 6000);
    const refund = {
      id: "WH-" + randomUUID(),
      event_type: "PAYMENT.CAPTURE.REFUNDED",
      create_time: new Date().toISOString(),
      resource: {
        id: "PPREFUND" + randomUUID(),
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "10.00" },
        links: [
          { rel: "up", href: "https://api-m.sandbox.paypal.com/v2/payments/captures/" + capture },
        ],
      },
    };
    assert.equal((await deliver(refund)).status, 200);
    assert.equal((await deliver(refund)).status, 200);
    assert.equal((await core.orderById(sql, id)).refunded, 1000);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_WEBHOOK_ID",
      "PAYPAL_ENVIRONMENT",
    ])
      delete process.env[key];
  }
});

test("historical Stripe reconciliation imports true amounts and refunds once without inventing stock or artwork", async () => {
  const { previewStripeHistory, importStripeHistory } = await server.ssrLoadModule(
    "/src/lib/commerce/reconciliation.server.ts",
  );
  const created = Math.floor(Date.now() / 1000) - 86400;
  const s = {
    id: "cs_test_history_" + randomUUID().replaceAll("-", ""),
    mode: "payment",
    payment_status: "paid",
    currency: "usd",
    amount_subtotal: 6000,
    amount_total: 6600,
    total_details: { amount_discount: 100, amount_shipping: 500, amount_tax: 200 },
    created,
    customer_details: { name: "Historical sandbox customer", email: "history@example.invalid" },
    metadata: { family: "112", shape: "rectangle" },
    payment_intent: {
      id: "pi_history_" + randomUUID(),
      status: "succeeded",
      currency: "usd",
      amount_received: 6600,
      latest_charge: { created, balance_transaction: { fee: 180 } },
    },
  };
  const mock = {
    checkout: {
      sessions: {
        list: async () => ({ data: [s], has_more: false }),
        retrieve: async () => s,
        listLineItems: async () => ({
          data: [
            {
              id: "li_original",
              description: "Original purchased custom hats",
              quantity: 2,
              amount_subtotal: 6000,
            },
          ],
          has_more: false,
        }),
      },
    },
    refunds: {
      list: async () => ({
        data: [
          { id: "re_history_" + s.id, status: "succeeded", currency: "usd", amount: 1000, created },
        ],
        has_more: false,
      }),
    },
  };
  const p = await previewStripeHistory({ from: "2026-01-01", to: "2027-01-01" }, mock);
  assert.equal(p.rows[0].imported, false);
  const first = await importStripeHistory(s.id, owner.userId, mock);
  assert.equal(first.imported, true);
  assert.equal((await importStripeHistory(s.id, owner.userId, mock)).imported, false);
  const detail = await read.readOrder(first.id, owner);
  assert.equal(detail.order.total, 6600);
  assert.equal(detail.order.paid, 6600);
  assert.equal(detail.order.refunded, 1000);
  assert.equal(detail.items[0].has_artwork, false);
  assert.match(detail.items[0].specifications.historicalLimitations, /not independently verified/);
  assert.equal(detail.order.stage, "new");
  assert.equal(
    (await sql`select * from commerce_allocations where order_id=${first.id}`).length,
    0,
  );
});

test("inventory planning settings require recorded references and optimistic concurrency without changing stock", async () => {
  const { id } = await mutations.mutate(
    "inventory.create",
    { sku: randomUUID(), title: "Verified blank apparel", category: "apparel", threshold: 2 },
    owner,
  );
  await mutations.mutate(
    "inventory.settings",
    { id, version: 1, threshold: 5, incoming: 24, reason: "Sandbox supplier purchase reference" },
    manager,
  );
  const [row] = await sql`select * from commerce_inventory where id=${id}`;
  assert.equal(row.on_hand, null);
  assert.equal(row.threshold, 5);
  assert.equal(row.incoming, 24);
  await assert.rejects(
    () =>
      mutations.mutate(
        "inventory.settings",
        { id, version: 1, threshold: 0, incoming: 0, reason: "Stale update" },
        owner,
      ),
    /Stock changed/,
  );
});

test("pending Stripe refund settles through verified updated events without duplicate refund ledger entries", async () => {
  const id = await draft();
  const reference = "pi_pending_" + randomUUID();
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      orderId: id,
      provider: "stripe",
      reference,
      kind: "payment",
      amount: 6000,
      occurredAt: new Date().toISOString(),
    }),
  );
  const event = {
    id: "evt_refund_" + randomUUID(),
    type: "refund.updated",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "re_pending_" + randomUUID() } },
  };
  const mock = {
    refunds: {
      retrieve: async () => ({
        id: event.data.object.id,
        status: "succeeded",
        payment_intent: reference,
        currency: "usd",
        amount: 500,
        created: event.created,
        metadata: null,
      }),
    },
  };
  await webhooks.processStripeEvent(event, mock);
  await webhooks.processStripeEvent({ ...event, id: "evt_refund_" + randomUUID() }, mock);
  assert.equal((await core.orderById(sql, id)).refunded, 500);
});

test("payment and inventory status filters return underlying real records consistently", async () => {
  const unpaid = await read.readAdmin(
    { section: "payments", search: "", status: "unpaid", page: 0 },
    owner,
  );
  assert.ok(unpaid.orders.length > 0);
  assert.ok(unpaid.orders.every((o) => o.payment_status === "unpaid"));
  const setup = await read.readAdmin(
    { section: "inventory", search: "", status: "setup_required", page: 0 },
    owner,
  );
  assert.ok(setup.inventory.length > 0);
  assert.ok(setup.inventory.every((i) => i.on_hand === null));
  const available = await read.readAdmin(
    { section: "inventory", search: "", status: "available", page: 0 },
    owner,
  );
  assert.ok(available.inventory.every((i) => i.on_hand - i.reserved - i.committed > 0));
});

test("expired uncertain financial attempts fail closed instead of repeating provider operations", async () => {
  const checkout = await server.ssrLoadModule("/src/lib/commerce/checkout.server.ts");
  const build = {
    customerName: "Sandbox retry",
    customerEmail: "retry@example.invalid",
    orderType: "hat",
    family: "112",
    colorway: "Black",
    leatherette: "buckskin",
    patchShape: "rectangle",
    patchSize: "medium",
    placement: "front",
    quantity: 1,
    patchText: "TEST",
    hasArtwork: false,
    notes: "",
    promo: "",
    checkoutRequestId: randomUUID(),
  };
  const quote = {
    build,
    lineName: "Sandbox",
    description: "Test only",
    unit: 30,
    purchased: 1,
    bonus: 0,
    fulfilled: 1,
    total: 30,
  };
  const id = await checkout.createCheckoutOrder(quote, "stripe", async () => null);
  await sql`update commerce_orders set created_at=now()-interval '25 hours' where id=${id}`;
  await assert.rejects(
    () => checkout.createCheckoutOrder(quote, "stripe", async () => null),
    /too old/,
  );
  const order = await draft();
  const paymentReference = "PP_CAPTURE_" + randomUUID();
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      orderId: order,
      provider: "paypal",
      reference: paymentReference,
      kind: "payment",
      amount: 6000,
      occurredAt: new Date().toISOString(),
    }),
  );
  const [payment] = await sql`select id from commerce_payments where reference=${paymentReference}`;
  const requestId = randomUUID();
  await sql`insert into commerce_refund_requests(id,order_id,payment_id,amount,reason,actor_id,state,created_at) values(${requestId},${order},${payment.id},500,'Sandbox uncertain request',${owner.userId},'review_required',now()-interval '6 hours')`;
  const { requestRefund } = await server.ssrLoadModule("/src/lib/commerce/refunds.server.ts");
  await assert.rejects(
    () =>
      requestRefund(
        {
          orderId: order,
          paymentId: payment.id,
          amount: 500,
          reason: "Sandbox uncertain request",
          requestId,
        },
        owner.userId,
      ),
    /too old/,
  );
  assert.equal((await core.orderById(sql, order)).refunded, 0);
});

test("shipment history cannot be canceled or moved back into production by ordinary order edits", async () => {
  const id = await draft();
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      orderId: id,
      provider: "manual",
      reference: randomUUID(),
      kind: "payment",
      amount: 6000,
      occurredAt: new Date().toISOString(),
    }),
  );
  await mutations.mutate(
    "order.update",
    { id, version: 1, stage: "shipped", tracking: "SANDBOX-TRACKING", carrier: "Sandbox carrier" },
    owner,
  );
  await assert.rejects(
    () => mutations.mutate("order.update", { id, version: 2, stage: "canceled" }, owner),
    /Shipment history/,
  );
  await assert.rejects(
    () => mutations.mutate("order.update", { id, version: 2, stage: "engraving" }, owner),
    /Shipment history/,
  );
  assert.equal((await core.orderById(sql, id)).stage, "shipped");
});

test("voiding unpaid invoices preserves provider references and prevents a second payable obligation before manual receipts", async () => {
  const { voidInvoice } = await server.ssrLoadModule("/src/lib/commerce/invoice-void.server.ts");
  const id = await draft(),
    reference = "in_sandbox_" + randomUUID();
  await sql`insert into commerce_invoices(order_id,provider_id,state) values(${id},${reference},'open')`;
  const receipt = {
    id,
    amount: 6000,
    reference: "Sandbox cash receipt",
    reason: "Verified sandbox cash receipt",
    occurredAt: new Date().toISOString(),
    requestId: randomUUID(),
  };
  await assert.rejects(() => mutations.mutate("payment.manual", receipt, owner), /Void the unpaid/);
  const provider = {
    id: reference,
    status: "open",
    metadata: { rec_order_id: id },
    livemode: false,
    hosted_invoice_url: null,
    invoice_pdf: null,
  };
  let calls = 0;
  const client = {
    invoices: {
      retrieve: async () => ({ ...provider }),
      voidInvoice: async () => {
        calls++;
        provider.status = "void";
        return { ...provider };
      },
    },
  };
  assert.equal((await voidInvoice(id, owner.userId, client)).state, "void");
  await voidInvoice(id, owner.userId, client);
  assert.equal(calls, 1);
  assert.equal((await core.orderById(sql, id)).paid, 0);
  assert.equal(
    (await sql`select provider_id from commerce_invoices where order_id=${id}`)[0].provider_id,
    reference,
  );
  await mutations.mutate("payment.manual", receipt, owner);
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  await assert.rejects(() => voidInvoice(id, owner.userId, client), /Collected orders/);
});

test("production files preserve original artwork, enforce assignment and reject rewritten or mismatched retry content", async () => {
  const { saveProductionFile } = await server.ssrLoadModule(
    "/src/lib/commerce/production-files.server.ts",
  );
  const id = await draft();
  const before = (await read.readOrder(id, owner)).items;
  const input = {
    orderId: id,
    name: "approved-proof.pdf",
    data:
      "data:application/pdf;base64," +
      Buffer.from("%PDF-1.7\nSandbox production proof").toString("base64"),
    reason: "Sandbox customer approved proof",
    requestId: randomUUID(),
  };
  await assert.rejects(() => saveProductionFile(input, production), /not assigned/);
  await assert.rejects(
    () =>
      saveProductionFile(
        {
          ...input,
          data: "data:application/pdf;base64," + Buffer.from("not pdf").toString("base64"),
        },
        owner,
      ),
    /does not match/,
  );
  const file = await saveProductionFile(input, owner);
  assert.deepEqual(await saveProductionFile(input, owner), file);
  await assert.rejects(
    () => saveProductionFile({ ...input, reason: "Different approval reference" }, owner),
    /different content/,
  );
  await assert.rejects(
    () => sql`update commerce_production_files set name='overwritten' where id=${file.id}`,
    /immutable/,
  );
  const detail = await read.readOrder(id, owner);
  assert.equal(detail.productionFiles.length, 1);
  assert.deepEqual(detail.items, before);
  assert.equal(detail.productionFiles[0].actor_id, owner.userId);
});

test("recovery codes are hashed, replace older sets, invalidate lost-device proofs and cannot be replayed", async () => {
  const old = process.env.ADMIN_MFA_ENCRYPTION_KEY;
  process.env.ADMIN_MFA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  try {
    await sql`delete from commerce_mfa where user_id=${manager.userId}`;
    const enrollment = await sql.transaction((tx) => mfa.enrollMfa(tx, manager.userId));
    assert.equal(
      await sql.transaction((tx) =>
        mfa.verifyMfa(
          tx,
          manager.userId,
          mfa.totp(enrollment.secret, Math.floor(Date.now() / 30000)),
          "test-recovery-session",
        ),
      ),
      true,
    );
    const first = await sql.transaction((tx) => mfa.createRecoveryCodes(tx, manager.userId));
    const second = await sql.transaction((tx) => mfa.createRecoveryCodes(tx, manager.userId));
    const hashes =
      await sql`select digest from commerce_mfa_recovery where user_id=${manager.userId}`;
    assert.equal(hashes.length, 8);
    assert.ok(hashes.every((r) => !second.includes(r.digest) && r.digest.length === 64));
    assert.equal(
      await sql.transaction((tx) => mfa.recoverMfa(tx, manager.userId, first[0])),
      false,
    );
    assert.equal(
      await sql.transaction((tx) => mfa.recoverMfa(tx, manager.userId, second[0])),
      true,
    );
    assert.equal(
      await sql.transaction((tx) => mfa.recoverMfa(tx, manager.userId, second[0])),
      false,
    );
    assert.equal(
      (await sql`select * from commerce_mfa_sessions where user_id=${manager.userId}`).length,
      0,
    );
    assert.equal(
      (await sql`select enabled from commerce_mfa where user_id=${manager.userId}`)[0].enabled,
      false,
    );
    assert.equal(
      (await sql`select * from commerce_mfa_recovery where user_id=${manager.userId}`).length,
      0,
    );
  } finally {
    if (old === undefined) delete process.env.ADMIN_MFA_ENCRYPTION_KEY;
    else process.env.ADMIN_MFA_ENCRYPTION_KEY = old;
  }
});

test("complete filtered exports span pages, retain provider references, prevent formula execution and enforce section permissions", async () => {
  const { exportRecords, csvCell } = await server.ssrLoadModule(
    "/src/lib/commerce/export.server.ts",
  );
  const ids = [];
  for (let n = 0; n < 57; n++) ids.push(await draft({ customerName: "EXPORT TEST " + n }));
  const input = { section: "orders", search: "EXPORT TEST", status: "", page: 0 };
  const result = await exportRecords(input, owner);
  assert.equal(result.count, 57);
  assert.equal(result.csv.split("\r\n").length, 58);
  assert.ok(ids.every((id) => result.csv.includes(id)));
  assert.equal(csvCell('\t=HYPERLINK("bad")'), '"\'\t=HYPERLINK(""bad"")"');
  await assert.rejects(
    () => exportRecords({ ...input, section: "payments" }, manager),
    /Access denied/,
  );
  await assert.rejects(() => exportRecords(input, production), /Access denied/);
  await assert.rejects(
    () => exportRecords({ ...input, section: "security" }, owner),
    /does not support/,
  );
  const audit =
    await sql`select actor_id,after_value from commerce_audit where action='report.records_exported' and resource_id='orders' order by created_at desc limit 1`;
  assert.equal(audit[0].actor_id, owner.userId);
  assert.equal(audit[0].after_value.count, 57);
});

test("scheduled publication persists an exact timestamp, stays inaccessible before it and ordinary resaves can cancel the schedule", async () => {
  const publishAt = new Date(Date.now() + 86400000).toISOString();
  const input = {
    title: "Scheduled TEST product",
    description: "Sandbox",
    category: "Sandbox",
    state: "active",
    publishAt,
    images: ["/assets/test.png"],
    variants: [{ title: "Default", sku: randomUUID(), price: 1000, active: true }],
  };
  const product = await mutations.mutate("product.save", input, owner);
  const [saved] =
    await sql`select publish_at,version from commerce_products where id=${product.id}`;
  assert.equal(new Date(saved.publish_at).toISOString(), publishAt);
  const eligible =
    await sql`select id from commerce_products where id=${product.id} and state='active' and (publish_at is null or publish_at<=now())`;
  assert.equal(eligible.length, 0);
  await mutations.mutate(
    "product.save",
    { ...input, id: product.id, version: saved.version, publishAt: null },
    owner,
  );
  assert.equal(
    (await sql`select publish_at from commerce_products where id=${product.id}`)[0].publish_at,
    null,
  );
});

test("private owner setup requires the configured recipient, expires, redeems once and audits without rewriting accounts", async () => {
  const { redeemOwnerInvitation, inspectOwnerInvitation } = await server.ssrLoadModule(
    "/src/lib/commerce/owner-setup.server.ts",
  );
  const token = randomBytes(32).toString("base64url"),
    userId = randomUUID(),
    email = "private-invited-owner@example.invalid";
  const keys = ["REC_OWNER_INVITE_SHA256", "REC_OWNER_INVITE_EMAIL", "REC_OWNER_INVITE_EXPIRES_AT"];
  const previous = keys.map((k) => process.env[k]);
  try {
    process.env.REC_OWNER_INVITE_SHA256 = createHash("sha256").update(token).digest("hex");
    process.env.REC_OWNER_INVITE_EMAIL = email;
    process.env.REC_OWNER_INVITE_EXPIRES_AT = new Date(Date.now() + 60000).toISOString();
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${userId},'Invited account',${email},false,now(),now())`;
    await assert.rejects(
      () => inspectOwnerInvitation(randomBytes(32).toString("base64url")),
      /invalid or expired/,
    );
    await assert.rejects(() => redeemOwnerInvitation(sql, manager.userId, token), /account named/);
    assert.equal((await sql`select digest from commerce_owner_setup_uses`).length, 0);
    assert.deepEqual(await inspectOwnerInvitation(token), { email, hasAccount: true });
    process.env.REC_OWNER_INVITE_EXPIRES_AT = new Date(Date.now() - 1000).toISOString();
    await assert.rejects(() => redeemOwnerInvitation(sql, userId, token), /invalid or expired/);
    process.env.REC_OWNER_INVITE_EXPIRES_AT = new Date(Date.now() + 60000).toISOString();
    assert.equal((await redeemOwnerInvitation(sql, userId, token)).role, "owner");
    await assert.rejects(() => redeemOwnerInvitation(sql, userId, token), /already been used/);
    await assert.rejects(
      () => sql`delete from commerce_owner_setup_uses where user_id=${userId}`,
      /immutable/,
    );
    const [account] = await sql`select name,"emailVerified" from "user" where id=${userId}`;
    assert.equal(account.name, "Invited account");
    assert.equal(account.emailVerified, false);
    const [audit] =
      await sql`select actor_id,action from commerce_audit where resource_id=${userId} and action='staff.owner_invite_accepted'`;
    assert.equal(audit.actor_id, userId);
    assert.equal(
      (await sql`select role from merchant_staff where user_id=${userId}`)[0].role,
      "owner",
    );
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});
