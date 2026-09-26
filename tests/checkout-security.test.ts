import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const fake = vi.hoisted(() => ({
  query: vi.fn(), account: vi.fn(), session: vi.fn(), createSession: vi.fn(), verify: vi.fn(), tax: vi.fn(),
}));
vi.mock("pg", () => ({ Pool: class { query = fake.query; } }));
vi.mock("stripe", () => ({ default: class {
  accounts = { retrieve: fake.account };
  checkout = { sessions: { retrieve: fake.session, create: fake.createSession } };
  webhooks = { constructEvent: fake.verify };
  tax = { transactions: { createFromCalculation: fake.tax } };
} }));
import { checkoutConfig, checkoutStatus, requireSameOrigin, stripeWebhook, createStripeSession, capturePaypalOrder } from "../src/lib/checkout.server";
const id = "11111111-1111-4111-8111-111111111111", token = "a".repeat(64);
const row = () => ({
  id, token_hash: createHash("sha256").update(token).digest("hex"), amount_cents: 4000,
  provider: "stripe", provider_id: "cs_test_order", status: "pending", created_at: new Date(),
  tax_transaction_id: "tax_transaction", tax_calculation_id: "tax_calc",
  draft: { customerEmail: "buyer@example.com", quantity: 1, orderType: "hat" },
  delivery: { name: "Test", address: { line1: "123 Test", country: "US" } },
});
const session = () => ({
  id: "cs_test_order", client_reference_id: id, metadata: { checkout_id: id },
  amount_total: 4000, currency: "usd", livemode: false,
  status: "complete", payment_status: "paid", payment_intent: "pi_test",
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({
    DATABASE_URL: "postgres://test", CHECKOUT_ORIGIN: "https://shop.example", PAYMENT_MODE: "sandbox",
    CHECKOUT_TAX_CONFIGURED: "true", CHECKOUT_HAT_TAX_CODE: "txcd_test", CHECKOUT_PATCH_TAX_CODE: "txcd_test",
    STRIPE_SECRET_KEY: "rk_test_placeholder", STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_ACCOUNT_ID: "acct_test",
    PAYPAL_CLIENT_ID: "client", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_WEBHOOK_ID: "webhook", PAYPAL_MERCHANT_ID: "merchant",
  })) vi.stubEnv(key, value);
  vi.stubEnv("VERCEL_ENV", "preview");
  const record = row();
  fake.query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith("select")) return { rows: params[1] && params[1] !== record.token_hash ? [] : [{ ...record }] };
    if (sql.includes("set status='paid'")) record.status = "paid";
    if (sql.includes("set provider=")) return { rows: [{ ...record }] };
    return { rows: [] };
  });
  fake.account.mockResolvedValue({ id: "acct_test" });
  fake.session.mockResolvedValue(session());
});
describe("checkout protection", () => {
  it("fails closed without tax configuration, keys, or database", () => {
    for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "CHECKOUT_TAX_CONFIGURED"]) {
      const saved = process.env[key]!;
      vi.stubEnv(key, "");
      expect(checkoutConfig()).toMatchObject({ stripe: false, paypal: false });
      vi.stubEnv(key, saved);
    }
  });
  it("never enables sandbox on production or live keys on previews", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(checkoutConfig().stripe).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("PAYMENT_MODE", "live");
    expect(checkoutConfig()).toMatchObject({ stripe: false, paypal: false });
  });
  it("rejects cross-origin requests", () => {
    expect(() => requireSameOrigin(new Request("https://shop.example/api/checkout", { headers: { origin: "https://evil.example" } }))).toThrow();
    expect(() => requireSameOrigin(new Request("https://shop.example/api/checkout", { headers: { origin: "https://shop.example" } }))).not.toThrow();
  });
  it("rejects guessed or wrong capability tokens before fetching payments", async () => {
    await expect(checkoutStatus(id, "wrong")).rejects.toThrow();
    await expect(checkoutStatus(id, "b".repeat(64))).rejects.toThrow();
    expect(fake.session).not.toHaveBeenCalled();
  });
  it("an unpaid complete session never marks an order paid", async () => {
    fake.session.mockResolvedValue({ ...session(), payment_status: "unpaid" });
    expect(await checkoutStatus(id, token)).toMatchObject({ status: "pending" });
    expect(fake.query.mock.calls.some(([sql]) => sql.includes("set status='paid'"))).toBe(false);
  });
  it.each([{ amount_total: 1 }, { currency: "eur" }, { livemode: true }, { client_reference_id: "another" }, { metadata: {} }])("rejects mismatched payment evidence %s", async (patch) => {
    fake.session.mockResolvedValue({ ...session(), ...patch });
    await expect(checkoutStatus(id, token)).rejects.toThrow("mismatch");
    expect(fake.query.mock.calls.some(([sql]) => sql.includes("set status='paid'"))).toBe(false);
  });
  it("verifies payment server-side and does not return customer data", async () => {
    const result = await checkoutStatus(id, token);
    expect(result.status).toBe("paid");
    expect(result).not.toHaveProperty("draft");
    expect(result).not.toHaveProperty("token_hash");
  });
  it("rejects a PayPal order substituted for the saved Stripe order", async () => {
    await expect(capturePaypalOrder(id, token, "ATTACKER_ORDER")).rejects.toThrow("does not match");
  });
  it.each(["valid", "amount", "merchant", "address", "pending"])("checks PayPal evidence: %s", async (variant) => {
    const record = { ...row(), provider: "paypal", provider_id: "PP_TEST", amount_cents: 1010 };
    fake.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith("select")) return { rows: [{ ...record }] };
      if (sql.includes("set status='paid'")) record.status = "paid";
      return { rows: [] };
    });
    const order = { id: "PP_TEST", status: variant === "pending" ? "APPROVED" : "COMPLETED", purchase_units: [{
      custom_id: id, payee: { merchant_id: variant === "merchant" ? "wrong" : "merchant" },
      amount: { currency_code: "USD", value: variant === "amount" ? "1.00" : "10.10" },
      shipping: { address: { country_code: "US", address_line_1: variant === "address" ? "other" : "123 Test" } },
      payments: { captures: [{ id: "CAP_TEST", status: "COMPLETED", amount: { currency_code: "USD", value: "10.10" } }] },
    }] };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/token") ? { access_token: "test" } : order), { status: 200 })));
    if (["amount", "merchant", "address"].includes(variant)) {
      await expect(capturePaypalOrder(id, token, "PP_TEST")).rejects.toThrow("mismatch");
      expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/capture"))).toBe(false);
    } else expect(await checkoutStatus(id, token)).toMatchObject({ status: variant === "pending" ? "pending" : "paid" });
  });
  it("rejects unsigned or incorrectly signed webhooks before any database access", async () => {
    await expect(stripeWebhook(new Request("https://shop.example", { method: "POST", body: "{}" }))).rejects.toThrow("signature");
    fake.verify.mockImplementation(() => { throw new Error("invalid"); });
    await expect(stripeWebhook(new Request("https://shop.example", { method: "POST", headers: { "stripe-signature": "invalid" }, body: "{}" }))).rejects.toThrow("signature");
    expect(fake.query).not.toHaveBeenCalled();
  });
  it("a signed unpaid event still cannot mark paid", async () => {
    fake.verify.mockReturnValue({ id: "evt_test", type: "checkout.session.completed", livemode: false, data: { object: { ...session(), payment_status: "unpaid" } } });
    await stripeWebhook(new Request("https://shop.example", { method: "POST", headers: { "stripe-signature": "test" }, body: "{}" }));
    expect(fake.query.mock.calls.some(([sql]) => sql.includes("set status='paid'"))).toBe(false);
  });
  it("reuses a saved session instead of creating another", async () => {
    fake.session.mockResolvedValue({ ...session(), status: "open", client_secret: "client_secret" });
    expect(await createStripeSession(id, token)).toEqual({ clientSecret: "client_secret" });
    expect(fake.createSession).not.toHaveBeenCalled();
  });
});
