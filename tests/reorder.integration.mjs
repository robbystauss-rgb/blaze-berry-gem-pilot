import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.PAYPAL_CLIENT_SECRET)
  throw Error("Reorder tests require isolated storage and no provider credentials.");
let server, sql, reorder, book;
const userA = "reorder-customer-a",
  userB = "reorder-customer-b";
const base = {
  orderType: "hat",
  family: "112FP",
  colorway: "Army Olive Green/Tan",
  leatherette: "buckskin",
  patchShape: "Rounded Rectangle",
  patchSize: "medium",
  placement: "front-center",
  patchText: "REPEAT THIS TEXT",
  promo: "HISTORICAL-CODE",
  notes: "DO NOT COPY PRIVATE NOTE",
  customerEmail: "PRIVATE EMAIL",
  provider: "PRIVATE PROVIDER",
  pricing: { unitCents: 1 },
  preview: { physicalInches: { width: 3, height: 2 } },
  previewPlacement: {
    offsetX: 10,
    offsetY: 8,
    scale: 1.1,
    position: { version: 2, anchor: { x: 0.5, y: 0.5 } },
  },
};
async function item(spec = {}, customer = userA, art = false, quantity = 2) {
  const orderId = randomUUID(),
    id = randomUUID();
  const specifications = { ...base, ...spec };
  await sql`insert into commerce_orders(id,customer_user_id,customer_name,customer_email,source,subtotal,total) values(${orderId},${customer},'TEST CUSTOMER','same@example.invalid','test_fixture',7000,7000)`;
  await sql`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values(${id},${orderId},'hat:112FP:Army Olive Green/Tan','TEST custom112FP',${quantity},${quantity},3500,${JSON.stringify(specifications)},${art ? new Uint8Array([0, 255, 4]) : null},${art ? "image/png" : null})`;
  return { orderId, id, specifications };
}
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  ({ getSql: sql } = await server.ssrLoadModule("/src/lib/db.ts"));
  sql = await sql();
  reorder = await server.ssrLoadModule("/src/lib/commerce/reorder.server.ts");
  const { DEFAULT_PRICING } = await server.ssrLoadModule("/src/lib/commerce/owner-schemas.ts");
  book = structuredClone(DEFAULT_PRICING);
  book.models["112FP"] = 4900;
  await sql`insert into commerce_documents(scope,key,draft,published,published_revision) values('pricing','main',${JSON.stringify(book)},${JSON.stringify(book)},1)`;
  for (const id of [userA, userB])
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${id},'TEST CUSTOMER',${id + "@example.invalid"},true,now(),now())`;
});
after(async () => {
  await server?.close();
});
test("only authenticated exact customer ownership allows reorder; matching email or guest ownership does not", async () => {
  const own = await item();
  assert.equal((await reorder.ownReorderLines(userA, own.orderId))[0].id, own.id);
  await assert.rejects(() => reorder.ownReorderLines(userB, own.orderId), /authenticated account/);
  await assert.rejects(() => reorder.prepareReorder(userB, own.id), /authenticated account/);
  await assert.rejects(() => reorder.prepareReorder("", own.id), /authenticated account/);
  const guest = await item({}, null);
  await assert.rejects(() => reorder.prepareReorder(userA, guest.id), /authenticated account/);
});
test("restored allowlist uses new published prices and leaves historical records, notes, offers and providers untouched", async () => {
  const own = await item(),
    intent = await reorder.prepareReorder(userA, own.id);
  assert.equal(intent.settings.family, "112FP");
  assert.equal(intent.settings.colorway, "Army Olive Green/Tan");
  assert.equal(intent.settings.patchText, "REPEAT THIS TEXT");
  assert.equal(intent.settings.quantity, 2);
  assert.deepEqual(intent.settings.patchPosition, { version: 2, anchor: { x: 0.5, y: 0.5 } });
  assert.equal(intent.quote.unitCents, 4900);
  assert.equal(intent.quote.totalCents, 9800);
  for (const forbidden of [
    "promo",
    "notes",
    "provider",
    "pricing",
    "customerEmail",
    "customerName",
    "artworkDataUrl",
    "preview",
    "previewIdentity",
  ])
    assert.equal(forbidden in intent.settings, false);
  assert.equal(JSON.stringify(intent).includes("PRIVATE"), false);
  const [historical] =
    await sql`select i.unit_amount,i.specifications,o.total from commerce_order_items i join commerce_orders o on o.id=i.order_id where i.id=${own.id}`;
  assert.equal(historical.unit_amount, 3500);
  assert.equal(historical.total, 7000);
  assert.deepEqual(historical.specifications, own.specifications);
});
test("uploaded prior art is not returned and requires an explicit fresh design", async () => {
  const own = await item({}, userA, true);
  const intent = await reorder.prepareReorder(userA, own.id);
  assert.equal(intent.settings.patchText, "");
  assert.match(intent.notice, /Upload it again/);
  assert.equal("artwork" in intent, false);
});
test("unavailable exact models, colorways, materials and changed physical dimensions fail without substitutions", async () => {
  for (const [change, message] of [
    [{ family: "112NO-SUBSTITUTE" }, /exact Richardson model/],
    [{ colorway: "not-this-model-color" }, /exact hat color/],
    [{ leatherette: "retired-material" }, /no longer offered/],
    [{ preview: { physicalInches: { width: 2.7, height: 1.9 } } }, /physical patch dimensions/],
  ]) {
    const own = await item(change);
    await assert.rejects(() => reorder.prepareReorder(userA, own.id), message);
  }
});
test("old unsupported or quoted specifications are explained rather than guessed", async () => {
  const own = await item({ orderType: "catalog", variantId: randomUUID() });
  assert.equal((await reorder.ownReorderLines(userA, own.orderId))[0].supported, false);
  await assert.rejects(
    () => reorder.prepareReorder(userA, own.id),
    /cannot be restored automatically/,
  );
});
test("current stock availability includes requested quantity and does not reserve or create a new order", async () => {
  const own = await item();
  const id = randomUUID();
  await sql`insert into commerce_inventory(id,sku,title,category,on_hand,threshold) values(${id},'REORDER-QA-ONLY','TEST stock','hat',1,1)`;
  await sql`insert into commerce_inventory_rules(product_key,inventory_id,units_per_item) values('hat:112FP:Army Olive Green/Tan',${id},1)`;
  const [before] = await sql`select count(*)::int as n from commerce_orders`;
  await assert.rejects(() => reorder.prepareReorder(userA, own.id), /not currently available/);
  const [stock] =
    await sql`select reserved,committed,on_hand from commerce_inventory where id=${id}`;
  assert.deepEqual(stock, { reserved: 0, committed: 0, on_hand: 1 });
  const [after] = await sql`select count(*)::int as n from commerce_orders`;
  assert.equal(after.n, before.n);
});
