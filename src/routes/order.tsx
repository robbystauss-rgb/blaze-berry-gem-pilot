import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Builder } from "@/components/build/builder";
import { FAMILIES, type FamilyId } from "@/lib/catalog";
import { useOrder } from "@/lib/order-store";

type Search = { family?: string; color?: string; type?: "hat" | "patch" };

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    family: typeof search.family === "string" ? search.family : undefined,
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
  useEffect(() => {
    if (search.family && isFamily(search.family)) {
      useOrder.getState().setFamily(search.family);
      useOrder.getState().set("orderType", "hat");
    }
    if (search.type === "patch") useOrder.getState().set("orderType", "patch");
    if (search.type === "hat") useOrder.getState().set("orderType", "hat");
    if (search.color) useOrder.getState().set("colorway", search.color);
  }, [search.family, search.color, search.type]);
  return <Builder focus={search.color ? "material" : search.family ? "color" : undefined} />;
}
