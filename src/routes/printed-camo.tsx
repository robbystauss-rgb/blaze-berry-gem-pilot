import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/catalog-page";

export const Route = createFileRoute("/printed-camo")({ component: Page });

function Page() {
  return <CatalogPage family="printed" />;
}
