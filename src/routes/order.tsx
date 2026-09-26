import { createFileRoute } from "@tanstack/react-router";
import { Builder } from "@/components/build/builder";
import { FAMILIES, colorsForFamily, type FamilyId } from "@/lib/catalog";
import { MASTER } from "@/lib/studio-store";

type Search = {
  family?: string;
  color?: string;
  type?: "hat" | "patch";
  payment?: "stripe-success" | "stripe-canceled";
  session_id?: string;
};

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    family: typeof search.family === "string" || typeof search.family === "number" ? String(search.family) : undefined,
    color: typeof search.color === "string" ? search.color : undefined,
    type: search.type === "patch" || search.type === "hat" ? search.type : undefined,
    payment: search.payment === "stripe-success" || search.payment === "stripe-canceled" ? search.payment : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: OrderPage,
});

function isReadyFamily(value: string): value is FamilyId {
  return value in FAMILIES && MASTER.models.some((model) => model.id === value && model.bucket === "ready");
}

function OrderPage() {
  const search = Route.useSearch();
  const patchOnly = search.type === "patch";
  const initialFamily = !patchOnly && search.family && isReadyFamily(search.family) ? search.family : undefined;
  const colorFamily: FamilyId = initialFamily ?? "112";
  const initialColor =
    !patchOnly && search.color && colorsForFamily(colorFamily).includes(search.color) ? search.color : undefined;

  return (
    <Builder
      initialOrderType={search.type}
      initialFamily={initialFamily}
      initialColor={initialColor}
      paymentState={search.payment}
      stripeSessionId={search.session_id}
      focus={search.payment ? "review" : initialColor ? "material" : initialFamily ? "color" : undefined}
    />
  );
}
