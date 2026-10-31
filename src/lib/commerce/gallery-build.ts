import { z } from "zod";
import { MASTER } from "@/lib/studio-store";
import { LEATHERETTES, PATCH_SHAPES } from "@/lib/catalog";
export const galleryBuildSchema = z.object({
  variantId: z.string().min(1).max(180),
  material: z.string().min(1).max(80),
  shape: z.string().min(1).max(50),
  size: z.enum(["small", "medium", "large"]),
});
export type GalleryBuild = z.infer<typeof galleryBuildSchema>;
/** Public examples contain product choices only, never a source-art capability. */
export function gallerySelection(family: string, input: GalleryBuild) {
  const model = MASTER.models.find(
      (model) => model.id === family && model.id !== "112PM" && model.bucket === "ready",
    ),
    color = model?.colorways.find((color) => color.id === input.variantId);
  if (
    !model ||
    !color ||
    !LEATHERETTES.some((material) => material.id === input.material) ||
    !PATCH_SHAPES.includes(input.shape as (typeof PATCH_SHAPES)[number])
  )
    throw Error(
      "This exact example configuration is unavailable. Request a quote to review alternatives.",
    );
  return {
    orderType: "hat" as const,
    family: model.id,
    colorway: color.officialName,
    leatherette: input.material,
    patchShape: input.shape as (typeof PATCH_SHAPES)[number],
    patchSize: input.size,
    quantity: 1,
  };
}
