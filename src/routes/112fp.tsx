import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/catalog-page";

export const Route = createFileRoute("/112fp")({ component: () => <CatalogPage family="112FP" /> });
