import { galleryBuildSchema, gallerySelection } from "@/lib/commerce/gallery-build";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { isRetiredHatModel } from "@/lib/catalog-lifecycle";
import { Builder } from "@/components/build/builder";
import { FAMILIES, colorsForFamily, type FamilyId } from "@/lib/catalog";
import { MASTER } from "@/lib/studio-store";

type Search = {
  family?: string;
  variant?: string;
  material?: string;
  shape?: string;
  size?: "small" | "medium" | "large";
  source?: "gallery";
  color?: string;
  type?: "hat" | "patch";
  payment?: "stripe-success" | "stripe-canceled";
  session_id?: string;
};

export const Route = createFileRoute("/order")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    family:
      typeof search.family === "string" || typeof search.family === "number"
        ? String(search.family)
        : undefined,
    variant: typeof search.variant === "string" ? search.variant.slice(0, 180) : undefined,
    material: typeof search.material === "string" ? search.material.slice(0, 80) : undefined,
    shape: typeof search.shape === "string" ? search.shape.slice(0, 50) : undefined,
    size: ["small", "medium", "large"].includes(String(search.size))
      ? (search.size as "small" | "medium" | "large")
      : undefined,
    source: search.source === "gallery" ? "gallery" : undefined,
    color: typeof search.color === "string" ? search.color : undefined,
    type: search.type === "patch" || search.type === "hat" ? search.type : undefined,
    payment:
      search.payment === "stripe-success" || search.payment === "stripe-canceled"
        ? search.payment
        : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.source === "gallery") {
      try {
        gallerySelection(
          search.family ?? "",
          galleryBuildSchema.parse({
            variantId: search.variant,
            material: search.material,
            shape: search.shape,
            size: search.size,
          }),
        );
      } catch {
        throw redirect({ to: "/actual-work", statusCode: 302 });
      }
    }
    if (search.type !== "patch" && isRetiredHatModel(search.family))
      throw redirect({ to: "/hats", statusCode: 302 });
  },
  component: OrderPage,
});

function isReadyFamily(value: string): value is FamilyId {
  return (
    value in FAMILIES &&
    MASTER.models.some((model) => model.id === value && model.bucket === "ready")
  );
}

function OrderPage() {
  const search = Route.useSearch();
  const patchOnly = search.type === "patch";
  const initialFamily =
    !patchOnly && search.family && isReadyFamily(search.family) ? search.family : undefined;
  const colorFamily: FamilyId = initialFamily ?? "112";
  const example =
    search.source === "gallery"
      ? gallerySelection(
          search.family!,
          galleryBuildSchema.parse({
            variantId: search.variant,
            material: search.material,
            shape: search.shape,
            size: search.size,
          }),
        )
      : null;
  const initialColor =
    example?.colorway ??
    (!patchOnly && search.color && colorsForFamily(colorFamily).includes(search.color)
      ? search.color
      : undefined);

  return (
    <Builder
      initialOrderType={search.type}
      initialFamily={initialFamily}
      initialColor={initialColor}
      initialMaterial={example?.leatherette}
      initialShape={example?.patchShape}
      initialSize={example?.patchSize}
      fromExample={!!example}
      paymentState={search.payment}
      stripeSessionId={search.session_id}
      focus={
        search.payment ? "review" : initialColor ? "material" : initialFamily ? "color" : undefined
      }
    />
  );
}
