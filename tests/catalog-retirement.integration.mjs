import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("Retirement tests require isolated local storage without provider credentials.");
let server, sql, catalog, studio, lifecycle;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  catalog = await server.ssrLoadModule("/src/lib/catalog.ts");
  studio = await server.ssrLoadModule("/src/lib/studio-store.ts");
  lifecycle = await server.ssrLoadModule("/src/lib/catalog-lifecycle.ts");
});
after(async () => {
  await server?.close();
});
test("only exact 112PM is absent from active catalog; nine other identities and color counts survive", () => {
  const expected = {
    112: 104,
    "112FP": 19,
    "112FPR": 17,
    "112P": 10,
    "112PFP": 36,
    168: 17,
    "168P": 6,
    256: 19,
    "256P": 7,
  };
  assert.deepEqual(studio.MASTER.models.map((x) => x.id).sort(), Object.keys(expected).sort());
  assert.deepEqual(catalog.FAMILY_ORDER.slice().sort(), Object.keys(expected).sort());
  for (const [id, count] of Object.entries(expected)) {
    assert.equal(catalog.colorsForFamily(id).length, count);
    assert.equal(lifecycle.isRetiredHatModel(id), false);
  }
  assert.deepEqual(catalog.colorsForFamily("112PM"), []);
  assert.equal(
    catalog.FAMILIES["112PM"].short,
    "Richardson 112PM",
    "history still has its exact label",
  );
  const original = JSON.parse(readFileSync("src/data/catalog-patches.json")).models;
  assert.equal(original["112PM"].colorways.length, 8, "original catalog assets were not deleted");
});
test("retirement checks exact identifiers, never prefixes or free text", () => {
  for (const id of ["112", "112P", "112PFP", "112FPR", "112PM-extra", "Richardson 112PM"])
    assert.equal(lifecycle.isRetiredHatModel(id), false);
  assert.equal(lifecycle.hasRetiredModelOption({ modelId: "112PM" }), true);
  assert.equal(lifecycle.hasRetiredModelOption({ model: "112PFP" }), false);
  assert.throws(() => lifecycle.assertHatModelAvailable("hat", "112PM"), /no longer offered/);
  assert.doesNotThrow(() => lifecycle.assertHatModelAvailable("patch", "112PM"));
});
test("old browser drafts require a new color while retaining untouched customer art", async () => {
  const { useOrder, restoreActiveOrderDraft } =
    await server.ssrLoadModule("/src/lib/order-store.ts");
  const old = {
    family: "112PM",
    colorway: "Silver/Grey Camo",
    patchText: "Keep my design",
    artworkDataUrl: "data:image/png;base64,ORIGINAL",
    customerName: "Test",
    quantity: 3,
    patchPosition: { version: 2, anchor: { x: 0.3, y: 0.4 } },
    previewIdentity: { photoId: "old" },
  };
  const restored = restoreActiveOrderDraft(old, useOrder.getState());
  assert.equal(restored.family, "112");
  assert.equal(restored.colorway, "");
  assert.equal(restored.patchPosition, undefined);
  assert.equal(restored.previewIdentity, undefined);
  assert.equal(restored.artworkDataUrl, old.artworkDataUrl);
  assert.equal(restored.patchText, old.patchText);
  assert.equal(restored.quantity, 3);
  assert.match(restored.reorderNotice, /Choose an available/);
});
test("forged builder quotes and checkout writes fail before creating any order", async () => {
  const { quoteSelection } = await server.ssrLoadModule("/src/lib/commerce/pricing.server.ts");
  const { createCheckoutOrder } = await server.ssrLoadModule(
    "/src/lib/commerce/checkout.server.ts",
  );
  const selection = {
    orderType: "hat",
    family: "112PM",
    colorway: "Silver/Grey Camo",
    quantity: 1,
    leatherette: "buckskin",
    patchShape: "Circle",
    patchSize: "small",
  };
  const before = await sql`select count(*)::int as count from commerce_orders`;
  await assert.rejects(() => quoteSelection(selection, "", "", sql, null), /no longer offered/);
  await assert.rejects(
    () => createCheckoutOrder({ build: selection }, "stripe"),
    /no longer offered/,
  );
  assert.deepEqual(await sql`select count(*)::int as count from commerce_orders`, before);
});
test("archive migration preserves historical prices, artwork and other model records and is repeatable", async () => {
  const retired = randomUUID(),
    kept = randomUUID(),
    variant = randomUUID(),
    keepVariant = randomUUID(),
    order = randomUUID();
  await sql`insert into commerce_products(id,builder_family,title,category,state) values(${retired},'112PM','Historic printed mesh','Hats','active'),(${kept},'112PFP','Printed five-panel','Hats','active')`;
  await sql`insert into commerce_variants(id,product_id,title,sku,price,active,options) values(${variant},${retired},'Old color',${variant},3500,true,'{"modelId":"112PM"}'),(${keepVariant},${kept},'Current color',${keepVariant},3500,true,'{"modelId":"112PFP"}')`;
  await sql`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total) values(${order},'Test history','history@example.invalid','test',3500,3500)`;
  await sql`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values(${randomUUID()},${order},${"variant:" + variant},'Historical 112PM',1,1,3500,'{"family":"112PM","colorway":"Original"}',${Buffer.from("unchanged production artwork")},'image/png')`;
  const history = await sql`select * from commerce_order_items where order_id=${order}`;
  const migration = readFileSync("migrations/0015_retire_112pm.sql", "utf8");
  const pg = await (await server.ssrLoadModule("/src/lib/db.ts")).getPglite();
  for (let i = 0; i < 2; i++) await pg.transaction((tx) => tx.exec(migration));
  assert.equal(
    (await sql`select state from commerce_products where id=${retired}`)[0].state,
    "archived",
  );
  assert.equal(
    (await sql`select active from commerce_variants where id=${variant}`)[0].active,
    false,
  );
  assert.equal(
    (await sql`select state from commerce_products where id=${kept}`)[0].state,
    "active",
  );
  assert.equal(
    (await sql`select active from commerce_variants where id=${keepVariant}`)[0].active,
    true,
  );
  assert.deepEqual(await sql`select * from commerce_order_items where order_id=${order}`, history);
  assert.equal(
    (
      await sql`select count(*)::int as count from commerce_audit where resource_id=${retired} and action='product.archived'`
    )[0].count,
    1,
  );
});
test("standalone retired model options cannot leak into published variant discovery", async () => {
  const product = randomUUID(),
    bad = randomUUID(),
    good = randomUUID();
  await sql`insert into commerce_products(id,title,category,state) values(${product},'Exact model options','Hats','active')`;
  await sql`insert into commerce_variants(id,product_id,title,sku,price,active,options) values(${bad},${product},'Retired',${bad},3500,true,'{"family":"112PM"}'),(${good},${product},'Other exact model',${good},3500,true,'{"family":"112PFP"}')`;
  const { publishedVariants } = await server.ssrLoadModule(
    "/src/lib/commerce/availability.server.ts",
  );
  assert.deepEqual(
    (await publishedVariants(sql, [product])).map((v) => v.id),
    [good],
  );
});
test("owner catalog content cannot reactivate the retired model", async () => {
  const { mutate } = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
  await assert.rejects(
    () =>
      mutate(
        "product.builder_content",
        { family: "112PM", title: "Reactivate", description: "", version: 0 },
        { userId: "test-owner", role: "owner" },
      ),
    /active catalog model/,
  );
});
test("new 168P catalog photos never replace frozen builder photographs or other model images", async () => {
  const stage = await server.ssrLoadModule("/src/lib/stage-photos.ts");
  const additions = JSON.parse(readFileSync("src/data/catalog-photo-refresh.json")).records;
  const frozen = JSON.parse(readFileSync("src/data/crown-calibrations.json")).records;
  for (const r of additions) {
    const photo = frozen.find((p) => p.modelId === r.modelId && p.colorway === r.colorwayId);
    assert.ok(photo);
    assert.equal(stage.stageThumb("168P", r.sourceLabel), r.imageUrl);
    assert.equal(stage.stageFrontCalibration("168P", r.sourceLabel).id, photo.id);
    assert.equal(stage.stageViews("168P", r.sourceLabel).front, photo.imageUrl);
    assert.equal(stage.stageThumb("112", r.sourceLabel), null);
  }
  assert.equal(
    additions.some((r) => r.colorwayId.includes("realtree")),
    false,
    "unconfirmed DK Khaki stays out",
  );
});
test("archived color price records do not block owner pricing for the remaining models", async () => {
  const { saveDocument } = await server.ssrLoadModule("/src/lib/commerce/publishing.server.ts");
  const { DEFAULT_PRICING } = await server.ssrLoadModule("/src/lib/commerce/owner-schemas.ts");
  const book = { ...DEFAULT_PRICING, colors: { "112PM:Silver/Grey Camo": 3600 } };
  await saveDocument(
    { scope: "pricing", key: "main", version: 0, action: "publish", body: book },
    { userId: "test-owner", role: "owner" },
  );
  const { quoteSelection } = await server.ssrLoadModule("/src/lib/commerce/pricing.server.ts");
  const selection = {
    orderType: "hat",
    family: "112",
    colorway: "Black",
    quantity: 1,
    leatherette: "buckskin",
    patchShape: "Circle",
    patchSize: "small",
  };
  assert.equal((await quoteSelection(selection, "", "", sql, null)).totalCents, 3000);
  await assert.rejects(
    () =>
      quoteSelection(
        { ...selection, family: "112PM", colorway: "Silver/Grey Camo" },
        "",
        "",
        sql,
        null,
      ),
    /no longer offered/,
  );
});
