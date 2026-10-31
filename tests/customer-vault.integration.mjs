import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "vite";
import sharp from "sharp";
for (const k of [
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
  "VERCEL",
  "REC_TEST_DATABASE_DIR",
])
  if (process.env[k])
    throw Error("Customer acceptance requires a fresh isolated test database and no credentials.");
mkdirSync("artifacts/commerce-qa", { recursive: true });
const directory = mkdtempSync(resolve("artifacts/commerce-qa/customer-durable-"));
process.env.REC_TEST_DATABASE_DIR = directory;
const owner = { userId: "vault-test-owner", role: "owner" },
  manager = { userId: "vault-test-manager", role: "manager" },
  production = { userId: "vault-test-production", role: "production" };
let server,
  sql,
  db,
  crm,
  mutations,
  core,
  read,
  publishing,
  studio,
  customerId,
  assetId,
  designId,
  firstOrderId,
  artwork;
const config = {
  orderType: "hat",
  modelId: "112",
  variantId: "112:black",
  leatherette: "buckskin",
  patchShape: "Circle",
  patchSize: "medium",
  physicalInches: { width: 2.5, height: 2.5 },
  placement: "front-center",
  patchPosition: { version: 2, anchor: { x: 0.48, y: 0.5 } },
  patchText: "TEST ONLY",
  quantity: 1,
  notes: "TEST ONLY owner-supplied production preference",
  previewSnapshot: null,
};
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  db = await server.ssrLoadModule("/src/lib/db.ts");
  sql = await db.getSql();
  crm = await server.ssrLoadModule("/src/lib/commerce/customers.server.ts");
  ({ mutate: mutations } = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts"));
  core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
  read = await server.ssrLoadModule("/src/lib/commerce/read.server.ts");
  publishing = await server.ssrLoadModule("/src/lib/commerce/publishing.server.ts");
  studio = await server.ssrLoadModule("/src/lib/commerce/studio.server.ts");
  for (const a of [owner, manager, production]) {
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${a.userId},'TEST ONLY',${a.userId + "@example.invalid"},true,now(),now())`;
    await sql`insert into merchant_staff(user_id,role) values(${a.userId},${a.role})`;
  }
  artwork = await sharp({
    create: {
      width: 900,
      height: 600,
      channels: 4,
      background: { r: 5, g: 10, b: 15, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
});
after(async () => {
  await server?.close();
  try {
    await (await db.getPglite()).close();
  } catch {
    /* Reopen test already closed the connection. */
  }
  delete process.env.REC_TEST_DATABASE_DIR;
});
const createCustomer = async (extra = {}) => {
  const id = randomUUID();
  await crm.saveCustomer(
    {
      id,
      version: 0,
      body: { name: "TEST CALLER " + id.slice(0, 6), email: null, phone: "+15045550123", ...extra },
      reviewedDuplicate: true,
    },
    owner,
  );
  return id;
};
async function phoneDraft(cId, configuration, extra = {}) {
  const price = await crm.quotePhoneOrder({ customerId: cId, configuration }, owner);
  return crm.createPhoneOrder(
    {
      requestId: randomUUID(),
      customerId: cId,
      designId,
      revision: 1,
      configuration,
      artworkAssetId: assetId,
      expectedTotal: price.totalCents,
      expectedPriceRevision: price.priceRevision,
      expectedPreviewSignature: price.previewSignature,
      shipping: 0,
      tax: 0,
      chargesReviewed: true,
      ...extra,
    },
    owner,
  );
}
test("first-time caller with no email retains source bytes, exact design and unissued phone draft", async () => {
  customerId = await createCustomer();
  assetId = randomUUID();
  designId = randomUUID();
  await crm.uploadCustomerArtwork(
    {
      id: assetId,
      customerId,
      name: "TEST-logo-original.png",
      data: "data:image/png;base64," + artwork.toString("base64"),
      provenance: "Customer supplied TEST ONLY original logo",
      kind: "original",
    },
    owner,
  );
  await crm.saveCustomerDesign(
    {
      id: designId,
      customerId,
      version: 0,
      name: "TEST Black 112 circle",
      configuration: config,
      artworkAssetId: assetId,
      note: "Original customer-approved intake choices",
    },
    owner,
  );
  const draft = await phoneDraft(customerId, config);
  firstOrderId = draft.id;
  const detail = await crm.readCustomer(customerId, owner);
  assert.equal(detail.profile.email, null);
  assert.equal(detail.designs[0].configuration.variantId, "112:black");
  assert.deepEqual(detail.designs[0].configuration.physicalInches, { width: 2.5, height: 2.5 });
  assert.equal(detail.assets[0].checksum, createHash("sha256").update(artwork).digest("hex"));
  assert.deepEqual(Buffer.from((await crm.customerArtwork(assetId, owner)).bytes), artwork);
  assert.equal(detail.orders.length, 1);
  assert.equal(detail.orders[0].customer_email, null);
  assert.equal(detail.orders[0].paid, 0);
  assert.equal((await read.readOrder(firstOrderId, owner)).proof.blocked, true);
  assert.equal(
    (await sql`select id from commerce_studio_documents where order_id=${firstOrderId}`).length,
    0,
  );
  assert.equal(
    (await sql`select id from commerce_order_emails where order_id=${firstOrderId}`).length,
    0,
  );
  await assert.rejects(
    () => crm.preparePhoneInvoice(firstOrderId, owner),
    /genuine customer email/,
  );
  assert.ok((await crm.listCustomers("5045550123", owner)).some((c) => c.id === customerId));
});
test("repeat order reprices current catalog, keeps original bytes/placement and leaves original paid order unchanged", async () => {
  await mutations(
    "payment.manual",
    {
      id: firstOrderId,
      amount: 3000,
      reference: "TEST-VENMO-" + randomUUID(),
      reason: "TEST independently verified external receipt",
      method: "venmo",
      occurredAt: new Date(Date.now() - 60000).toISOString(),
      requestId: randomUUID(),
    },
    owner,
  );
  const old = await read.readOrder(firstOrderId, owner);
  const pricing = await server.ssrLoadModule("/src/lib/commerce/owner-schemas.ts");
  await publishing.saveDocument(
    {
      scope: "pricing",
      key: "main",
      version: 0,
      action: "publish",
      body: {
        ...pricing.DEFAULT_PRICING,
        models: { ...pricing.DEFAULT_PRICING.models, 112: 3400 },
      },
    },
    owner,
  );
  const next = { ...config, quantity: 3 };
  const order = await phoneDraft(customerId, next);
  const fresh = await read.readOrder(order.id, owner);
  assert.equal(fresh.order.total, 10200);
  assert.equal(fresh.items[0].unit_amount, 3400);
  assert.equal(fresh.items[0].specifications.variantId, "112:black");
  assert.deepEqual(fresh.items[0].specifications.previewPlacement.position, config.patchPosition);
  assert.deepEqual(
    Buffer.from(
      (await sql`select artwork from commerce_order_items where order_id=${order.id}`)[0].artwork,
    ),
    artwork,
  );
  assert.equal(fresh.order.paid, 0);
  assert.equal(fresh.proof.blocked, true);
  assert.deepEqual(await read.readOrder(firstOrderId, owner), old);
});
test("design revision keeps revision one and original file; foreign artwork and retired models cannot be reused", async () => {
  await crm.saveCustomerDesign(
    {
      id: designId,
      customerId,
      version: 1,
      name: "TEST 112 material revision",
      configuration: { ...config, leatherette: "black-gold" },
      artworkAssetId: assetId,
      note: "Updated material for a separate future order",
    },
    owner,
  );
  const history = await crm.customerDesignHistory(designId, owner);
  assert.equal(history.length, 2);
  assert.equal(history[1].configuration.leatherette, "buckskin");
  assert.equal(history[1].artwork_asset_id, assetId);
  await assert.rejects(
    () =>
      sql`update commerce_customer_design_revisions set note='rewrite' where design_id=${designId}`,
    /immutable/,
  );
  await assert.rejects(
    () => sql`update commerce_customer_assets set name='rewrite' where id=${assetId}`,
    /immutable/,
  );
  const foreign = await createCustomer();
  await assert.rejects(
    () =>
      crm.saveCustomerDesign(
        {
          id: randomUUID(),
          customerId: foreign,
          version: 0,
          name: "Wrong owner",
          configuration: config,
          artworkAssetId: assetId,
          note: "Invalid cross-customer artwork reuse",
        },
        owner,
      ),
    /owned by this customer/,
  );
  await assert.rejects(
    () =>
      crm.quotePhoneOrder(
        { customerId, configuration: { ...config, modelId: "112PM", variantId: "112PM:unknown" } },
        owner,
      ),
    /no longer offered/,
  );
  await assert.rejects(
    () =>
      crm.quotePhoneOrder(
        { customerId, configuration: { ...config, variantId: "112:missing" } },
        owner,
      ),
    /colorway is unavailable/,
  );
});
test("new draft uses reviewed pricing snapshot, current inventory and stable request identity", async () => {
  const price = await crm.quotePhoneOrder({ customerId, configuration: config }, owner);
  const input = {
    requestId: randomUUID(),
    customerId,
    designId,
    revision: 2,
    configuration: config,
    artworkAssetId: assetId,
    expectedTotal: price.totalCents,
    expectedPriceRevision: price.priceRevision,
    expectedPreviewSignature: price.previewSignature,
    shipping: 0,
    tax: 0,
    chargesReviewed: true,
  };
  const first = await crm.createPhoneOrder(input, owner),
    retry = await crm.createPhoneOrder(input, owner);
  assert.equal(retry.id, first.id);
  assert.equal(retry.duplicate, true);
  await assert.rejects(
    () => crm.createPhoneOrder({ ...input, configuration: { ...config, quantity: 2 } }, owner),
    /different details/,
  );
  await assert.rejects(
    () => crm.createPhoneOrder({ ...input, requestId: randomUUID(), expectedTotal: 1 }, owner),
    /pricing changed/,
  );
  const inv = randomUUID();
  await sql`insert into commerce_inventory(id,sku,title,category,on_hand) values(${inv},${"TEST-" + inv},'TEST black 112','hat',0)`;
  await sql`insert into commerce_inventory_rules(product_key,inventory_id,units_per_item) values('hat:112:Black',${inv},1)`;
  await assert.rejects(
    () => crm.quotePhoneOrder({ customerId, configuration: config }, owner),
    /not currently available/,
  );
  await sql`delete from commerce_inventory_rules where inventory_id=${inv}`;
});
test("profiles are never silently merged; owner-reviewed link preserves assets, orders and lineage", async () => {
  const a = await createCustomer({ name: "TEST shared-name" });
  await assert.rejects(
    () =>
      crm.saveCustomer(
        {
          id: randomUUID(),
          version: 0,
          body: { name: "TEST shared-name", email: null, phone: "+15045550124" },
        },
        owner,
      ),
    /possible duplicate/,
  );
  const b = await createCustomer({ name: "TEST shared-name", phone: "+15045550124" });
  const archivedDesign = randomUUID();
  await crm.saveCustomerDesign(
    {
      id: archivedDesign,
      customerId: b,
      version: 0,
      name: "TEST archive lifecycle",
      configuration: config,
      artworkAssetId: null,
      note: "Text-only source for archive lifecycle",
    },
    owner,
  );
  await crm.customerOperation(
    "design_archive",
    { customerId: b, designId: archivedDesign, version: 1, archived: true },
    owner,
  );
  assert.equal((await crm.readCustomer(b, owner)).designs[0].state, "archived");
  await crm.customerOperation(
    "design_archive",
    { customerId: b, designId: archivedDesign, version: 2, archived: false },
    owner,
  );
  assert.equal((await crm.customerDesignHistory(archivedDesign, owner)).length, 3);
  const target = (await crm.readCustomer(customerId, owner)).profile;
  const source = (await crm.readCustomer(a, owner)).profile;
  await assert.rejects(
    () =>
      crm.customerOperation(
        "merge",
        {
          sourceId: a,
          targetId: customerId,
          sourceVersion: source.version,
          targetVersion: target.version,
          reason: "Reviewed actual customer identity",
          confirmed: true,
        },
        manager,
      ),
    /Access denied/,
  );
  await crm.customerOperation(
    "merge",
    {
      sourceId: a,
      targetId: customerId,
      sourceVersion: source.version,
      targetVersion: target.version,
      reason: "TEST ONLY reviewed customer identity",
      confirmed: true,
    },
    owner,
  );
  assert.equal((await crm.readCustomer(a, owner)).profile.id, customerId);
  assert.equal((await crm.readCustomer(b, owner)).profile.id, b);
  assert.ok((await crm.readCustomer(customerId, owner)).assets.some((a) => a.id === assetId));
});
test("permissions fail closed and typed email/phone alone cannot claim a public account", async () => {
  for (const fn of [
    () => crm.listCustomers("", production),
    () => crm.readCustomer(customerId, production),
    () => crm.customerArtwork(assetId, production),
    () => crm.customerDesignHistory(designId, production),
  ])
    await assert.rejects(fn, /Access denied/);
  assert.equal(
    (await sql`select user_id from commerce_customer_accounts where customer_id=${customerId}`)
      .length,
    0,
  );
  await assert.rejects(
    () =>
      crm.customerOperation(
        "link_account",
        {
          customerId,
          userId: "unverified-or-nonexistent",
          reason: "TEST ONLY independent identity review",
          confirmed: true,
        },
        owner,
      ),
    /verified existing account/,
  );
});
test("25-unit current-price phone order uses existing Studio invoice and independently gated proof workflow", async () => {
  const detail = await crm.readCustomer(customerId, owner),
    c = detail.profile;
  await crm.saveCustomer(
    {
      id: customerId,
      version: c.version,
      body: {
        name: c.name,
        email: "vault-caller@example.invalid",
        phone: c.phone,
        preferredContact: "text",
      },
    },
    owner,
  );
  const next = await phoneDraft(customerId, { ...config, quantity: 25 }, { revision: 2 });
  const invoice = await crm.preparePhoneInvoice(next.id, owner);
  const record = await studio.studioOwnerDocument(invoice.id, owner);
  assert.equal(record.document.order_id, next.id);
  assert.equal(record.document.kind, "invoice");
  assert.equal(record.document.body.lines[0].quantity, 25);
  assert.equal(record.document.state, "draft");
  assert.equal(record.financial.paid, 0);
  assert.equal((await read.readOrder(next.id, owner)).proof.blocked, true);
  assert.equal((await crm.preparePhoneInvoice(next.id, owner)).id, invoice.id);
  await sql`insert into commerce_content(key,value) values('contact_email','shop@example.invalid') on conflict(key) do nothing`;
  await studio.saveStudio(
    {
      kind: "invoice",
      id: invoice.id,
      version: record.document.version,
      orderId: next.id,
      body: { ...record.document.body, availabilityConfirmed: true, totalsConfirmed: true },
    },
    owner,
  );
  const invoiceLink = await studio.actOnStudio(
    { id: invoice.id, version: 2, action: "issue" },
    owner,
  );
  assert.match(invoiceLink.path, /^\/invoice\//);
  const media = await server.ssrLoadModule("/src/lib/commerce/media.server.ts");
  const proofPhoto = await media.uploadMedia(
    {
      name: "TEST ONLY proof.png",
      data: "data:image/png;base64," + artwork.toString("base64"),
      alt: "TEST ONLY customer design proof",
    },
    owner,
  );
  const proofId = randomUUID();
  await studio.saveStudio(
    {
      kind: "proof",
      id: proofId,
      version: 0,
      orderId: next.id,
      body: {
        title: "TEST ONLY exact phone-order design",
        notes: "Separate proof; payment never approves artwork",
        details: [
          { label: "Model / color", value: "Richardson 112 Black" },
          { label: "Physical patch", value: "2.5 inch circle" },
        ],
        mediaIds: [proofPhoto.id],
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      },
    },
    owner,
  );
  const firstLink = await studio.actOnStudio({ id: proofId, version: 1, action: "issue" }, owner);
  const latest = await studio.studioOwnerDocument(proofId, owner);
  const rotated = await studio.actOnStudio(
    { id: proofId, version: latest.document.version, action: "rotate" },
    owner,
  );
  assert.equal(await studio.documentByToken(firstLink.path.split("/").at(-1)), null);
  const currentTotal = (await core.orderById(sql, next.id)).total;
  await mutations(
    "payment.manual",
    {
      id: next.id,
      amount: currentTotal,
      reference: "TEST-PHONE-VENMO-" + randomUUID(),
      reason: "TEST independent receipt verification",
      method: "venmo",
      occurredAt: new Date(Date.now() - 60000).toISOString(),
      requestId: randomUUID(),
    },
    owner,
  );
  const paid = await read.readOrder(next.id, owner);
  assert.equal(paid.order.paid, currentTotal);
  assert.equal(paid.proof.blocked, true);
  await assert.rejects(
    () =>
      mutations(
        "order.update",
        { id: next.id, version: paid.order.version, stage: "engraving" },
        owner,
      ),
    /proof|approval/i,
  );
  const current = await studio.studioOwnerDocument(proofId, owner);
  await studio.answerProof({
    token: rotated.path.split("/").at(-1),
    version: current.document.version,
    action: "approve",
    name: "TEST CALLER",
    email: "vault-caller@example.invalid",
    message: "",
    confirmed: true,
  });
  assert.equal((await read.readOrder(next.id, owner)).proof.blocked, false);
  await mutations(
    "order.update",
    { id: next.id, version: paid.order.version, stage: "engraving" },
    owner,
  );
  assert.equal((await core.orderById(sql, next.id)).stage, "engraving");
});
test("durable test storage reopens in a new process with profiles, original bytes, revisions and payments intact", async () => {
  await server.close();
  server = null;
  await (await db.getPglite()).close();
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["tests/fixtures/customer-vault-reopen.mjs", customerId, assetId, designId, firstOrderId],
    { cwd: process.cwd(), env: process.env, timeout: 60000, maxBuffer: 1024 * 1024 },
  );
  assert.match(stdout, /"durableReopen":true/);
  console.log(
    "Durable database reopened in a separate process: source SHA-256, two design revisions, exact variant and recorded payment verified.",
  );
});
