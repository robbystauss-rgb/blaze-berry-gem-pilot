import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/catalog-page";

export const Route = createFileRoute("/168")({ component: Page });

function Page() {
  return <CatalogPage family="168" />;
}
