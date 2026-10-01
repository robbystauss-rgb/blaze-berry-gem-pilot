import { createFileRoute } from "@tanstack/react-router";
import { PolicyPage } from "@/components/legal/policy-page";

export const Route = createFileRoute("/legal/$policy")({
  component: LegalPolicyRoute,
});

function LegalPolicyRoute() {
  const { policy } = Route.useParams();
  return <PolicyPage slug={policy} />;
}
