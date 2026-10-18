import { createFileRoute } from "@tanstack/react-router";
import { CustomerDocument } from "@/components/studio/customer-document";
export const Route = createFileRoute("/design-proof/$token")({
  head: () => ({
    meta: [
      { title: "Private design proof · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: function ProofPage() {
    const { token } = Route.useParams();
    return <CustomerDocument token={token} kind="proof" />;
  },
});
