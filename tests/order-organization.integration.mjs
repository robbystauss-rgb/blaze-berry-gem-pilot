import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.RESEND_API_KEY
)
  throw Error("Requires isolated local storage without providers.");
let server, sql, mutate, readAdmin;
const owner = { userId: "organization-owner", role: "owner" },
  manager = { userId: "organization-manager", role: "manager" },
  production = { userId: "organization-production", role: "production" };
const filter = { section: "production", search: "", page: 0, status: "" };
async function order(name, due = null, assigned = null) {
  const id = randomUUID();
  await sql`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total,due_at,assigned_to) values(${id},${name},'test@example.invalid','test_fixture',3000,3000,${due},${assigned})`;
  await sql`insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications) values(${randomUUID()},${id},'hat:112:Black','TEST FIXTURE hat',1,1,3000,'{"orderType":"hat"}')`;
  return id;
}
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  sql = await db.getSql();
  await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${production.userId},'TEST production','organization-production@example.invalid',true,now(),now())`;
  ({ mutate } = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts"));
  ({ readAdmin } = await server.ssrLoadModule("/src/lib/commerce/read.server.ts"));
});
after(async () => {
  await server?.close();
});
test("additive operational defaults preserve original financial/item data; manager edits priority/tags with an immutable audit", async () => {
  const id = await order("TEST default");
  const [before] = await sql`select * from commerce_order_items where order_id=${id}`;
  const [initial] = await sql`select priority,tags,version from commerce_orders where id=${id}`;
  assert.deepEqual(initial, { priority: "normal", tags: [], version: 1 });
  await mutate(
    "order.organize",
    { id, version: 1, priority: "high", tags: [" Team ", "team", "Deadline"] },
    manager,
  );
  const [updated] =
    await sql`select priority,tags,version,total,subtotal,stage from commerce_orders where id=${id}`;
  assert.deepEqual(updated, {
    priority: "high",
    tags: ["Team", "Deadline"],
    version: 2,
    total: 3000,
    subtotal: 3000,
    stage: "new",
  });
  const [after] = await sql`select * from commerce_order_items where order_id=${id}`;
  assert.deepEqual(after, before);
  const [audit] =
    await sql`select actor_id,before_value,after_value from commerce_audit where action='order.organization_updated' and resource_id=${id}`;
  assert.equal(audit.actor_id, manager.userId);
  assert.deepEqual(audit.before_value, { priority: "normal", tags: [] });
  assert.deepEqual(audit.after_value, { priority: "high", tags: ["Team", "Deadline"] });
  await assert.rejects(() => sql`delete from commerce_audit where resource_id=${id}`, /immutable/i);
});
test("production cannot change organization or carrier even on assigned orders; malformed values and mass-assigned totals fail", async () => {
  const id = await order("TEST denied", null, production.userId);
  const valid = { id, version: 1, priority: "high", tags: ["Shop only"] };
  await assert.rejects(() => mutate("order.organize", valid, production), /permission|denied/i);
  await assert.rejects(
    () =>
      mutate(
        "order.update",
        { id, version: 1, stage: "new", carrier: "Altered carrier" },
        production,
      ),
    /stages only/i,
  );
  for (const change of [
    { priority: "rush" },
    { tags: Array.from({ length: 13 }, (_, i) => "Tag" + i) },
    { tags: ["x".repeat(41)] },
    { tags: ["bad\nline"] },
    { total: 1 },
  ])
    await assert.rejects(() => mutate("order.organize", { ...valid, ...change }, owner));
  const [unchanged] =
    await sql`select version,total,priority,tags,carrier from commerce_orders where id=${id}`;
  assert.deepEqual(unchanged, {
    version: 1,
    total: 3000,
    priority: "normal",
    tags: [],
    carrier: null,
  });
});
test("concurrent editors accept one version and metadata cannot silently overwrite a stage change", async () => {
  const id = await order("TEST race");
  const result = await Promise.allSettled(
    ["high", "low"].map((priority) =>
      mutate("order.organize", { id, version: 1, priority, tags: [] }, owner),
    ),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  await mutate("order.update", { id, version: 2, stage: "artwork_review" }, owner);
  await assert.rejects(
    () => mutate("order.organize", { id, version: 2, priority: "normal", tags: [] }, owner),
    /Order changed/,
  );
  const [row] = await sql`select stage,version from commerce_orders where id=${id}`;
  assert.deepEqual(row, { stage: "artwork_review", version: 3 });
});
test("production queue orders high priority before due date, tag search and priority filter retain exact counts and staff assignment", async () => {
  const prefix = "Queue-" + randomUUID();
  const highLate = await order(prefix + " high late", "2026-11-20T12:00:00Z", production.userId);
  const highEarly = await order(prefix + " high early", "2026-11-10T12:00:00Z", production.userId);
  const normalEarly = await order(prefix + " normal early", "2026-10-20T12:00:00Z");
  for (const id of [highLate, highEarly])
    await mutate(
      "order.organize",
      { id, version: 1, priority: "high", tags: ["ExactTeamTag"] },
      owner,
    );
  const rows = await readAdmin({ ...filter, search: prefix }, owner);
  assert.deepEqual(
    rows.orders.map((o) => o.id),
    [highEarly, highLate, normalEarly],
  );
  assert.equal(rows.total, 3);
  const matched = await readAdmin({ ...filter, search: "exactteamtag", priority: "high" }, owner);
  assert.equal(matched.total, 2);
  const { exportRecords } = await server.ssrLoadModule("/src/lib/commerce/export.server.ts");
  const exported = await exportRecords(
    { ...filter, search: "exactteamtag", priority: "high" },
    owner,
  );
  assert.equal(exported.count, 2);
  assert.match(exported.csv, /ExactTeamTag/);
  assert.ok(!exported.csv.includes("normal early"));
  assert.deepEqual(
    matched.orders.map((o) => o.id),
    [highEarly, highLate],
  );
  assert.equal(
    (await readAdmin({ ...filter, search: prefix, priority: "normal" }, owner)).total,
    1,
  );
  const staff = await readAdmin({ ...filter, search: prefix }, production);
  assert.equal(staff.total, 2);
  assert.ok(staff.orders.every((o) => o.customer_email === "" && o.total === 0));
  const [payments] = await sql`select count(*)::int n from commerce_payments`;
  assert.equal(payments.n, 0);
});
