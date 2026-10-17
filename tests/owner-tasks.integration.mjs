import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import sharp from "sharp";
if (
  process.env.DATABASE_URL ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.VERCEL
)
  throw Error("Business task tests require isolated storage without provider credentials.");
let server, sql, tasks;
const owner = { userId: "task-owner", role: "owner" },
  manager = { userId: "task-manager", role: "manager" },
  production = { userId: "task-production", role: "production" };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  tasks = await server.ssrLoadModule("/src/lib/commerce/owner-tasks.server.ts");
  for (const actor of [owner, manager, production]) {
    await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${actor.userId},${actor.role},${actor.userId + "@example.invalid"},true,now(),now())`;
    await sql`insert into merchant_staff(user_id,role) values(${actor.userId},${actor.role})`;
  }
});
after(async () => {
  await new Promise((r) => setTimeout(r, 300));
  await server?.close();
});
const fresh = (more = {}) => ({
  id: randomUUID(),
  version: 0,
  title: "TEST ONLY supplier review",
  details: "Private fixture only",
  dueDate: "2020-01-02",
  priority: "high",
  state: "open",
  ...more,
});
test("general business tasks and private insights require owner website permission", async () => {
  for (const actor of [manager, production, { userId: "customer", role: null }]) {
    await assert.rejects(() => tasks.ownerTasks({ state: "all" }, actor), /Access denied/);
    await assert.rejects(() => tasks.saveOwnerTask(fresh(), actor), /Access denied/);
    await assert.rejects(() => tasks.ownerDashboardInsights(actor), /Access denied/);
  }
});
test("task creation persists due date, priority, author and immutable audit without modifying order data", async () => {
  const [{ count: ordersBefore }] = await sql`select count(*)::int as count from commerce_orders`;
  const input = fresh(),
    task = await tasks.saveOwnerTask(input, owner);
  assert.equal(task.due_date, "2020-01-02");
  assert.equal(task.priority, "high");
  assert.equal(task.created_by, owner.userId);
  assert.equal(task.version, 1);
  const data = await tasks.ownerTasks({ state: "open", search: input.title }, owner);
  assert.ok(data.tasks.some((t) => t.id === input.id));
  assert.ok(data.summary.overdue >= 1);
  assert.equal(
    (await sql`select count(*)::int as count from commerce_orders`)[0].count,
    ordersBefore,
  );
  const [audit] = await sql`select * from commerce_audit where resource_id=${input.id}`;
  assert.equal(audit.action, "owner_task.created");
  assert.equal(audit.after_value.title, input.title);
  await assert.rejects(() => sql`delete from commerce_audit where id=${audit.id}`, /immutable/);
  await assert.rejects(() => tasks.saveOwnerTask(fresh({ dueDate: "2026-02-30" }), owner));
  await assert.rejects(
    () => tasks.saveOwnerTask(fresh({ state: "done" }), owner),
    /Create a new task as Open/,
  );
});
test("task edit, complete, archive and reopen preserve history and reject stale saves", async () => {
  const input = fresh({ title: "TEST ONLY completion lifecycle" });
  let saved = await tasks.saveOwnerTask(input, owner);
  saved = await tasks.saveOwnerTask(
    {
      ...input,
      version: saved.version,
      title: "TEST ONLY reviewed supplier",
      dueDate: null,
      priority: "normal",
    },
    owner,
  );
  await assert.rejects(() => tasks.saveOwnerTask({ ...input, version: 1 }, owner), /task changed/);
  saved = await tasks.saveOwnerTask({ ...input, version: saved.version, state: "done" }, owner);
  assert.ok(saved.completed_at);
  saved = await tasks.saveOwnerTask({ ...input, version: saved.version, state: "archived" }, owner);
  assert.ok(saved.completed_at);
  assert.ok(
    (await tasks.ownerTasks({ state: "archived" }, owner)).tasks.some((t) => t.id === input.id),
  );
  saved = await tasks.saveOwnerTask({ ...input, version: saved.version, state: "open" }, owner);
  assert.equal(saved.completed_at, null);
  assert.equal((await sql`select * from commerce_audit where resource_id=${input.id}`).length, 5);
});
test("campaign reminders and recent uploads come only from actual stored data and remain read-only", async () => {
  const { savePromotion } = await server.ssrLoadModule("/src/lib/commerce/pricing.server.ts");
  const { uploadMedia } = await server.ssrLoadModule("/src/lib/commerce/media.server.ts");
  const id = randomUUID(),
    code = "TASK-" + id.slice(0, 8).toUpperCase();
  await savePromotion(
    {
      id,
      code,
      version: 0,
      state: "active",
      definition: {
        campaign: "TEST ONLY future campaign",
        type: "percent",
        amount: 10,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 86400000 * 7).toISOString(),
        minimumSpend: 0,
        minimumQuantity: 1,
        families: [],
        orderType: "any",
        maximumUses: null,
        perCustomer: null,
        customerEmail: null,
        firstOrder: false,
        automatic: false,
        perItem: false,
      },
    },
    owner,
  );
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const photo = await uploadMedia(
    {
      name: "TEST-ONLY-recent-photo.png",
      data: "data:image/png;base64," + png.toString("base64"),
      alt: "",
    },
    owner,
  );
  const [before] = await sql`select count(*)::int as count from commerce_audit`;
  const insights = await tasks.ownerDashboardInsights(owner);
  assert.equal(insights.promotions.find((p) => p.id === id).upcoming, true);
  assert.equal(insights.uploads.find((m) => m.id === photo.id).name, "TEST-ONLY-recent-photo.png");
  assert.ok(insights.uploads.every((m) => !("original" in m) && !("bytes" in m)));
  assert.equal(
    (await sql`select count(*)::int as count from commerce_audit`)[0].count,
    before.count,
  );
});

test("Chicago calendar presets and inclusive through dates handle spring/fall daylight saving", async () => {
  const dates = await server.ssrLoadModule("/src/lib/commerce/business-dates.ts");
  assert.equal(dates.businessMidnight("2026-03-08"), "2026-03-08T06:00:00.000Z");
  assert.equal(dates.businessMidnight("2026-03-09"), "2026-03-09T05:00:00.000Z");
  assert.equal(dates.businessMidnight("2026-11-01"), "2026-11-01T05:00:00.000Z");
  assert.equal(dates.businessMidnight("2026-11-02"), "2026-11-02T06:00:00.000Z");
  const now = new Date("2026-10-16T15:00:00Z");
  assert.equal(dates.reportBounds("week", "", "", now).from, "2026-10-12T05:00:00.000Z");
  assert.equal(dates.reportBounds("month", "", "", now).from, "2026-10-01T05:00:00.000Z");
  const spring = dates.reportBounds("today", "2026-03-08", "2026-03-08", now);
  assert.equal(Date.parse(spring.to) - Date.parse(spring.from), 23 * 3600000);
  assert.throws(() => dates.businessMidnight("2026-02-30"), /valid calendar date/);
});

test("orders placed and order trend follow the report period while backlog counts remain all-time", async () => {
  const read = await server.ssrLoadModule("/src/lib/commerce/read.server.ts");
  for (const when of ["2026-06-01T12:00:00Z", "2026-06-15T12:00:00Z"])
    await sql`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total,stage,created_at) values(${randomUUID()},'TEST ONLY period count','test@example.invalid','test_fixture',1000,1000,'completed',${when})`;
  const result = await read.readAdmin(
    {
      section: "overview",
      search: "",
      page: 0,
      status: "",
      from: "2026-06-10T00:00:00Z",
      to: "2026-06-20T00:00:00Z",
    },
    owner,
    sql,
  );
  assert.equal(result.metrics.new_orders, 1);
  assert.equal(result.metrics.awaiting_payment, 2);
  assert.equal(result.metrics.completed, 2);
  assert.equal(
    result.trend.reduce((sum, day) => sum + day.orders, 0),
    1,
  );
  assert.equal(
    result.trend.reduce((sum, day) => sum + day.collected, 0),
    0,
  );
});
