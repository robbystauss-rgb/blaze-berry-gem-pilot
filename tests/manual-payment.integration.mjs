import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
if (process.env.DATABASE_URL || process.env.STRIPE_SECRET_KEY || process.env.RESEND_API_KEY)
  throw Error("Use isolated storage with no provider credentials.");
let server, sql, mutate, core, read, schema, errors, safety;
const owner = { userId: "manual-test-owner", role: "owner" };
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  ({ mutate } = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts"));
  core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
  read = await server.ssrLoadModule("/src/lib/commerce/read.server.ts");
  schema = await server.ssrLoadModule("/src/lib/commerce/manual-payment.ts");
  errors = await server.ssrLoadModule("/src/lib/commerce/errors.ts");
  safety = await server.ssrLoadModule("/src/lib/commerce/checkout-safety.server.ts");
  await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${owner.userId},'TEST OWNER','manual-owner@example.invalid',true,now(),now())`;
  await sql`insert into merchant_staff(user_id,role) values(${owner.userId},'owner')`;
});
after(async () => {
  await server?.close();
});
async function draft() {
  return (
    await mutate(
      "order.draft",
      {
        customerName: "TEST ONLY manual receipt",
        customerEmail: "manual-test@example.invalid",
        title: "Test hat",
        quantity: 2,
        unitAmount: 3000,
        specifications: "Test unchanged specification",
        dueAt: null,
        requestId: randomUUID(),
      },
      owner,
    )
  ).id;
}
const receipt = (id, extra = {}) => ({
  id,
  amount: 6000,
  method: "venmo",
  reference: "TEST-" + randomUUID(),
  reason: "Payment independently verified in Venmo (TEST ONLY)",
  occurredAt: new Date(Date.now() - 60000).toISOString(),
  requestId: randomUUID(),
  ...extra,
});
test("short/blank reason and receipt have field guidance without JSON, dollars preserve integer cents", async () => {
  const id = await draft();
  for (const reason of ["", "yes", "    "]) {
    let error;
    try {
      await mutate("payment.manual", receipt(id, { reason }), owner);
    } catch (e) {
      error = e;
    }
    assert.ok(error);
    const message = errors.ownerError(error);
    assert.match(message, /verification note of at least 5/);
    assert.doesNotMatch(message, /"path"|"too_small"|\[\s*\{/);
  }
  assert.equal(schema.dollarsToCents("12.01"), 1201);
  assert.ok(Number.isNaN(schema.dollarsToCents("1.005")));
  assert.equal((await core.orderById(sql, id)).paid, 0);
});
test("valid Venmo persists exactly once across retries, new request ids, refresh reads, and audit", async () => {
  const id = await draft(),
    input = receipt(id);
  const [first, retry] = await Promise.all([
    mutate("payment.manual", input, owner),
    mutate("payment.manual", input, owner),
  ]);
  const repeated = await mutate("payment.manual", { ...input, requestId: randomUUID() }, owner);
  assert.equal(retry.receiptId, first.receiptId);
  assert.equal(repeated.receiptId, first.receiptId);
  assert.equal(retry.duplicate, true);
  const detail = await read.readOrder(id, owner);
  assert.equal(detail.order.paid, 6000);
  assert.equal(detail.order.total, 6000);
  assert.equal(detail.order.payment_status, "paid");
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].method, "venmo");
  assert.equal(detail.payments[0].actor_id, owner.userId);
  assert.equal(detail.payments[0].reason, input.reason);
  const audits = detail.audit.filter((a) => a.action === "payment.received");
  assert.equal(audits.length, 1);
  assert.equal(audits[0].after_value.method, "venmo");
  assert.equal(audits[0].after_value.requestId, input.requestId);
  await assert.rejects(
    () => mutate("payment.manual", { ...input, reference: "EDITED" }, owner),
    /different details/,
  );
  await assert.rejects(() => mutate("payment.manual", { ...input, id: randomUUID() }, owner));
});
test("partial and full receipts preserve original prices and cannot approve required artwork", async () => {
  const id = await draft();
  await sql`insert into commerce_proof_controls(order_id,required) values(${id},true)`;
  const unpaid = await read.readOrder(id, owner);
  await assert.rejects(
    () =>
      mutate(
        "order.update",
        { id, version: unpaid.order.version, stage: "ready_for_production" },
        owner,
      ),
    /Full verified payment/,
  );
  const before = unpaid.items;
  const partial = await mutate(
    "payment.manual",
    receipt(id, { amount: 1201, method: "cash" }),
    owner,
  );
  assert.equal(partial.remaining, 4799);
  assert.equal(partial.paymentStatus, "partially_paid");
  await mutate("payment.manual", receipt(id, { amount: 4799 }), owner);
  const after = await read.readOrder(id, owner);
  assert.equal(after.order.payment_status, "paid");
  assert.equal(after.proof.blocked, true);
  assert.deepEqual(after.items, before);
  await assert.rejects(
    () => mutate("order.update", { id, version: after.order.version, stage: "engraving" }, owner),
    /proof|approval/i,
  );
});
test("authorization, future time, excessive amount, reference reuse and missing values fail safely", async () => {
  const id = await draft(),
    input = receipt(id);
  for (const role of ["manager", "production"])
    await assert.rejects(
      () => mutate("payment.manual", input, { ...owner, role }),
      /Access denied/,
    );
  await assert.rejects(
    () =>
      mutate(
        "payment.manual",
        { ...input, occurredAt: new Date(Date.now() + 3600000).toISOString() },
        owner,
      ),
    /future/,
  );
  await assert.rejects(
    () => mutate("payment.manual", { ...input, amount: 6001 }, owner),
    /exceeds/,
  );
  await assert.rejects(
    () => mutate("payment.manual", { ...input, reference: "x" }, owner),
    /at least 3/,
  );
  await assert.rejects(() => mutate("payment.manual", { id }, owner));
  await mutate("payment.manual", input, owner);
  const other = await draft();
  await assert.rejects(
    () =>
      mutate(
        "payment.manual",
        { ...input, id: other, requestId: randomUUID(), reference: input.reference.toLowerCase() },
        owner,
      ),
    /already recorded/,
  );
  assert.equal((await core.orderById(sql, other)).paid, 0);
});
test("Stripe invoice claim without provider id and pending checkout both block external money", async () => {
  const id = await draft();
  await sql`insert into commerce_invoices(order_id,state) values(${id},'processing')`;
  await assert.rejects(
    () => mutate("payment.manual", receipt(id), owner),
    /Stripe invoice is active/,
  );
  await sql`update commerce_invoices set state='void' where order_id=${id}`;
  await sql`insert into commerce_checkouts(order_id,provider,reference,state) values(${id},'stripe',${"cs_test_" + randomUUID()},'pending')`;
  await assert.rejects(
    () => mutate("payment.manual", receipt(id), owner),
    /checkout can still collect/,
  );
  assert.equal((await core.orderById(sql, id)).paid, 0);
});

test("an open dispute holds a funded order without changing its receipt or approving artwork", async () => {
  const id = await draft();
  await mutate("payment.manual", receipt(id), owner);
  const reference = "TEST-dispute-" + randomUUID();
  await sql`insert into commerce_disputes(reference,order_id,state) values(${reference},${id},'needs_response')`;
  const advance = async (stage) =>
    mutate("order.update", { id, version: (await core.orderById(sql, id)).version, stage }, owner);
  for (const stage of ["ready_for_production", "engraving", "completed"])
    await assert.rejects(() => advance(stage), /open payment dispute/);
  assert.equal((await core.orderById(sql, id)).stage, "new");
  await sql`update commerce_disputes set state='won' where reference=${reference}`;
  await sql`insert into commerce_proof_controls(order_id,required) values(${id},true)`;
  await assert.rejects(() => advance("ready_for_production"), /proof|approval/i);
  const detail = await read.readOrder(id, owner);
  assert.equal(detail.order.paid, 6000);
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.proof.blocked, true);
});
test("provider-confirmed Stripe checkout expiry disables collection and preserves order for offline receipt", async () => {
  const id = await draft(),
    ref = "cs_test_" + randomUUID();
  await sql`insert into commerce_checkouts(order_id,provider,reference) values(${id},'stripe',${ref})`;
  const session = {
    id: ref,
    metadata: { rec_order_id: id },
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
  };
  let expires = 0;
  const client = {
    checkout: {
      sessions: {
        retrieve: async () => ({ ...session }),
        expire: async () => {
          expires++;
          return { ...session, status: "expired" };
        },
      },
    },
  };
  await safety.expireCheckoutForOfflinePayment(id, owner, client);
  assert.equal(expires, 1);
  await mutate("payment.manual", receipt(id), owner);
  assert.equal(
    (await sql`select state from commerce_checkouts where order_id=${id}`)[0].state,
    "expired",
    "manual receipt must not counterfeit checkout-paid status",
  );
  assert.equal((await core.orderById(sql, id)).stage, "new");
  assert.equal((await core.orderById(sql, id)).paid, 6000);
  const other = await draft();
  await sql`insert into commerce_checkouts(order_id,provider,reference) values(${other},'stripe',${ref + "other"})`;
  session.metadata.rec_order_id = other;
  session.payment_intent = "pi_processing";
  await assert.rejects(
    () => safety.expireCheckoutForOfflinePayment(other, owner, client),
    /payment attempt/,
  );
  assert.equal(expires, 1);
});
