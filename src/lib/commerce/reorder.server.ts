import { z } from "zod";
import { getSql } from "@/lib/db";
import { FAMILIES, LEATHERETTES, PATCH_SHAPES, PLACEMENTS, colorsForFamily } from "@/lib/catalog";
import { MASTER } from "@/lib/studio-store";
import { physicalPatch } from "@/lib/patch-physical";
import { quoteSelection } from "./pricing.server";
import type { ReorderIntent, ReorderLine, ReorderSettings } from "./reorder-types";

const selectionSchema = z.object({
  orderType: z.enum(["hat", "patch"]),
  family: z.string(),
  colorway: z.string().max(160),
  leatherette: z.string().max(80),
  patchShape: z.string().max(40),
  patchSize: z.enum(["small", "medium", "large"]),
  placement: z.string().max(40),
  patchText: z.string().max(2000).default(""),
});
const denied = () => Error("This order item is not available in your authenticated account.");

export async function ownReorderLines(userId: string, orderId: string): Promise<ReorderLine[]> {
  if (!userId) throw denied();
  const sql = await getSql();
  const own =
    await sql`select id from commerce_orders where id=${orderId} and customer_user_id=${userId}`;
  if (!own.length) throw denied();
  const rows = await sql<{
    id: string;
    title: string;
    quantity: number;
    order_type: string | null;
  }>`select i.id,i.title,i.quantity,i.specifications->>'orderType' as order_type from commerce_order_items i join commerce_orders o on o.id=i.order_id where o.id=${orderId} and o.customer_user_id=${userId} order by i.id limit 100`;
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    quantity: row.quantity,
    supported: row.order_type === "hat" || row.order_type === "patch",
  }));
}

export async function prepareReorder(userId: string, itemId: string): Promise<ReorderIntent> {
  if (!userId) throw denied();
  const sql = await getSql();
  const [item] = await sql<{
    quantity: number;
    specifications: Record<string, unknown>;
    has_artwork: boolean;
  }>`select i.quantity,i.specifications,(i.artwork is not null) as has_artwork from commerce_order_items i join commerce_orders o on o.id=i.order_id where i.id=${itemId} and o.customer_user_id=${userId}`;
  if (!item) throw denied();
  const parsed = selectionSchema.safeParse(item.specifications);
  if (!parsed.success)
    throw Error(
      "This older or quoted item cannot be restored automatically. Contact the shop with your order number.",
    );
  const old = parsed.data;
  const family = old.family as keyof typeof FAMILIES;
  if (
    !Object.hasOwn(FAMILIES, family) ||
    !MASTER.models.some((model) => model.id === family && model.bucket === "ready")
  )
    throw Error(
      "That exact Richardson model is no longer available in the builder. Contact the shop; another model will not be substituted.",
    );
  if (old.orderType === "hat" && !colorsForFamily(family).includes(old.colorway))
    throw Error(
      "That exact hat color is no longer available for this model. Contact the shop to review alternatives.",
    );
  if (
    !LEATHERETTES.some((material) => material.id === old.leatherette) ||
    !PATCH_SHAPES.includes(old.patchShape as (typeof PATCH_SHAPES)[number]) ||
    !PLACEMENTS.some((placement) => placement.id === old.placement)
  )
    throw Error(
      "A previous patch material, shape or placement is no longer offered. Contact the shop before repeating this item.",
    );
  if (old.patchSize === "large" && (old.placement === "side" || old.placement === "rear"))
    throw Error(
      "The previous patch size and placement need a new production proof. Contact the shop.",
    );
  const quantity = z.number().int().min(1).max(250).safeParse(item.quantity);
  if (!quantity.success) throw Error("This quantity requires a new bulk quote from the shop.");
  const current = physicalPatch(old.patchShape, old.patchSize);
  const preview = item.specifications.preview as
    { physicalInches?: { width?: number; height?: number } } | undefined;
  if (
    preview?.physicalInches &&
    (Math.abs(Number(preview.physicalInches.width) - current.width) > 1e-6 ||
      Math.abs(Number(preview.physicalInches.height) - current.height) > 1e-6 ||
      !Number.isFinite(preview.physicalInches.width) ||
      !Number.isFinite(preview.physicalInches.height))
  )
    throw Error(
      "The previous physical patch dimensions are not offered by the current size selector. Request a new quote to preserve those dimensions.",
    );
  const placement = item.specifications.previewPlacement as { position?: unknown } | undefined;
  const position = z
    .object({
      version: z.literal(2),
      anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    })
    .safeParse(placement?.position);
  const settings: ReorderSettings = {
    orderType: old.orderType,
    family,
    colorway: old.colorway,
    leatherette: old.leatherette,
    patchShape: old.patchShape as ReorderSettings["patchShape"],
    patchSize: old.patchSize,
    placement: old.placement as ReorderSettings["placement"],
    quantity: quantity.data,
    patchText: item.has_artwork ? "" : old.patchText,
    ...(position.success ? { patchPosition: position.data } : {}),
  };
  // No old unit prices, coupon codes, shipping/tax totals or financial/provider
  // references participate. Normal checkout checks the live quote again later.
  const quote = await quoteSelection(settings, "", "", undefined, { id: userId, email: null });
  return {
    settings,
    quote: {
      unitCents: quote.unitCents,
      totalCents: quote.totalCents,
      discountCents: quote.discountCents,
      discountLabel: quote.discountLabel,
    },
    notice:
      "Previous product options restored at current prices. Review today’s physical dimensions and placement; the current photo may differ. " +
      (item.has_artwork
        ? "Your previous design used an upload. Upload it again or create a new design. "
        : "Text-only design restored. ") +
      "Artwork, previous offers, customer details and notes were not copied.",
  };
}
