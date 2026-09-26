import { createFileRoute } from "@tanstack/react-router";
import {
  CheckoutError, checkoutConfig, checkoutStatus, createCheckout, createPaypalOrder,
  createStripeSession, capturePaypalOrder, requireSameOrigin, stripeWebhook, paypalWebhook,
  rateLimit, startArtworkUpload, uploadArtworkPart,
} from "@/lib/checkout.server";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
async function limitedRequest(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new CheckoutError("Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3_200_000) { await reader.cancel(); throw new CheckoutError("Artwork is too large.", 413); }
    chunks.push(value);
  }
  return new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) });
}
export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      GET: () => json(checkoutConfig()),
      POST: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const action = url.searchParams.get("action");
          const bounded = await limitedRequest(request);
          if (action === "stripe-webhook") { await stripeWebhook(bounded); return json({ received: true }); }
          if (action === "paypal-webhook") { await paypalWebhook(bounded); return json({ received: true }); }
          requireSameOrigin(request);
          await rateLimit(request);
          const body = await bounded.json();
          if (action === "artwork-start") return json(await startArtworkUpload(body.hash, body.parts));
          if (action === "artwork-part") return json(await uploadArtworkPart(body.id, body.token, body.part, body.content));
          if (action === "create") return json(await createCheckout(body.draft, body.delivery, body.upload));
          if (typeof body.id !== "string" || typeof body.token !== "string") throw new CheckoutError("Checkout not found.", 404);
          if (action === "status") return json(await checkoutStatus(body.id, body.token));
          if (action === "stripe") return json(await createStripeSession(body.id, body.token));
          if (action === "paypal") return json(await createPaypalOrder(body.id, body.token));
          if (action === "capture" && typeof body.orderId === "string") return json(await capturePaypalOrder(body.id, body.token, body.orderId));
          throw new CheckoutError("Unknown checkout action.");
        } catch (error) {
          if (error instanceof CheckoutError) return json({ error: error.message }, error.status);
          if (error instanceof SyntaxError) return json({ error: "Invalid request." }, 400);
          // Never leak provider payloads, customer data or configuration values.
          console.error("[checkout] Request failed", error instanceof Error ? error.name : "UnknownError");
          return json({ error: "We could not verify this payment. Your build is saved. Check payment status before trying again." }, 503);
        }
      },
    },
  },
});
