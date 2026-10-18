import { createFileRoute } from "@tanstack/react-router";
import { CustomerDocument } from "@/components/studio/customer-document";
export const Route = createFileRoute("/invoice/$token")({
  head: () => ({
    meta: [
      { title: "Private invoice · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: function InvoicePage() {
    const { token } = Route.useParams();
    return <CustomerDocument token={token} kind="invoice" />;
  },
});
