import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import Stripe from "stripe";

for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "STRIPE_WEBHOOK_SECRET"])
  if (process.env[key]) throw Error("Branding tests refuse external credentials.");
const originalEnv = { ...process.env };
let server, sql, manageInvoice, account, publicName, requests;
const accountId = "acct_reviewedFixture";
const client = new Stripe("sk_test_isolated_no_network", {
  maxNetworkRetries: 0,
  httpClient: Stripe.createFetchHttpClient(async (input, init) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://api.stripe.com");
    requests.push({ path: url.pathname, method: init.method });
    if (url.pathname === "/v1/account") return Response.json(account);
    assert.equal(init.method, "GET", "Unverified branding must never send an invoice");
    assert.match(url.pathname, /^\/v1\/invoices\/in_fixture_/);
    return Response.json({
      id: url.pathname.split("/").at(-1),
      status: "open",
      total: 1200,
      currency: "usd",
      customer_email: "buyer@example.invalid",
      account_name: publicName,
      hosted_invoice_url: "https://invoice.stripe.com/i/test_fixture",
      invoice_pdf: null,
      livemode: false,
    });
  }),
});
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  ({ manageInvoice } = await server.ssrLoadModule("/src/lib/commerce/invoices.server.ts"));
  await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values('branding-test-owner','TEST OWNER','owner@example.invalid',true,now(),now())`;
});
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_isolated_no_network";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_fixture";
  process.env.REC_INVOICE_BRANDING_VERIFIED = "true";
  process.env.REC_INVOICE_SENDER = "orders@recmamamade.com";
  delete process.env.REC_INVOICE_STRIPE_ACCOUNT_ID;
  account = { id: accountId, object: "account" };
  publicName = "REC Mama Made";
  requests = [];
});
after(async () => {
  await server?.close();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});
async function order() {
  const id = randomUUID();
  await sql`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total) values(${id},'TEST ONLY','buyer@example.invalid','branding_test',1200,1200)`;
  await sql`insert into commerce_invoices(order_id,provider_id,state) values(${id},${"in_fixture_" + id},'open')`;
  return id;
}
const invoke = (id, action = "create") => manageInvoice(id, action, "branding-test-owner", client);

test("omitted own-account profile requires the separately reviewed exact account pin", async () => {
  const id = await order();
  await assert.rejects(() => invoke(id), /Pin the reviewed/);
  process.env.REC_INVOICE_STRIPE_ACCOUNT_ID = "acct_otherFixture";
  await assert.rejects(() => invoke(id), /Pin the reviewed/);
  assert.ok(requests.every((r) => r.path === "/v1/account"));
});
test("reviewed pin and provider invoice public name allow the existing obligation", async () => {
  process.env.REC_INVOICE_STRIPE_ACCOUNT_ID = accountId;
  const id = await order();
  const result = await invoke(id);
  assert.equal(result.state, "open");
  assert.equal(result.testMode, true);
  assert.equal(result.url, "https://invoice.stripe.com/i/test_fixture");
  const [saved] = await sql`select state,hosted_url from commerce_invoices where order_id=${id}`;
  assert.equal(saved.state, "open");
  assert.equal(saved.hosted_url, result.url);
});
test("mismatched provider invoice name blocks both payment-link publication and send", async () => {
  process.env.REC_INVOICE_STRIPE_ACCOUNT_ID = accountId;
  publicName = "Unreviewed business";
  const id = await order();
  await assert.rejects(() => invoke(id, "send"), /invoice public business name/);
  const [saved] =
    await sql`select state,hosted_url,sent_at from commerce_invoices where order_id=${id}`;
  assert.equal(saved.state, "error");
  assert.equal(saved.hosted_url, null);
  assert.equal(saved.sent_at, null);
  assert.ok(requests.every((r) => r.method === "GET"));
});
test("a pin never overrides a reported empty or mismatched business profile", async () => {
  process.env.REC_INVOICE_STRIPE_ACCOUNT_ID = accountId;
  const id = await order();
  for (const profile of [
    null,
    {},
    { name: "Other business", support_email: "orders@recmamamade.com" },
  ]) {
    account.business_profile = profile;
    await assert.rejects(() => invoke(id), /account business name/);
  }
  account.business_profile = { name: "REC Mama Made", support_email: "wrong@example.invalid" };
  await assert.rejects(() => invoke(id), /sender must match/);
  assert.ok(requests.every((r) => r.path === "/v1/account"));
});
test("explicit branding approval remains required even with an exact pin", async () => {
  process.env.REC_INVOICE_STRIPE_ACCOUNT_ID = accountId;
  process.env.REC_INVOICE_BRANDING_VERIFIED = "false";
  await assert.rejects(() => invoke("unused"), /Confirm REC Mama Made Stripe branding/);
  assert.equal(requests.length, 0);
});
