import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "vite";
import { PDFDocument } from "pdf-lib";
import Stripe from "stripe";
for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "STRIPE_WEBHOOK_SECRET"])
  if (process.env[key])
    throw Error("Studio tests refuse external credentials and persistent databases.");
let server, sql, studio, core, mutations, media, email, hold, webhooks;
const owner = { userId: "studio-test-owner", role: "owner" };
const originalEnv = { ...process.env };
const tokenOf = (p) => p.split("/").at(-1);
const futureDay = () => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
const body = () => ({
  customerName: "TEST FIXTURE ONLY",
  customerEmail: "customer@example.invalid",
  billingAddress: "",
  shippingAddress: "",
  lines: [
    {
      id: randomUUID(),
      kind: "product",
      title: "TEST custom hat",
      quantity: 2,
      unitAmount: 3000,
      specifications: "Richardson 112; 3 x 2 in leatherette; test only",
      productKey: "",
    },
    {
      id: randomUUID(),
      kind: "design",
      title: "TEST design setup",
      quantity: 1,
      unitAmount: 1000,
      specifications: "Test design services",
      productKey: "",
    },
  ],
  shipping: 500,
  tax: 210,
  discount: 100,
  dueDate: futureDay(),
  terms: "TEST ONLY owner-entered terms",
  notes: "Not a real invoice",
  availabilityConfirmed: true,
  totalsConfirmed: true,
});
const proofBody = (mediaId) => ({
  title: "TEST proof",
  notes: "TEST ONLY - do not produce",
  details: [
    { label: "Model", value: "Richardson 112" },
    { label: "Patch size", value: "3 x 2 inches" },
    { label: "Material", value: "Laser-cut leatherette, no stitching" },
    { label: "Placement", value: "Front crown, centered" },
  ],
  mediaIds: [mediaId],
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
});
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  studio = await server.ssrLoadModule("/src/lib/commerce/studio.server.ts");
  core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
  mutations = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
  media = await server.ssrLoadModule("/src/lib/commerce/media.server.ts");
  email = await server.ssrLoadModule("/src/lib/commerce/studio-email.server.ts");
  hold = await server.ssrLoadModule("/src/lib/commerce/proof-hold.server.ts");
  webhooks = await server.ssrLoadModule("/src/lib/commerce/webhooks.server.ts");
  await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${owner.userId},'TEST OWNER','owner@example.invalid',true,now(),now())`;
  await sql`insert into merchant_staff(user_id,role) values(${owner.userId},'owner')`;
  await sql`insert into commerce_content(key,value) values('contact_email','shop@example.invalid'),('contact_phone','TEST FIXTURE CONTACT')`;
  mkdirSync("artifacts/studio", { recursive: true });
});
after(async () => {
  await server?.close();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});
async function invoice() {
  const id = randomUUID();
  await studio.saveStudio({ kind: "invoice", id, version: 0, orderId: null, body: body() }, owner);
  const issued = await studio.actOnStudio({ id, version: 1, action: "issue" }, owner);
  return {
    id,
    path: issued.path,
    token: tokenOf(issued.path),
    view: await studio.viewStudio(tokenOf(issued.path)),
  };
}
async function photo() {
  return media.uploadMedia(
    {
      name: "TEST owned source.jpg",
      alt: "Test proof image",
      data:
        "data:image/jpeg;base64," +
        readFileSync("public/brand/rec-mama-made-app-logo.jpg").toString("base64"),
    },
    owner,
  );
}
async function proof(orderId, mediaId, baseBody = proofBody(mediaId)) {
  const id = randomUUID();
  await studio.saveStudio({ id, kind: "proof", version: 0, orderId, body: baseBody }, owner);
  const issued = await studio.actOnStudio({ id, version: 1, action: "issue" }, owner);
  const token = tokenOf(issued.path);
  return { id, token, path: issued.path, view: await studio.viewStudio(token) };
}
async function payment(orderId) {
  await sql.transaction((tx) =>
    core.recordPayment(tx, {
      orderId,
      provider: "isolated_test",
      reference: randomUUID(),
      kind: "payment",
      amount: 7610,
      occurredAt: new Date().toISOString(),
      actor: owner.userId,
    }),
  );
}
async function advance(orderId, stage = "engraving") {
  const o = await core.orderById(sql, orderId);
  return mutations.mutate("order.update", { id: orderId, version: o.version, stage }, owner);
}
const answer = (p, action = "approve", message = "") => ({
  token: p.token,
  version: p.view.document.version,
  action,
  name: "TEST CUSTOMER",
  email: "customer@example.invalid",
  message,
  confirmed: true,
});

test("draft totals, line validation, role permissions and generated Letter PDF", async () => {
  const id = randomUUID(),
    b = body();
  await assert.rejects(
    () =>
      studio.saveStudio(
        { id, kind: "invoice", version: 0, orderId: null, body: b },
        { userId: "customer", role: null },
      ),
    /Access denied/,
  );
  for (const bad of [
    { ...b, tax: -1 },
    { ...b, discount: 8000 },
    { ...b, lines: [{ ...b.lines[0], quantity: 1.5 }] },
    { ...b, currency: "USD" },
  ])
    await assert.rejects(() =>
      studio.saveStudio({ id, kind: "invoice", version: 0, orderId: null, body: bad }, owner),
    );
  await studio.saveStudio({ id, kind: "invoice", version: 0, orderId: null, body: b }, owner);
  const d = (await studio.studioOwnerDocument(id, owner)).document;
  assert.equal(d.subtotal, 7000);
  assert.equal(d.total, 7610);
  const file = await studio.studioBinary(id, owner, null, "pdf");
  const pdf = await PDFDocument.load(file.bytes);
  assert.equal(pdf.getPage(0).getWidth(), 612);
  assert.equal(pdf.getPage(0).getHeight(), 792);
  writeFileSync("artifacts/studio/invoice-draft.pdf", file.bytes);
  await assert.rejects(
    () => studio.saveStudio({ id, kind: "invoice", version: 0, orderId: null, body: b }, owner),
    /changed/,
  );
});
test("concurrent issue creates one invoice and one order, freezes amounts and protects private PDFs", async () => {
  const id = randomUUID(),
    b = body();
  await studio.saveStudio({ id, kind: "invoice", version: 0, orderId: null, body: b }, owner);
  const results = await Promise.allSettled([
    studio.actOnStudio({ id, version: 1, action: "issue" }, owner),
    studio.actOnStudio({ id, version: 1, action: "issue" }, owner),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const token = tokenOf(results.find((r) => r.status === "fulfilled").value.path),
    v = await studio.viewStudio(token);
  assert.equal(v.status, "unpaid");
  assert.equal(v.document.sender.email, "shop@example.invalid");
  assert.equal(v.document.total, 7610);
  await assert.rejects(
    () => sql`update commerce_studio_documents set total=1 where id=${id}`,
    /immutable/,
  );
  await assert.rejects(
    () => studio.saveStudio({ id, kind: "invoice", version: 2, orderId: null, body: b }, owner),
    /association|frozen/,
  );
  assert.equal(await studio.studioBinary(id, null, null, "pdf"), null);
  assert.equal(await studio.studioBinary(randomUUID(), null, token, "pdf"), null);
  assert.equal(await studio.viewStudio("invalid"), null);
  const pdf = await studio.studioBinary(id, null, token, "pdf");
  writeFileSync("artifacts/studio/invoice-issued.pdf", pdf.bytes);
  const oldHash = createHash("sha256").update(pdf.bytes).digest("hex");
  await sql`insert into commerce_content(key,value) values('studio_test_price','999999')`;
  assert.equal(
    createHash("sha256")
      .update((await studio.studioBinary(id, null, token, "pdf")).bytes)
      .digest("hex"),
    oldHash,
  );
});
test("proof v1 revision, v2 approval, expired and superseded capabilities, no payment coupling and production combinations", async () => {
  const i = await invoice(),
    m = await photo(),
    p1 = await proof(i.view.document.order_id, m.id);
  const orderId = i.view.document.order_id;
  assert.equal((await hold.proofReadiness(sql, orderId)).blocked, true);
  await assert.rejects(() => advance(orderId), /Full verified payment/);
  await payment(orderId);
  await assert.rejects(() => advance(orderId), /Artwork Approval Hold/);
  await assert.rejects(
    () => studio.answerProof({ ...answer(p1), email: "wrong@example.invalid" }),
    /customer email/,
  );
  await assert.rejects(() => studio.answerProof({ ...answer(p1, "changes", "") }), /Describe/);
  const changes = answer(p1, "changes", "Move the patch slightly lower.");
  await studio.answerProof(changes);
  await studio.answerProof(changes);
  assert.equal((await studio.viewStudio(p1.token)).document.response.message, changes.message);
  assert.equal((await core.orderById(sql, orderId)).paid, 7610);
  const p2 = await proof(orderId, m.id);
  assert.equal(p2.view.document.proof_version, 2);
  assert.equal(await studio.viewStudio(p1.token), null);
  await assert.rejects(() => studio.answerProof(answer(p1)), /unavailable/);
  const rotated = await studio.actOnStudio(
    { id: p2.id, version: p2.view.document.version, action: "rotate" },
    owner,
  );
  assert.equal(await studio.viewStudio(p2.token), null);
  p2.token = tokenOf(rotated.path);
  p2.view = await studio.viewStudio(p2.token);
  const response = answer(p2);
  await studio.answerProof(response);
  await studio.answerProof(response);
  const approved = await studio.viewStudio(p2.token);
  assert.equal(approved.status, "approved");
  assert.ok(approved.document.responded_at);
  assert.equal((await hold.proofReadiness(sql, orderId)).blocked, false);
  assert.equal((await core.orderById(sql, orderId)).paid, 7610);
  const alerts =
    await sql`select id from commerce_notifications where event_key=${"proof-response:" + p2.id}`;
  assert.equal(alerts.length, 1);
  assert.equal(
    (await sql`select id from commerce_order_emails where event_key=${"proof-response:" + p2.id}`)
      .length,
    1,
  );
  const pdf = await studio.studioBinary(p2.id, null, p2.token, "pdf");
  writeFileSync("artifacts/studio/proof-v2.pdf", pdf.bytes);
  assert.equal(
    (await PDFDocument.load(pdf.bytes)).getTitle(),
    `Design Proof ${p2.view.document.number} - REC Mama Made`,
  );
  const p3 = await proof(orderId, m.id);
  assert.equal((await hold.proofReadiness(sql, orderId)).blocked, true);
  await assert.rejects(() => advance(orderId), /Artwork Approval Hold/);
  await studio.answerProof(answer(p3));
  await advance(orderId);
  await assert.rejects(() => proof(orderId, m.id), /production has started/);
  const unpaid = await invoice(),
    up = await proof(unpaid.view.document.order_id, m.id);
  await studio.answerProof(answer(up));
  assert.equal((await core.orderById(sql, unpaid.view.document.order_id)).paid, 0);
  await assert.rejects(() => advance(unpaid.view.document.order_id), /Full verified payment/);
  const normal = await invoice();
  await payment(normal.view.document.order_id);
  assert.equal((await hold.proofReadiness(sql, normal.view.document.order_id)).required, false);
  await advance(normal.view.document.order_id);
  const expired = await invoice(),
    ex = await proof(expired.view.document.order_id, m.id);
  await sql`update commerce_studio_documents set expires_at=now()-interval '1 minute' where id=${ex.id}`;
  assert.equal(await studio.viewStudio(ex.token), null);
  await assert.rejects(() => studio.answerProof(answer(ex)), /expired/);
});
test("issued invoice uses existing Stripe obligation and reconciles signed test events without approving proof", async () => {
  const i = await invoice(),
    m = await photo(),
    p = await proof(i.view.document.order_id, m.id);
  let provider = null,
    customer = null;
  const lines = [];
  let creates = 0;
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture_only";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture_only";
  process.env.REC_INVOICE_BRANDING_VERIFIED = "true";
  process.env.REC_INVOICE_SENDER = "invoice@example.invalid";
  const native = new Stripe("sk_test_fixture_only");
  const fake = {
    webhooks: native.webhooks,
    accounts: {
      retrieve: async () => ({
        business_profile: { name: "REC Mama Made", support_email: "invoice@example.invalid" },
      }),
    },
    customers: {
      create: async (v) => (customer = { id: "cus_fixture", ...v }),
      retrieve: async () => customer,
    },
    invoices: {
      create: async (v) => {
        creates++;
        return (provider = {
          id: "in_test_fixture_" + randomUUID().replaceAll("-", ""),
          ...v,
          total: 0,
          status: "draft",
          customer_email: customer.email,
          currency: "usd",
          livemode: false,
          hosted_invoice_url: "https://invoice.stripe.com/test_fixture",
          invoice_pdf: null,
        });
      },
      retrieve: async () => ({ ...provider }),
      listLineItems: async () => ({ data: lines, has_more: false }),
      finalizeInvoice: async () => ({ ...provider, status: (provider.status = "open") }),
    },
    invoiceItems: {
      create: async (v) => {
        lines.push({ metadata: v.metadata });
        provider.total += v.amount;
        return { id: randomUUID() };
      },
    },
  };
  await studio.prepareStudioPayment(i.id, owner, fake);
  await studio.prepareStudioPayment(i.id, owner, fake);
  assert.equal(creates, 1);
  assert.ok(provider.due_date);
  assert.equal(provider.days_until_due, undefined);
  assert.equal((await studio.viewStudio(i.token)).payable, true);
  assert.match((await studio.payStudio(i.token)).url, /invoice.stripe.com/);
  assert.equal((await studio.viewStudio(i.token)).paid, 0);
  const pi = "pi_test_studio_fixture";
  provider.status = "paid";
  fake.invoicePayments = {
    list: async () => ({
      has_more: false,
      data: [
        {
          status: "paid",
          amount_paid: 7610,
          currency: "usd",
          invoice: provider.id,
          payment: { type: "payment_intent", payment_intent: pi },
        },
      ],
    }),
  };
  fake.paymentIntents = {
    retrieve: async () => ({ id: pi, status: "succeeded", currency: "usd", amount_received: 7610 }),
  };
  const evt = {
    id: "evt_test_studio_" + randomUUID(),
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    type: "invoice.paid",
    data: { object: { id: provider.id } },
  };
  const raw = JSON.stringify(evt),
    signature = native.webhooks.generateTestHeaderString({
      payload: raw,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
    });
  for (let j = 0; j < 2; j++) {
    const response = await webhooks.stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: raw,
      }),
      fake,
    );
    assert.equal(response.status, 200);
  }
  assert.equal((await studio.viewStudio(i.token)).status, "paid");
  assert.equal((await studio.viewStudio(p.token)).status, "awaiting_approval");
  await assert.rejects(() => studio.payStudio(i.token), /not available/);
  await assert.rejects(() => advance(i.view.document.order_id), /Artwork Approval Hold/);
  assert.equal(
    (await sql`select id from commerce_payments where order_id=${i.view.document.order_id}`).length,
    1,
  );
  for (const k of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "REC_INVOICE_BRANDING_VERIFIED",
    "REC_INVOICE_SENDER",
  ])
    delete process.env[k];
});
test("required approval is held even before a proof exists; long invoices paginate and all staff document operations are authorized", async () => {
  const id = randomUUID(),
    b = { ...body(), requiresProof: true };
  await studio.saveStudio({ id, kind: "invoice", version: 0, orderId: null, body: b }, owner);
  const issued = await studio.actOnStudio({ id, version: 1, action: "issue" }, owner),
    v = await studio.viewStudio(tokenOf(issued.path));
  await payment(v.document.order_id);
  assert.equal((await hold.proofReadiness(sql, v.document.order_id)).blocked, true);
  await assert.rejects(() => advance(v.document.order_id), /Artwork Approval Hold/);
  const legacy = await invoice();
  await sql`update commerce_orders set stage='customer_approval' where id=${legacy.view.document.order_id}`;
  await advance(legacy.view.document.order_id, "artwork_review");
  await payment(legacy.view.document.order_id);
  await assert.rejects(
    () => advance(legacy.view.document.order_id),
    /Artwork Approval Hold/,
    "Moving a legacy approval order backwards cannot clear its hold",
  );
  for (const role of ["manager", "production", null]) {
    const actor = { userId: "non-owner", role };
    await assert.rejects(() => studio.listStudio("invoice", actor), /Access denied/);
    await assert.rejects(() => studio.studioOwnerDocument(id, actor), /Access denied/);
    await assert.rejects(() => studio.studioBinary(id, actor, null, "pdf"), /Access denied/);
    await assert.rejects(
      () => studio.actOnStudio({ id, version: 2, action: "rotate" }, actor),
      /Access denied/,
    );
    await assert.rejects(
      () =>
        email.sendStudioEmail(
          { id, path: issued.path, requestId: randomUUID() },
          actor,
          "http://localhost:8080",
        ),
      /Access denied/,
    );
  }
  const longId = randomUUID();
  const long = {
    ...body(),
    lines: Array.from({ length: 20 }, (_, n) => ({
      ...body().lines[0],
      id: randomUUID(),
      title: `TEST long item ${n + 1} with a wrapped title for a real production description`,
      quantity: 1,
      unitAmount: 10,
      specifications: "Detailed supplied text requiring wrapping and safe page breaks. ".repeat(12),
    })),
    discount: 0,
  };
  await studio.saveStudio(
    { id: longId, kind: "invoice", version: 0, orderId: null, body: long },
    owner,
  );
  const pdf = await studio.studioBinary(longId, owner, null, "pdf");
  assert.ok((await PDFDocument.load(pdf.bytes)).getPageCount() > 2);
  writeFileSync("artifacts/studio/invoice-multipage.pdf", pdf.bytes);
});

test("void and same-order reissue preserve old provider history, revoke old links, reject currency tampering and reconcile failures", async () => {
  const i = await invoice();
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture_only";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fixture_only";
  process.env.REC_INVOICE_BRANDING_VERIFIED = "true";
  process.env.REC_INVOICE_SENDER = "invoice@example.invalid";
  const providers = new Map(),
    lineMap = new Map(),
    keys = [],
    native = new Stripe("sk_test_fixture_only");
  let customer;
  const fake = {
    webhooks: native.webhooks,
    accounts: {
      retrieve: async () => ({
        business_profile: { name: "REC Mama Made", support_email: "invoice@example.invalid" },
      }),
    },
    customers: {
      create: async (p) => (customer = { id: "cus_test_reissue", ...p }),
      retrieve: async () => customer,
    },
    invoices: {
      create: async (p, options) => {
        keys.push(options.idempotencyKey);
        const x = {
          id: "in_test_" + randomUUID(),
          ...p,
          total: 0,
          status: "draft",
          customer_email: customer.email,
          currency: "usd",
          livemode: false,
          hosted_invoice_url: "https://invoice.stripe.com/test_reissue",
          invoice_pdf: null,
        };
        providers.set(x.id, x);
        lineMap.set(x.id, []);
        return { ...x };
      },
      retrieve: async (id) => ({ ...providers.get(id) }),
      listLineItems: async (id) => ({ data: lineMap.get(id), has_more: false }),
      finalizeInvoice: async (id) => {
        const x = providers.get(id);
        x.status = "open";
        return { ...x };
      },
      voidInvoice: async (id) => {
        const x = providers.get(id);
        x.status = "void";
        return { ...x };
      },
    },
    invoiceItems: {
      create: async (p) => {
        providers.get(p.invoice).total += p.amount;
        lineMap.get(p.invoice).push({ metadata: p.metadata });
        return { id: randomUUID() };
      },
    },
  };
  const old = await studio.prepareStudioPayment(i.id, owner, fake);
  const { voidInvoice } = await server.ssrLoadModule("/src/lib/commerce/invoice-void.server.ts");
  await voidInvoice(i.view.document.order_id, owner.userId, fake);
  assert.equal((await studio.viewStudio(i.token)).status, "void");
  await assert.rejects(() => studio.prepareStudioPayment(i.id, owner, fake), /issue a replacement/);
  await studio.actOnStudio({ id: i.id, version: 2, action: "void" }, owner);
  assert.equal(await studio.viewStudio(i.token), null);
  await assert.rejects(() => studio.payStudio(i.token), /not available/);
  await assert.rejects(() => studio.prepareStudioPayment(i.id, owner, fake), /Issue the invoice/);
  const id = randomUUID();
  await studio.saveStudio(
    {
      id,
      kind: "invoice",
      version: 0,
      orderId: i.view.document.order_id,
      body: {
        ...body(),
        lines: [{ ...body().lines[0], unitAmount: 1 }],
        shipping: 0,
        tax: 0,
        discount: 0,
      },
    },
    owner,
  );
  const replacement = await studio.actOnStudio({ id, version: 1, action: "issue" }, owner);
  const current = await studio.prepareStudioPayment(id, owner, fake);
  assert.notEqual(old.id, current.id);
  assert.notEqual(keys[0], keys[1]);
  assert.equal((await studio.viewStudio(tokenOf(replacement.path))).document.total, 7610);
  assert.equal(
    (
      await sql`select provider_id from commerce_invoice_history where order_id=${i.view.document.order_id}`
    )[0].provider_id,
    old.id,
  );
  async function signed(type, providerId) {
    const event = {
        id: "evt_test_" + randomUUID(),
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        type,
        data: { object: { id: providerId } },
      },
      raw = JSON.stringify(event);
    return webhooks.stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": native.webhooks.generateTestHeaderString({
            payload: raw,
            secret: process.env.STRIPE_WEBHOOK_SECRET,
          }),
        },
        body: raw,
      }),
      fake,
    );
  }
  assert.equal((await signed("invoice.voided", old.id)).status, 200);
  assert.equal(
    (
      await sql`select provider_id,state from commerce_invoices where order_id=${i.view.document.order_id}`
    )[0].state,
    "open",
  );
  providers.get(current.id).currency = "eur";
  assert.equal((await signed("invoice.payment_failed", current.id)).status, 500);
  assert.equal((await core.orderById(sql, i.view.document.order_id)).paid, 0);
  providers.get(current.id).currency = "usd";
  assert.equal((await signed("invoice.payment_failed", current.id)).status, 200);
  assert.equal((await studio.viewStudio(tokenOf(replacement.path))).status, "failed");
  assert.equal((await studio.viewStudio(tokenOf(replacement.path))).paid, 0);
  await payment(i.view.document.order_id);
  const voidedPdf = await studio.studioBinary(i.id, owner, null, "pdf");
  writeFileSync("artifacts/studio/invoice-void.pdf", voidedPdf.bytes);
  assert.equal((await PDFDocument.load(voidedPdf.bytes)).getPageCount(), 2);
  for (const k of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "REC_INVOICE_BRANDING_VERIFIED",
    "REC_INVOICE_SENDER",
  ])
    delete process.env[k];
});

test("separate captured invoice/proof emails include correct PDF and link, retry one frozen request and expose actual delivery state", async () => {
  const i = await invoice(),
    m = await photo(),
    p = await proof(i.view.document.order_id, m.id);
  process.env.REC_ORDER_EMAIL_TO = "owner@example.invalid";
  process.env.REC_ORDER_EMAIL_FROM = "orders@recmamamade.com";
  process.env.REC_ORDER_EMAIL_SENDER_VERIFIED = "true";
  process.env.RESEND_API_KEY = "re_isolated_fixture";
  const captured = [];
  const transport = async (url, init) => {
    if (init.method === "POST") {
      captured.push(JSON.parse(init.body));
      return Response.json({ id: "test-message-" + captured.length });
    }
    return Response.json({
      id: "test-message-1",
      to: ["customer@example.invalid"],
      last_event: "delivered",
    });
  };
  const request = { id: i.id, path: i.path, requestId: randomUUID() };
  const sent = await email.sendStudioEmail(request, owner, "http://localhost:8080", transport);
  assert.equal(sent.state, "accepted");
  await email.sendStudioEmail(request, owner, "http://localhost:8080", transport);
  assert.equal(captured.length, 1);
  await email.sendStudioEmail(
    { id: p.id, path: p.path, requestId: randomUUID() },
    owner,
    "http://localhost:8080",
    transport,
  );
  assert.equal(captured.length, 2);
  assert.match(captured[0].text, /\/invoice\//);
  assert.doesNotMatch(captured[0].text, /design-proof|Approve Proof/);
  assert.match(captured[1].text, /\/design-proof\//);
  assert.equal(captured[0].attachments[0].content_type, "application/pdf");
  assert.ok(
    (
      await PDFDocument.load(Buffer.from(captured[1].attachments[0].content, "base64"))
    ).getPageCount() > 0,
  );
  assert.equal((await email.refreshStudioDelivery(sent.id, owner, transport)).state, "delivered");
  await assert.rejects(
    () =>
      email.sendStudioEmail(
        { ...request, requestId: randomUUID() },
        owner,
        "https://attacker.example",
        transport,
      ),
    /verified storefront/,
  );
  const uncertain = { id: i.id, path: i.path, requestId: randomUUID() };
  await assert.rejects(
    () =>
      email.sendStudioEmail(uncertain, owner, "http://localhost:8080", async () => {
        throw Error("uncertain transport");
      }),
    /not confirmed/,
  );
  await email.sendStudioEmail(uncertain, owner, "http://localhost:8080", transport);
  assert.equal(
    (
      await sql`select count(*)::int n from commerce_studio_emails where request_id=${uncertain.requestId}`
    )[0].n,
    1,
  );
  writeFileSync(
    "artifacts/studio/captured-email-summary.json",
    JSON.stringify(
      captured.map((x) => ({ subject: x.subject, to: x.to, pdf: x.attachments[0].filename })),
      null,
      2,
    ),
  );
  delete process.env.RESEND_API_KEY;
  delete process.env.REC_ORDER_EMAIL_SENDER_VERIFIED;
});
