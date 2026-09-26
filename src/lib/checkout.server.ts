import Stripe from "stripe";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { deliverySchema, validateCheckoutDraft, type Delivery } from "./checkout-validation";
import { shippingEstimate } from "./checkout-shipping";

type Provider = "stripe" | "paypal";
type Checkout = {
  id: string; token_hash: string; draft: ReturnType<typeof validateCheckoutDraft>["draft"];
  amount_cents: number; currency: string; provider: Provider | null;
  provider_id: string | null; status: "pending" | "paid" | "failed" | "expired"; created_at: Date;
  subtotal_cents: number; shipping_cents: number; tax_cents: number;
  tax_calculation_id: string | null; tax_transaction_id: string | null; delivery: Delivery;
  tax_mode: "automatic" | "not_collected";
};
let pool: Pool | undefined;
function database() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error("Checkout is not configured.");
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
}
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
function stripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20000 });
}
function isLive() { return process.env.PAYMENT_MODE === "live"; }
function taxMode() { return process.env.CHECKOUT_TAX_MODE ?? "automatic"; }
function configured(provider: Provider) {
  const mode = isLive() ? "live" : "test";
  // Zero collection is an explicit merchant policy, never an error fallback.
  const taxReady = taxMode() === "not_collected" || (taxMode() === "automatic" &&
    process.env.CHECKOUT_TAX_CONFIGURED === "true" &&
    process.env.CHECKOUT_HAT_TAX_CODE && process.env.CHECKOUT_PATCH_TAX_CODE);
  const common = Boolean(process.env.DATABASE_URL && process.env.CHECKOUT_ORIGIN &&
    taxReady &&
    new RegExp(`^[sr]k_${mode}_`).test(process.env.STRIPE_SECRET_KEY ?? "") &&
    process.env.STRIPE_ACCOUNT_ID &&
    ["sandbox", "live"].includes(process.env.PAYMENT_MODE ?? ""));
  if (process.env.VERCEL_ENV === "production" && !isLive()) return false;
  if (process.env.VERCEL_ENV === "preview" && isLive()) return false;
  if (provider === "stripe") {
    return common && new RegExp(`^[sr]k_${mode}_`).test(process.env.STRIPE_SECRET_KEY ?? "") &&
      (process.env.STRIPE_PUBLISHABLE_KEY ?? "").startsWith(`pk_${mode}_`) &&
      Boolean(process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_ACCOUNT_ID);
  }
  return common && Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET &&
    process.env.PAYPAL_WEBHOOK_ID && process.env.PAYPAL_MERCHANT_ID);
}
export function checkoutConfig() {
  return {
    stripe: configured("stripe"), paypal: configured("paypal"), sandbox: !isLive(),
    stripeKey: configured("stripe") ? process.env.STRIPE_PUBLISHABLE_KEY : undefined,
    paypalClientId: configured("paypal") ? process.env.PAYPAL_CLIENT_ID : undefined,
  };
}
export class CheckoutError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function requireProvider(provider: Provider) {
  if (!configured(provider)) throw new CheckoutError("Online payment is not available yet. Your build is saved.", 503);
}
function origin() {
  const url = new URL(process.env.CHECKOUT_ORIGIN!);
  if (isLive() && url.protocol !== "https:") throw new Error("HTTPS is required.");
  return url.origin;
}
export function requireSameOrigin(request: Request) {
  const expected = process.env.CHECKOUT_ORIGIN ? origin() : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected) throw new CheckoutError("Request origin not allowed.", 403);
}
export async function rateLimit(request: Request) {
  if (!configured("stripe") && !configured("paypal")) return;
  // Vercel overwrites this header at the edge. No customer IP is persisted.
  const ip = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for") ?? "unknown" : "local";
  const key = digest(ip);
  const result = await database().query<{ hits: number }>(
    "insert into rec_checkout_limits(key,window_start,hits) values($1,now(),1) on conflict(key) do update set hits=case when rec_checkout_limits.window_start < now()-interval '10 minutes' then 1 else rec_checkout_limits.hits+1 end, window_start=case when rec_checkout_limits.window_start < now()-interval '10 minutes' then now() else rec_checkout_limits.window_start end returning hits", [key],
  );
  if (result.rows[0].hits > 80) throw new CheckoutError("Please wait a few minutes before trying again.", 429);
}
export async function startArtworkUpload(hash: unknown, parts: unknown) {
  if (!configured("stripe") && !configured("paypal")) throw new CheckoutError("Checkout is not available yet.", 503);
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || !Number.isInteger(parts) || Number(parts) < 1 || Number(parts) > 17) throw new CheckoutError("Invalid artwork upload.");
  const id = randomUUID(), token = randomBytes(32).toString("hex");
  await database().query("insert into rec_artwork_uploads(id,token_hash,content_hash,parts) values($1,$2,$3,$4)", [id,digest(token),hash,parts]);
  return { id, token };
}
export async function uploadArtworkPart(id: unknown, token: unknown, part: unknown, content: unknown) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token) ||
      !Number.isInteger(part) || Number(part) < 0 || Number(part) > 16 || typeof content !== "string" || content.length > 1_000_000) throw new CheckoutError("Invalid artwork part.");
  const result = await database().query(
    "insert into rec_artwork_parts(upload_id,part,content) select id,$3,$4 from rec_artwork_uploads where id=$1 and token_hash=$2 and parts>$3 and created_at>now()-interval '1 hour' on conflict(upload_id,part) do update set content=excluded.content returning part",
    [id,digest(token),part,content],
  );
  if (!result.rows.length) throw new CheckoutError("Artwork upload expired.", 410);
  return { received: true };
}
async function uploadedArtwork(upload: { id: string; token: string }) {
  if (!/^[a-f0-9-]{36}$/.test(upload.id) || !/^[a-f0-9]{64}$/.test(upload.token)) throw new CheckoutError("Invalid artwork upload.");
  const result = await database().query<{ parts: number; content_hash: string; content: string; count: string }>(
    "select u.parts,u.content_hash,string_agg(p.content,'' order by p.part) as content,count(p.part)::text as count from rec_artwork_uploads u join rec_artwork_parts p on p.upload_id=u.id where u.id=$1 and u.token_hash=$2 and u.created_at>now()-interval '1 hour' group by u.id",
    [upload.id,digest(upload.token)],
  );
  const row = result.rows[0];
  if (!row || Number(row.count) !== row.parts || digest(row.content) !== row.content_hash) throw new CheckoutError("Artwork upload is incomplete. Please retry.");
  return row.content;
}
export async function createCheckout(input: unknown, deliveryInput: unknown, upload?: { id: string; token: string }) {
  if (!configured("stripe") && !configured("paypal")) throw new CheckoutError("Online payment is not available yet. Your build is saved.", 503);
  let validated: ReturnType<typeof validateCheckoutDraft>;
  let delivery: Delivery;
  try {
    const payload = upload ? { ...(input as object), artworkDataUrl: await uploadedArtwork(upload) } : input;
    validated = validateCheckoutDraft(payload); delivery = deliverySchema.parse(deliveryInput);
  }
  catch { throw new CheckoutError("Please check your name, email, design, quantity, and product selections."); }
  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const shippingCents = shippingEstimate(validated.draft.orderType, validated.estimate.fulfilled);
  const selectedTaxMode = taxMode();
  let calculation: { id: string | null; amount_total: number; tax_amount_exclusive: number } = {
    id: null, amount_total: validated.amountCents + shippingCents, tax_amount_exclusive: 0,
  };
  if (selectedTaxMode === "automatic") {
    const stripe = stripeClient();
    const [settings, registrations] = await Promise.all([
      stripe.tax.settings.retrieve(), stripe.tax.registrations.list({ status: "active", limit: 1 }),
    ]);
    if (settings.status !== "active" || !registrations.data.length) throw new CheckoutError("Tax setup is not ready. Your build is saved.", 503);
    calculation = await stripe.tax.calculations.create({
    currency: "usd",
    customer_details: { address: delivery.address, address_source: "shipping" },
    line_items: [{ amount: validated.amountCents, reference: id, tax_behavior: "exclusive",
      tax_code: validated.draft.orderType === "hat" ? process.env.CHECKOUT_HAT_TAX_CODE : process.env.CHECKOUT_PATCH_TAX_CODE }],
    shipping_cost: { amount: shippingCents, tax_behavior: "exclusive", tax_code: "txcd_92010001" },
    });
  }
  await database().query(
    "insert into rec_checkout (id,token_hash,draft,amount_cents,subtotal_cents,shipping_cents,tax_cents,tax_calculation_id,delivery,tax_mode) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [id, digest(token), JSON.stringify(validated.draft), calculation.amount_total, validated.amountCents,
      shippingCents, calculation.tax_amount_exclusive, calculation.id, JSON.stringify(delivery), selectedTaxMode],
  );
  return { id, token, amountCents: calculation.amount_total, subtotalCents: validated.amountCents,
    shippingCents, taxCents: calculation.tax_amount_exclusive, taxMode: selectedTaxMode };
}
async function authorized(id: string, token: string): Promise<Checkout> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(token)) throw new CheckoutError("Checkout not found.", 404);
  const result = await database().query<Checkout>("select * from rec_checkout where id=$1 and token_hash=$2", [id, digest(token)]);
  if (!result.rows[0]) throw new CheckoutError("Checkout not found.", 404);
  return result.rows[0];
}
async function reserve(id: string, token: string, provider: Provider) {
  requireProvider(provider);
  const record = await authorized(id, token);
  if (record.status !== "pending") throw new CheckoutError("This checkout is already complete or closed.", 409);
  // Same order can never create payable sessions with two processors.
  const result = await database().query<Checkout>(
    "update rec_checkout set provider=$3 where id=$1 and token_hash=$2 and status='pending' and (provider is null or provider=$3) returning *",
    [id, digest(token), provider],
  );
  if (!result.rows[0]) throw new CheckoutError("Continue with the payment method already selected for this order.", 409);
  return result.rows[0];
}
export async function createStripeSession(id: string, token: string) {
  const record = await reserve(id, token, "stripe");
  const stripe = stripeClient();
  // Fail closed if the deployed key belongs to a different merchant.
  const account = await stripe.accounts.retrieve(process.env.STRIPE_ACCOUNT_ID!);
  if (account.id !== process.env.STRIPE_ACCOUNT_ID) throw new Error("Stripe account mismatch.");
  if (!record.provider_id && Date.now() - new Date(record.created_at).getTime() > 23 * 3600000) {
    throw new CheckoutError("This checkout has expired. Please contact us before retrying.", 409);
  }
  const session = record.provider_id
    ? await stripe.checkout.sessions.retrieve(record.provider_id)
    : await stripe.checkout.sessions.create({
        mode: "payment", ui_mode: "embedded_page",
        integration_identifier: "rec-mama-made-hjkmnpqr",
        client_reference_id: id, metadata: { checkout_id: id },
        customer_email: record.draft.customerEmail,
        return_url: `${origin()}/order?payment_return=1`,
        redirect_on_completion: "if_required",
        payment_intent_data: { shipping: record.delivery, metadata: { checkout_id: id } },
        line_items: [{
          price_data: { currency: "usd", unit_amount: record.amount_cents,
            product_data: { name: record.draft.orderType === "hat" ? "REC Mama Made custom patch hats" : "REC Mama Made custom patches",
              description: `${record.draft.quantity} purchased · includes shipping${record.tax_mode === "not_collected" ? " · sales tax not collected" : " and calculated tax"} · proof before engraving` } },
          quantity: 1,
        }],
      }, { idempotencyKey: `rec-checkout-${id}` });
  if (session.livemode !== isLive()) throw new Error("Stripe mode mismatch.");
  await database().query("update rec_checkout set provider_id=$2 where id=$1 and (provider_id is null or provider_id=$2)", [id, session.id]);
  if (session.status !== "open" || !session.client_secret) throw new CheckoutError("Payment is processing or checkout has expired. Check payment status.", 409);
  return { clientSecret: session.client_secret };
}
async function paypal(path: string, method = "GET", body?: unknown, requestId?: string) {
  const base = isLive() ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const auth = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST", headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(20000),
  });
  if (!auth.ok) throw new Error("Payment provider authentication failed.");
  const { access_token } = await auth.json();
  const response = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error("Payment provider request failed.");
  return result;
}
export async function createPaypalOrder(id: string, token: string) {
  const record = await reserve(id, token, "paypal");
  if (record.provider_id) return { orderId: record.provider_id };
  // PayPal retains request IDs for a limited period. Never recreate an
  // uncertain order after that window; require reconciliation instead.
  if (Date.now() - new Date(record.created_at).getTime() > 5 * 3600000) throw new CheckoutError("This checkout needs a status check before retrying.", 409);
  const order = await paypal("/v2/checkout/orders", "POST", {
    intent: "CAPTURE",
    purchase_units: [{ reference_id: id, custom_id: id, invoice_id: id,
      payee: { merchant_id: process.env.PAYPAL_MERCHANT_ID },
      shipping: { name: { full_name: record.delivery.name }, address: {
        address_line_1: record.delivery.address.line1, address_line_2: record.delivery.address.line2,
        admin_area_2: record.delivery.address.city, admin_area_1: record.delivery.address.state,
        postal_code: record.delivery.address.postal_code, country_code: "US",
      } },
      amount: { currency_code: "USD", value: (record.amount_cents / 100).toFixed(2),
        breakdown: {
          item_total: { currency_code: "USD", value: (record.subtotal_cents / 100).toFixed(2) },
          shipping: { currency_code: "USD", value: (record.shipping_cents / 100).toFixed(2) },
          tax_total: { currency_code: "USD", value: (record.tax_cents / 100).toFixed(2) },
        } },
      description: "REC Mama Made custom order · proof before engraving" }],
    application_context: { brand_name: "REC Mama Made", shipping_preference: "SET_PROVIDED_ADDRESS", user_action: "PAY_NOW" },
  }, id);
  if (!order.id) throw new Error("Payment provider did not return an order.");
  await database().query("update rec_checkout set provider_id=$2 where id=$1 and (provider_id is null or provider_id=$2)", [id, order.id]);
  return { orderId: order.id };
}
export async function capturePaypalOrder(id: string, token: string, orderId: string) {
  requireProvider("paypal");
  const record = await authorized(id, token);
  if (record.provider !== "paypal" || record.provider_id !== orderId) throw new CheckoutError("Payment order does not match.", 409);
  if (record.status === "paid") return { status: "paid" };
  const before = await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  verifyPaypalOrder(record, before);
  if (before.purchase_units?.[0]?.shipping?.address?.country_code !== "US") throw new CheckoutError("Please use a US delivery address.");
  if (before.status !== "COMPLETED") {
    await paypal(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, "POST", {}, `${id}-capture`);
  }
  await reconcilePaypal(record);
  return checkoutStatus(id, token);
}
async function recordPaid(record: Checkout, paymentId: string, shipping: unknown) {
  // Required for standalone tax calculations, including off-Stripe payments.
  // A stable key makes webhook retries and concurrent status checks safe.
  if (record.tax_mode !== "not_collected" && !record.tax_transaction_id) {
    if (!record.tax_calculation_id) throw new Error("Missing saved tax calculation.");
    const transaction = await stripeClient().tax.transactions.createFromCalculation({
      calculation: record.tax_calculation_id, reference: record.id,
    }, { idempotencyKey: `rec-tax-${record.id}` });
    await database().query("update rec_checkout set tax_transaction_id=$2 where id=$1", [record.id, transaction.id]);
  }
  await database().query(
    "update rec_checkout set status='paid', payment_id=$2, shipping=$3, paid_at=coalesce(paid_at,now()) where id=$1 and status<>'paid'",
    [record.id, paymentId, JSON.stringify(shipping ?? null)],
  );
  // Only enqueue the existing proof requirement. Payment never approves artwork
  // or authorizes engraving; the immutable draft remains available to the shop.
}
async function reconcileStripe(record: Checkout, supplied?: Stripe.Checkout.Session) {
  const session = supplied ?? await stripeClient().checkout.sessions.retrieve(record.provider_id!);
  if (session.id !== record.provider_id || session.client_reference_id !== record.id ||
      session.metadata?.checkout_id !== record.id || session.amount_total !== record.amount_cents ||
      session.currency !== "usd" || session.livemode !== isLive()) throw new Error("Payment verification mismatch.");
  if (session.payment_status === "paid") {
    await recordPaid(record, String(typeof session.payment_intent === "object" ? session.payment_intent?.id : session.payment_intent),
      record.delivery);
  } else if (session.status === "expired") {
    await database().query("update rec_checkout set status='expired' where id=$1 and status='pending'", [record.id]);
  }
}
function verifyPaypalOrder(record: Checkout, order: any) {
  const unit = order.purchase_units?.[0];
  if (order.id !== record.provider_id || order.purchase_units?.length !== 1 || unit.custom_id !== record.id ||
      unit.payee?.merchant_id !== process.env.PAYPAL_MERCHANT_ID ||
      unit.amount?.currency_code !== "USD" || Math.round(Number(unit.amount?.value) * 100) !== record.amount_cents) throw new Error("Payment verification mismatch.");
  const address = unit.shipping?.address;
  const expected = record.delivery.address;
  if (!address || address.country_code !== "US" ||
      address.address_line_1 !== expected.line1 || (address.address_line_2 ?? "") !== (expected.line2 ?? "") ||
      address.admin_area_2 !== expected.city || address.admin_area_1 !== expected.state ||
      address.postal_code !== expected.postal_code) throw new Error("Delivery address verification mismatch.");
  return unit;
}
async function reconcilePaypal(record: Checkout) {
  const order = await paypal(`/v2/checkout/orders/${encodeURIComponent(record.provider_id!)}`);
  const unit = verifyPaypalOrder(record, order);
  const capture = unit.payments?.captures?.find((c: { status: string }) => c.status === "COMPLETED");
  if (order.status === "COMPLETED" && capture && capture.amount.currency_code === "USD" &&
      Math.round(Number(capture.amount.value) * 100) === record.amount_cents) await recordPaid(record, capture.id, unit.shipping);
}
export async function checkoutStatus(id: string, token: string) {
  let record = await authorized(id, token);
  if (record.provider_id && record.status === "pending") {
    if (record.provider === "stripe") await reconcileStripe(record);
    else if (record.provider === "paypal") await reconcilePaypal(record);
    record = await authorized(id, token);
  }
  return { id: record.id, status: record.status, provider: record.provider, amountCents: record.amount_cents };
}
export async function stripeWebhook(request: Request) {
  requireProvider("stripe");
  const signature = request.headers.get("stripe-signature");
  if (!signature) throw new CheckoutError("Missing signature.");
  let event: Stripe.Event;
  try { event = stripeClient().webhooks.constructEvent(await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { throw new CheckoutError("Invalid signature."); }
  if (event.livemode !== isLive()) throw new CheckoutError("Incorrect payment environment.");
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
    const session = event.data.object as Stripe.Checkout.Session;
    const result = await database().query<Checkout>("select * from rec_checkout where id=$1 and provider='stripe'", [session.client_reference_id]);
    const record = result.rows[0];
    if (!record) return;
    // A signed event can arrive before the create-session request saves its ID.
    await database().query("update rec_checkout set provider_id=$2 where id=$1 and provider_id is null", [record.id, session.id]);
    record.provider_id ??= session.id;
    await reconcileStripe(record, session);
    if (event.type === "checkout.session.async_payment_failed") await database().query("update rec_checkout set status='failed' where id=$1 and status='pending'", [record.id]);
    await database().query("insert into rec_payment_events(provider,event_id,checkout_id) values('stripe',$1,$2) on conflict do nothing", [event.id, record.id]);
  }
}
export async function paypalWebhook(request: Request) {
  requireProvider("paypal");
  const event = await request.json();
  const verification = await paypal("/v1/notifications/verify-webhook-signature", "POST", {
    auth_algo: request.headers.get("paypal-auth-algo"), cert_url: request.headers.get("paypal-cert-url"),
    transmission_id: request.headers.get("paypal-transmission-id"), transmission_sig: request.headers.get("paypal-transmission-sig"),
    transmission_time: request.headers.get("paypal-transmission-time"), webhook_id: process.env.PAYPAL_WEBHOOK_ID, webhook_event: event,
  });
  if (verification.verification_status !== "SUCCESS") throw new CheckoutError("Invalid signature.");
  if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
    const providerId = event.resource?.supplementary_data?.related_ids?.order_id;
    const result = await database().query<Checkout>("select * from rec_checkout where provider='paypal' and provider_id=$1", [providerId]);
    if (result.rows[0]) {
      await reconcilePaypal(result.rows[0]);
      await database().query("insert into rec_payment_events(provider,event_id,checkout_id) values('paypal',$1,$2) on conflict do nothing", [event.id, result.rows[0].id]);
    }
  }
}
