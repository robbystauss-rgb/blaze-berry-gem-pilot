import { z } from "zod";
import { FAMILIES, LEATHERETTES, PATCH_SHAPES, PLACEMENTS, colorsForFamily, estimateTotal, type FamilyId } from "./catalog";
import type { OrderDraft } from "./order-store";

export const deliverySchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).default(""),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
    postal_code: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
    country: z.literal("US"),
  }),
});
export type Delivery = z.infer<typeof deliverySchema>;

const draftSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.email().max(254),
  orderType: z.enum(["hat", "patch"]),
  family: z.string().refine((id) => Object.hasOwn(FAMILIES, id)),
  colorway: z.string().max(150),
  tier: z.enum(["standard", "premium"]),
  patchShape: z.string().refine((shape) => PATCH_SHAPES.includes(shape as OrderDraft["patchShape"])),
  patchSize: z.enum(["small", "medium", "large"]),
  placement: z.string().refine((id) => PLACEMENTS.some((p) => p.id === id)),
  leatherette: z.string().refine((id) => LEATHERETTES.some((m) => m.id === id)),
  quantity: z.number().int().min(1).max(10000),
  patchText: z.string().max(2000),
  artworkDataUrl: z.string().max(17_000_000).refine((v) => !v || /^data:(image\/(jpeg|png|webp|gif|svg\+xml)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(v)),
  notes: z.string().max(5000),
  promo: z.string().max(100),
});

/** Reuse the existing catalog and pricing function; never trust a browser total or tier. */
export function validateCheckoutDraft(input: unknown) {
  const draft = draftSchema.parse(input) as OrderDraft;
  const family = FAMILIES[draft.family as FamilyId];
  if (draft.orderType === "hat" && !colorsForFamily(draft.family).includes(draft.colorway)) {
    throw new Error("Choose an available hat and color.");
  }
  if (!draft.patchText.trim() && !draft.artworkDataUrl) throw new Error("Add your design before paying.");
  if (draft.orderType === "hat" && draft.patchSize === "large" && ["side", "rear"].includes(draft.placement)) {
    throw new Error("A large patch does not fit this placement.");
  }
  draft.tier = family.tier;
  const estimate = estimateTotal({ ...draft, tier: family.tier });
  return { draft, estimate, amountCents: Math.round(estimate.total * 100) };
}
