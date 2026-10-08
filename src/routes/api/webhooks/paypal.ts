import { createFileRoute } from "@tanstack/react-router";
import { paypalWebhook } from "@/lib/commerce/webhooks.server";
export const Route = createFileRoute("/api/webhooks/paypal")({
  server: { handlers: { POST: ({ request }) => paypalWebhook(request) } },
});
