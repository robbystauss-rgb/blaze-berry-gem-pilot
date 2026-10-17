import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
import type { OwnerScope } from "./owner-schemas";
import { EXCLUDED_MEDIA_MD5 } from "@/lib/media-policy";
const quoteInput = z.object({
  orderType: z.enum(["hat", "patch"]),
  family: z.string().max(12),
  colorway: z.string().max(160),
  leatherette: z.string().max(80),
  patchShape: z.string().max(40),
  patchSize: z.enum(["small", "medium", "large"]),
  quantity: z.number().int().min(1).max(250),
  promo: z.string().max(40).default(""),
  email: z.string().max(254).default(""),
});
const scope = z.enum(["calibration", "gallery", "storefront", "pricing", "content"]);
export const searchBusiness = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().trim().min(2).max(80))
  .handler(async ({ context, data }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "orders", context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql(),
      search = "%" + data + "%";
    const [orders, products, customers] = await Promise.all([
      sql<{
        id: string;
        number: number;
        customer_name: string;
      }>`select id,number,customer_name from commerce_orders where customer_name ilike ${search} or customer_email ilike ${search} or number::text=${data} order by created_at desc limit 5`,
      sql<{
        id: string;
        title: string;
      }>`select id,title from commerce_products where title ilike ${search} order by updated_at desc limit 3`,
      sql<{
        customer_email: string;
        customer_name: string;
      }>`select distinct customer_email,customer_name from commerce_orders where customer_email ilike ${search} or customer_name ilike ${search} limit 3`,
    ]);
    return { orders, products, customers };
  });
export const getOwnerHatPhotos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "website", context.bearerToken);
    const { ownerHatPhotos } = await import("./hat-photos.server");
    return ownerHatPhotos();
  });
export const addHatPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.unknown())
  .handler(async ({ context, data }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "website", context.bearerToken);
    const { registerHatPhoto } = await import("./hat-photos.server");
    return registerHatPhoto(data, actor);
  });
export const getPublishedHatPhoto = createServerFn({ method: "GET" })
  .validator(z.object({ modelId: z.string().max(12), colorway: z.string().max(180) }))
  .handler(async ({ data }) => {
    const { publishedHatPhoto } = await import("./hat-photos.server");
    return publishedHatPhoto(data.modelId, data.colorway);
  });
export const getOwnerDocuments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(scope)
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const { readDocuments, documentPermission } = await import("./publishing.server");
    await requireAccess(context.userId, documentPermission(data), context.bearerToken);
    return data === "content"
      ? (await import("./content-pages.server")).contentDocuments()
      : readDocuments(data);
  });
export const updateOwnerDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      scope,
      key: z.string(),
      version: z.number(),
      action: z.enum(["draft", "publish", "revert", "unpublish"]),
      body: z.unknown(),
      revision: z.number().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const { saveDocument, documentPermission } = await import("./publishing.server");
    const actor = await requireAccess(
      context.userId,
      documentPermission(data.scope),
      context.bearerToken,
    );
    return data.scope === "content"
      ? (await import("./content-pages.server")).saveContentDocument(data, actor)
      : saveDocument(data, actor);
  });
export const getMediaLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "website", context.bearerToken);
    const { mediaLibrary } = await import("./media.server");
    return mediaLibrary();
  });
export const saveMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ action: z.enum(["upload", "edit"]), payload: z.unknown() }))
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "website", context.bearerToken);
    const { uploadMedia, editMedia } = await import("./media.server");
    return data.action === "upload"
      ? uploadMedia(data.payload, actor)
      : editMedia(data.payload, actor);
  });
export const getPublicDocument = createServerFn({ method: "GET" })
  .validator(
    z.object({ scope: z.enum(["calibration", "storefront", "pricing"]), key: z.string().max(240) }),
  )
  .handler(async ({ data }) => {
    const { publishedDocument } = await import("./publishing.server");
    return publishedDocument<import("./types").Json>(data.scope as OwnerScope, data.key);
  });
export const getPublicGallery = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  return sql<{
    key: string;
    published: import("zod").infer<typeof import("./owner-schemas").gallerySchema>;
    media: { id: string; alt: string; version: number }[];
  }>`select d.key,d.published,coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'alt',m.alt,'version',m.version)) from commerce_media m where d.published->'mediaIds' @> to_jsonb(m.id) and not m.archived),'[]'::jsonb) as media from commerce_documents d where d.scope='gallery' and d.published->>'consent'='true' and d.published->>'archived'='false' and coalesce(d.published->>'family','')<>'112PM' and not exists(select 1 from commerce_media m where d.published->'mediaIds' @> to_jsonb(m.id) and md5(m.original)=any(${EXCLUDED_MEDIA_MD5}::text[])) order by d.updated_at desc limit 100`;
});
export const getStorefrontPreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "website", context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const [row] = await sql<{
      draft: import("./types").Json;
    }>`select draft from commerce_documents where scope='storefront' and key='main'`;
    return row?.draft ?? null;
  });
export const quoteBuilder = createServerFn({ method: "POST" })
  .validator(quoteInput)
  .handler(async ({ data }) => {
    const { rateLimit, quoteSelection } = await import("./pricing.server");
    await rateLimit("builder-quote", 90);
    const { FAMILIES, LEATHERETTES, PATCH_SHAPES, colorsForFamily } = await import("@/lib/catalog");
    if (
      !(data.family in FAMILIES) ||
      !LEATHERETTES.some((m) => m.id === data.leatherette) ||
      !PATCH_SHAPES.includes(data.patchShape as (typeof PATCH_SHAPES)[number]) ||
      (data.orderType === "hat" &&
        !colorsForFamily(data.family as keyof typeof FAMILIES).includes(data.colorway))
    )
      throw Error("Choose available product options for a quote.");
    const { totalCents, unitCents, subtotalCents, discountCents, discountLabel, bonus, fulfilled } =
      await quoteSelection(data, data.promo, data.email);
    return { totalCents, unitCents, subtotalCents, discountCents, discountLabel, bonus, fulfilled };
  });
export const getPromotions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "finance", context.bearerToken);
    const { promotionList } = await import("./pricing.server");
    return promotionList();
  });
export const updatePromotion = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.unknown())
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "finance", context.bearerToken);
    const { savePromotion } = await import("./pricing.server");
    return savePromotion(data, actor);
  });

export const previewInventoryCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.unknown())
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "inventory", context.bearerToken);
    const { previewInventoryImport } = await import("./inventory-import.server");
    return previewInventoryImport(data, actor);
  });
export const importInventoryCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.unknown())
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "inventory", context.bearerToken);
    const { commitInventoryImport } = await import("./inventory-import.server");
    return commitInventoryImport(data, actor);
  });
export const exportInventoryCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "inventory", context.bearerToken);
    const { exportInventoryCounts } = await import("./inventory-import.server");
    return exportInventoryCounts(actor);
  });
