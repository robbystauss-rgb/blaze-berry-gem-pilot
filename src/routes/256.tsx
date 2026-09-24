import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/catalog-page";

export const Route = createFileRoute("/256")({ component: Page });

function Page() {
  return <CatalogPage family="256" />;
}
