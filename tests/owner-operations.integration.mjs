import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
if (
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.VERCEL
)
  throw Error("Owner operations tests require isolated storage and no provider credentials.");
let server, sql, imports, csvReader, mutations, read, availability;
const owner = { userId: "inventory-test-owner", role: "owner" },
  manager = { userId: "inventory-test-manager", role: "manager" },
  production = { userId: "inventory-test-production", role: "production" };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  imports = await server.ssrLoadModule("/src/lib/commerce/inventory-import.server.ts");
  csvReader = await server.ssrLoadModule("/src/lib/commerce/inventory-csv.ts");
  mutations = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
  read = await server.ssrLoadModule("/src/lib/commerce/read.server.ts");
  availability = await server.ssrLoadModule("/src/lib/commerce/availability.server.ts");
  for (const actor of [owner, manager, production]) {
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${actor.userId},${actor.role},${actor.userId + "@example.invalid"},true,now(),now())`;
    await sql`insert into merchant_staff(user_id,role) values(${actor.userId},${actor.role})`;
  }
});
after(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await server?.close();
});
async function seed(onHand = 10) {
  const sku = "TEST-" + randomUUID();
  const { id } = await mutations.mutate(
    "inventory.create",
    { sku, title: "TEST ONLY blanks", category: "blank_hat", threshold: 3 },
    owner,
  );
  await mutations.mutate(
    "inventory.adjust",
    { id, version: 1, delta: onHand, reason: "TEST ONLY initial count", requestId: randomUUID() },
    owner,
  );
  return { id, sku };
}
const input = (csv) => ({ csv, reason: "TEST ONLY physical count reference" });
async function proposal(p, actor = owner) {
  const preview = await imports.previewInventoryImport(p, actor);
  return { ...p, fingerprint: preview.fingerprint, requestId: randomUUID() };
}

test("CSV handles BOM, quoted commas/newlines and escaped quotes while rejecting malformed or unbounded files", () => {
  const rows = csvReader.readInventoryCsv(
    '\uFEFFsku,on_hand,title\r\nA,2,"Hat, ""blue""\nfront"\r\n',
  );
  assert.equal(rows[0].cells.title, 'Hat, "blue"\nfront');
  assert.equal(rows[0].line, 2);
  for (const text of [
    "sku,on_hand\nA",
    "sku,sku,on_hand\nA,A,1",
    "sku,reserved,on_hand\nA,1,2",
    'sku,on_hand\n"A,2',
    'sku,on_hand\n"A"tail,2',
    "sku,on_hand\nA\0,2",
    "sku,on_hand\n" + "A,1\n".repeat(501),
    "x".repeat(200001),
    "é".repeat(100001),
  ])
    assert.throws(() => csvReader.readInventoryCsv(text));
});

test("inventory permission is required for preview/import/export and preview performs no stock writes", async () => {
  const item = await seed(),
    p = input(`sku,on_hand\n${item.sku},6`);
  for (const actor of [production, { userId: "not-owner", role: null }]) {
    await assert.rejects(() => imports.previewInventoryImport(p, actor), /Access denied/);
    await assert.rejects(() => imports.commitInventoryImport({}, actor), /Access denied/);
    await assert.rejects(() => imports.exportInventoryCounts(actor), /Access denied/);
  }
  const before = (await sql`select * from commerce_inventory where id=${item.id}`)[0];
  const preview = await imports.previewInventoryImport(p, manager);
  assert.equal(preview.summary.update, 1);
  assert.equal(preview.rows[0].before.on_hand, 10);
  assert.equal(preview.rows[0].onHand, 6);
  assert.deepEqual((await sql`select * from commerce_inventory where id=${item.id}`)[0], before);
});

test("validated create/update import uses existing movements, audit and immutable idempotency receipts", async () => {
  const item = await seed(),
    newSku = "NEW-" + randomUUID();
  const p = input(
    `sku,title,category,on_hand,threshold,incoming,reason\n${item.sku},,,6,4,9,Counted shelf\n${newSku},New test blanks,blank_hat,8,2,0,Received fixture`,
  );
  const request = await proposal(p, manager),
    result = await imports.commitInventoryImport(request, manager);
  assert.deepEqual(result, { create: 1, update: 1, unchanged: 0, errors: 0 });
  const [updated] = await sql`select * from commerce_inventory where id=${item.id}`;
  assert.equal(updated.on_hand, 6);
  assert.equal(updated.threshold, 4);
  assert.equal(updated.incoming, 9);
  const [movement] =
    await sql`select * from commerce_movements where inventory_id=${item.id} and request_id=${request.requestId + ":2"}`;
  assert.equal(movement.on_hand_delta, -4);
  assert.equal(movement.actor_id, manager.userId);
  assert.match(movement.reason, /Counted shelf/);
  assert.equal(
    (
      await sql`select * from commerce_audit where action='inventory.csv_imported' and resource_id=${request.requestId}`
    ).length,
    1,
  );
  assert.deepEqual(await imports.commitInventoryImport(request, manager), result);
  assert.equal(
    (await sql`select * from commerce_movements where request_id=${request.requestId + ":2"}`)
      .length,
    1,
  );
  await assert.rejects(
    () =>
      imports.commitInventoryImport({ ...request, reason: "different count reference" }, manager),
    /different content/,
  );
  await assert.rejects(
    () => sql`delete from commerce_inventory_imports where request_id=${request.requestId}`,
    /immutable/,
  );
});

test("row errors prevent the entire import and count changes after preview require another review", async () => {
  const item = await seed(),
    bad = input(`sku,on_hand\n${item.sku},7\nNO-TITLE,1.5`);
  const preview = await imports.previewInventoryImport(bad, owner);
  assert.equal(preview.summary.errors, 1);
  assert.ok(preview.rows[1].errors.length >= 3);
  await assert.rejects(
    () =>
      imports.commitInventoryImport(
        { ...bad, fingerprint: preview.fingerprint, requestId: randomUUID() },
        owner,
      ),
    /Nothing imported/,
  );
  assert.equal(
    (await sql`select on_hand from commerce_inventory where id=${item.id}`)[0].on_hand,
    10,
  );
  const request = await proposal(input(`sku,on_hand\n${item.sku},7`));
  const [current] = await sql`select version from commerce_inventory where id=${item.id}`;
  await mutations.mutate(
    "inventory.adjust",
    {
      id: item.id,
      version: current.version,
      delta: 2,
      reason: "Another verified receipt",
      requestId: randomUUID(),
    },
    owner,
  );
  await assert.rejects(
    () => imports.commitInventoryImport(request, owner),
    /Stock changed after preview/,
  );
  assert.equal(
    (await sql`select on_hand from commerce_inventory where id=${item.id}`)[0].on_hand,
    12,
  );
});

test("reservation changes invalidate previews; held stock cannot be reduced and customer availability updates", async () => {
  const item = await seed(),
    key = "hat:112:Black";
  await mutations.mutate(
    "inventory.rule",
    { inventoryId: item.id, productKey: key, units: 1 },
    owner,
  );
  const request = await proposal(input(`sku,on_hand\n${item.sku},8`));
  const order = await mutations.mutate(
    "order.draft",
    {
      customerName: "TEST ONLY reserved buyer",
      customerEmail: "test@example.invalid",
      title: "TEST ONLY hats",
      quantity: 4,
      unitAmount: 3000,
      specifications: "TEST ONLY",
      dueAt: null,
      productKey: key,
      requestId: randomUUID(),
    },
    owner,
  );
  await assert.rejects(() => imports.commitInventoryImport(request, owner), /Stock changed/);
  const belowHeld = await imports.previewInventoryImport(
    input(`sku,on_hand\n${item.sku},3`),
    owner,
  );
  assert.match(belowHeld.rows[0].errors.join(" "), /4 units held/);
  const safe = await proposal(input(`sku,on_hand\n${item.sku},6`));
  await imports.commitInventoryImport(safe, owner);
  await assert.rejects(
    () =>
      availability.checkBuildAvailability(sql, {
        orderType: "hat",
        family: "112",
        colorway: "Black",
        quantity: 3,
      }),
    /not currently available/,
  );
  const dashboard = await read.readAdmin(
    { section: "overview", search: "", page: 0, status: "" },
    owner,
    sql,
  );
  assert.ok(dashboard.metrics.low_stock >= 1);
  assert.equal(
    (await sql`select quantity,state from commerce_allocations where order_id=${order.id}`)[0]
      .quantity,
    4,
  );
});

test("a failure after the first update rolls back every count, movement and receipt", async () => {
  const item = await seed(),
    rejectedSku = "REJECT-" + randomUUID();
  const request = await proposal(
    input(
      `sku,title,category,on_hand\n${item.sku},,,7\n${rejectedSku},Rejected fixture,supplies,2`,
    ),
  );
  await sql.query(
    `create function reject_inventory_test() returns trigger language plpgsql as $$ begin if new.sku='${rejectedSku}' then raise exception 'isolated intentional inventory rejection'; end if; return new; end $$`,
  );
  await sql.query(
    "create trigger reject_inventory_test before insert on commerce_inventory for each row execute function reject_inventory_test()",
  );
  try {
    await assert.rejects(
      () => imports.commitInventoryImport(request, owner),
      /intentional inventory rejection/,
    );
    assert.equal(
      (await sql`select on_hand from commerce_inventory where id=${item.id}`)[0].on_hand,
      10,
    );
    assert.equal(
      (await sql`select * from commerce_inventory_imports where request_id=${request.requestId}`)
        .length,
      0,
    );
    assert.equal(
      (await sql`select * from commerce_movements where request_id=${request.requestId + ":2"}`)
        .length,
      0,
    );
  } finally {
    await sql.query("drop trigger reject_inventory_test on commerce_inventory");
    await sql.query("drop function reject_inventory_test()");
  }
});

test("count export is audited, formula-safe and can preview an unchanged round trip", async () => {
  const item = await seed();
  const exported = await imports.exportInventoryCounts(owner);
  assert.ok(exported.csv.includes(item.sku));
  assert.equal(csvReader.inventoryCsvCell('  =HYPERLINK("bad")'), '"\'  =HYPERLINK(""bad"")"');
  assert.equal(
    (await sql`select * from commerce_audit where action='inventory.counts_exported'`).length,
    1,
  );
  const checked = await imports.previewInventoryImport(input(exported.csv), owner);
  assert.equal(checked.summary.errors, 0);
  assert.equal(checked.summary.update, 0);
  assert.equal(checked.summary.create, 0);
  assert.equal(checked.summary.unchanged, exported.count);
});
