import { createFileRoute } from "@tanstack/react-router";
import { orderEmailCron } from "@/lib/commerce/order-email.server";
export const Route = createFileRoute("/api/notifications/order-email")({
  server: { handlers: { GET: ({ request }) => orderEmailCron(request) } },
});
