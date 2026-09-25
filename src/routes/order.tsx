import { createFileRoute } from "@tanstack/react-router";
import { Builder } from "@/components/build/builder";
import { FAMILIES, type FamilyId } from "@/lib/catalog";

type Search = { family?: string; color?: string; type?: "hat" | "patch" };

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    family: typeof search.family === "string" || typeof search.family === "number" ? String(search.family) : undefined,
    color: typeof search.color === "string" ? search.color : undefined,
    type: search.type === "patch" || search.type === "hat" ? search.type : undefined,
  }),
  component: OrderPage,
});

function isFamily(value: string): value is FamilyId {
  return value in FAMILIES;
}

function OrderPage() {
  const search = Route.useSearch();
  const initialFamily = search.family && isFamily(search.family) ? search.family : undefined;
  return (
    <Builder
      initialOrderType={search.type}
      initialFamily={initialFamily}
      initialColor={search.color}
      focus={search.color ? "material" : initialFamily ? "color" : undefined}
    />
  );
}
