import { createFileRoute } from "@tanstack/react-router";
import { stripeWebhook } from "@/lib/commerce/webhooks.server";
export const Route = createFileRoute("/api/webhooks/stripe")({
  server: { handlers: { POST: ({ request }) => stripeWebhook(request) } },
});
