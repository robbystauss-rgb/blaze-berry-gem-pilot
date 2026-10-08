import Stripe from "stripe";
export function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Stripe is not configured.");
  if (process.env.NODE_ENV !== "production" && !/^(sk|rk)_test_/.test(secret))
    throw new Error("Development accepts Stripe test credentials only.");
  return new Stripe(secret);
}
export function paypalBase() {
  if (process.env.NODE_ENV !== "production" && process.env.PAYPAL_ENVIRONMENT === "live")
    throw new Error("Development accepts PayPal sandbox only.");
  return process.env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}
export async function paypalToken() {
  const id = process.env.PAYPAL_CLIENT_ID,
    secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured.");
  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload = (await response.json()) as { access_token?: string };
  if (!response.ok || !payload.access_token) throw new Error("PayPal authentication failed.");
  return payload.access_token;
}
