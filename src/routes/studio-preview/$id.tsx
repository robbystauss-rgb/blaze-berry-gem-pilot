import { createFileRoute } from "@tanstack/react-router";
import { CustomerDocument } from "@/components/studio/customer-document";
export const Route = createFileRoute("/studio-preview/$id")({
  head: () => ({
    meta: [
      { title: "Owner document preview · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: function StudioPreviewPage() {
    const { id } = Route.useParams();
    return <CustomerDocument previewId={id} />;
  },
});
