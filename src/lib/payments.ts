import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  FAMILIES,
  LEATHERETTES,
  PATCH_SHAPES,
  PLACEMENTS,
  colorsForFamily,
  estimateTotal,
  getLeatherette,
  type FamilyId,
  type OrderType,
  type PatchShape,
  type PatchSize,
  type Placement,
} from "@/lib/catalog";

export const MANUAL_VENMO_URL = "https://venmo.com/u/Stauss_Distributing_LLC";

export type PaymentBuild = {
  customerName: string;
  customerEmail: string;
  orderType: OrderType;
  family: FamilyId;
  colorway: string;
  leatherette: string;
  patchShape: PatchShape;
  patchSize: PatchSize;
  placement: Placement;
  quantity: number;
  patchText: string;
  hasArtwork: boolean;
  notes: string;
  promo: string;
};

type Quote = {
  build: PaymentBuild;
  family: FamilyId;
  lineName: string;
  description: string;
  unit: number;
  purchased: number;
  bonus: number;
  fulfilled: number;
  total: number;
};

function requireEmail(value: string) {
  const email = value.trim().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email before checkout.");
  return email;
}

function normalizeBuild(input: PaymentBuild): Quote {
  const customerName = String(input.customerName ?? "").trim().slice(0, 120);
  if (!customerName) throw new Error("Add your name before checkout.");
  const customerEmail = requireEmail(String(input.customerEmail ?? ""));
  const orderType: OrderType = input.orderType === "patch" ? "patch" : "hat";
  const family = String(input.family ?? "") as FamilyId;
  if (!(family in FAMILIES)) throw new Error("Choose a valid hat family.");
  const familyInfo = FAMILIES[family];
  const colorway = String(input.colorway ?? "").trim().slice(0, 160);
  if (orderType === "hat" && !colorsForFamily(family).includes(colorway)) throw new Error("Choose a verified hat color before checkout.");
  const leatherette = String(input.leatherette ?? "");
  if (!LEATHERETTES.some((item) => item.id === leatherette)) throw new Error("Choose a valid leatherette material.");
  const patchShape = input.patchShape;
  if (!PATCH_SHAPES.includes(patchShape)) throw new Error("Choose a valid patch shape.");
  const patchSize = input.patchSize;
  if (!(["small", "medium", "large"] as const).includes(patchSize)) throw new Error("Choose a valid patch size.");
  const placement = input.placement;
  if (!PLACEMENTS.some((item) => item.id === placement)) throw new Error("Choose a valid patch placement.");
  if (orderType === "hat" && patchSize === "large" && (placement === "side" || placement === "rear")) {
    throw new Error("This patch size is too large for the selected position.");
  }
  const quantity = Math.max(1, Math.min(250, Math.floor(Number(input.quantity) || 1)));
  const patchText = String(input.patchText ?? "").trim().slice(0, 240);
  const hasArtwork = Boolean(input.hasArtwork);
  if (!patchText && !hasArtwork) throw new Error("Add a design before checkout.");
  const notes = String(input.notes ?? "").trim().slice(0, 500);
  const promo = String(input.promo ?? "").trim().slice(0, 40);
  const est = estimateTotal({ orderType, tier: familyInfo.tier, quantity, family, promo });
  const leather = getLeatherette(leatherette);
  const lineName = orderType === "patch" ? "REC Mama Made custom leatherette patch" : `REC Mama Made ${family} ${familyInfo.label} custom patch hat`;
  const design = patchText || "Uploaded artwork";
  const description = [
    orderType === "hat" ? colorway : "Loose patch",
    leather.name,
    patchShape,
    patchSize,
    orderType === "hat" ? PLACEMENTS.find((item) => item.id === placement)?.label : undefined,
    design,
    est.bonus ? `${est.bonus} bonus hat${est.bonus === 1 ? "" : "s"}` : undefined,
  ].filter(Boolean).join(" · ").slice(0, 480);

  return {
    build: { customerName, customerEmail, orderType, family, colorway, leatherette, patchShape, patchSize, placement, quantity, patchText, hasArtwork, notes, promo },
    family,
    lineName,
    description,
    unit: est.unit,
    purchased: est.purchased,
    bonus: est.bonus,
    fulfilled: est.fulfilled,
    total: est.total,
  };
}

function requestOrigin() {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return process.env.PAYMENT_SITE_URL?.trim() || "https://recmamamade.com";
  }
}

function paypalEnvironment() {
  return process.env.PAYPAL_ENVIRONMENT?.toLowerCase() === "live" ? "live" : "sandbox";
}

function paypalApiBase() {
  return paypalEnvironment() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function paypalCredentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const secret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new Error("PayPal checkout is not configured yet.");
  return { clientId, secret };
}

async function paypalAccessToken() {
  const { clientId, secret } = paypalCredentials();
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const payload = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error("PayPal could not start checkout. Please try again.");
  return payload.access_token;
}

async function captureSignature(orderId: string, amount: string) {
  const { secret } = paypalCredentials();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${orderId}|${amount}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validCaptureToken(orderId: string, token: string) {
  const separator = token.indexOf(":");
  if (separator <= 0) return null;
  const amount = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  const expected = await captureSignature(orderId, amount);
  if (supplied.length !== expected.length) return null;
  let mismatch = 0;
  for (let index = 0; index < supplied.length; index += 1) mismatch |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0 ? amount : null;
}

function appendStripeMetadata(form: URLSearchParams, quote: Quote) {
  const pairs: Record<string, string> = {
    order_type: quote.build.orderType,
    family: quote.build.orderType === "hat" ? quote.family : "patch-only",
    color: quote.build.orderType === "hat" ? quote.build.colorway : "",
    material: quote.build.leatherette,
    shape: quote.build.patchShape,
    size: quote.build.patchSize,
    placement: quote.build.orderType === "hat" ? quote.build.placement : "loose-patch",
    purchased_quantity: String(quote.purchased),
    fulfilled_quantity: String(quote.fulfilled),
    promo: quote.build.promo,
    customer_name: quote.build.customerName,
    design: quote.build.patchText || "uploaded-artwork",
  };
  Object.entries(pairs).forEach(([key, value]) => form.set(`metadata[${key}]`, value.slice(0, 490)));
}

export const getPaymentConfig = createServerFn({ method: "GET" }).handler(async () => ({
  stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
  paypalConfigured: Boolean(process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim()),
  paypalEnvironment: paypalEnvironment() as "sandbox" | "live",
}));

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .validator((data: PaymentBuild) => data)
  .handler(async ({ data }) => {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) throw new Error("Card checkout is not configured yet.");
    const quote = normalizeBuild(data);
    const origin = requestOrigin();
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("success_url", `${origin}/order?payment=stripe-success&session_id={CHECKOUT_SESSION_ID}`);
    form.set("cancel_url", `${origin}/order?payment=stripe-canceled`);
    form.set("customer_email", quote.build.customerEmail);
    form.set("line_items[0][price_data][currency]", "usd");
    form.set("line_items[0][price_data][product_data][name]", quote.lineName);
    form.set("line_items[0][price_data][product_data][description]", quote.description);
    form.set("line_items[0][price_data][unit_amount]", String(Math.round(quote.unit * 100)));
    form.set("line_items[0][quantity]", String(quote.purchased));
    appendStripeMetadata(form, quote);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const payload = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !payload.id || !payload.url) throw new Error(payload.error?.message || "Card checkout could not start. Please try again.");
    return { id: payload.id, url: payload.url };
  });

export const getStripeCheckoutStatus = createServerFn({ method: "GET" })
  .validator((sessionId: string) => sessionId)
  .handler(async ({ data: sessionId }) => {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) throw new Error("Card checkout is not configured yet.");
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) throw new Error("Invalid checkout session.");
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const payload = (await response.json()) as {
      id?: string;
      status?: string;
      payment_status?: string;
      amount_total?: number;
      customer_details?: { email?: string };
      error?: { message?: string };
    };
    if (!response.ok || !payload.id) throw new Error(payload.error?.message || "Could not verify payment status.");
    return {
      id: payload.id,
      status: payload.status ?? "unknown",
      paymentStatus: payload.payment_status ?? "unknown",
      amountTotal: typeof payload.amount_total === "number" ? payload.amount_total : null,
      email: payload.customer_details?.email ?? null,
    };
  });

export const getPayPalBrowserToken = createServerFn({ method: "GET" }).handler(async () => {
  const { clientId, secret } = paypalCredentials();
  const origin = requestOrigin();
  const response = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      response_type: "client_token",
      "domains[]": origin,
    }),
  });
  const payload = (await response.json()) as { access_token?: string };
  if (!response.ok || !payload.access_token) throw new Error("PayPal checkout could not initialize. Please try again.");
  return { clientToken: payload.access_token, environment: paypalEnvironment() as "sandbox" | "live" };
});

export const createPayPalOrder = createServerFn({ method: "POST" })
  .validator((data: PaymentBuild) => data)
  .handler(async ({ data }) => {
    const quote = normalizeBuild(data);
    const accessToken = await paypalAccessToken();
    const amount = quote.total.toFixed(2);
    const response = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: "REC-MAMA-MADE",
            description: quote.description,
            custom_id: `${quote.build.orderType}:${quote.family}:${quote.purchased}`.slice(0, 120),
            amount: { currency_code: "USD", value: amount },
          },
        ],
      }),
    });
    const payload = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !payload.id) throw new Error(payload.message || "PayPal checkout could not start. Please try again.");
    const signature = await captureSignature(payload.id, amount);
    return { orderId: payload.id, captureToken: `${amount}:${signature}` };
  });

export const capturePayPalOrder = createServerFn({ method: "POST" })
  .validator((data: { orderId: string; captureToken: string }) => data)
  .handler(async ({ data }) => {
    if (!/^[A-Z0-9]+$/i.test(data.orderId)) throw new Error("Invalid PayPal order.");
    const expectedAmount = await validCaptureToken(data.orderId, data.captureToken);
    if (!expectedAmount) throw new Error("This PayPal order could not be verified.");
    const accessToken = await paypalAccessToken();
    const response = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(data.orderId)}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const payload = (await response.json()) as {
      id?: string;
      status?: string;
      message?: string;
      purchase_units?: Array<{ payments?: { captures?: Array<{ status?: string; amount?: { currency_code?: string; value?: string } }> } }>;
    };
    const capture = payload.purchase_units?.[0]?.payments?.captures?.[0];
    const capturedAmount = capture?.amount?.value;
    const completed = response.ok && payload.status === "COMPLETED" && capture?.status === "COMPLETED" && capturedAmount === expectedAmount;
    if (!completed) throw new Error(payload.message || "PayPal payment was not completed. Please try again.");
    return { orderId: payload.id ?? data.orderId, status: "COMPLETED" as const, amount: capturedAmount };
  });
