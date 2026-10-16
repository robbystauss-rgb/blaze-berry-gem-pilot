import { z } from "zod";
import { isConvexPolygon, pointInPolygon } from "@/lib/patch-physical";
import type { Json } from "./types";
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const money = z.number().int().min(0).max(1000000);
export const calibrationSchema = z
  .object({
    imageVersion: z.string().regex(/^[a-f0-9]{64}$/),
    bounds: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0.05).max(1),
        height: z.number().min(0.05).max(1),
      })
      .refine(
        (b) => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001,
        "Crown must stay inside the photo",
      ),
    polygon: z
      .array(point)
      .min(3)
      .max(12)
      .refine(isConvexPolygon, "Use a convex, non-crossing boundary"),
    anchor: point,
    reference: z
      .object({ start: point, end: point, inches: z.number().min(0.25).max(15) })
      .nullable(),
    rotation: z.number().min(-20).max(20),
    skew: z.number().min(-20).max(20),
    compression: z.number().min(0.65).max(1),
  })
  .refine(
    (g) => pointInPolygon(g.anchor, g.polygon),
    "Default anchor must be inside the usable area",
  );
export const gallerySchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000),
    category: z.string().trim().min(1).max(60),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    mediaIds: z.array(z.string().uuid()).min(1).max(30),
    coverId: z.string().uuid(),
    featured: z.boolean(),
    consent: z.boolean(),
    archived: z.boolean(),
    family: z.string().max(12).default(""),
  })
  .refine((p) => p.mediaIds.includes(p.coverId), "Cover must belong to this project");
export const storefrontSchema = z.object({
  heroTitle: z.string().trim().min(1).max(70),
  heroText: z.string().trim().max(300),
  ctaLabel: z.string().trim().min(1).max(35),
  ctaPath: z.enum(["/order", "/hats", "/actual-work", "/shop"]),
  heroMediaId: z.string().uuid().nullable(),
  focalX: z.number().min(0).max(100),
  focalY: z.number().min(0).max(100),
  announcement: z.string().trim().max(160),
  leadTime: z.string().trim().max(300),
  showFeaturedWork: z.boolean(),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(170),
});
export const DEFAULT_STOREFRONT: z.infer<typeof storefrontSchema> = {
  heroTitle: "Make it yours.",
  heroText:
    "Choose the hat. Shape the patch. Add your design. See the whole build come together before it goes to production.",
  ctaLabel: "Build your hat",
  ctaPath: "/order",
  heroMediaId: null,
  focalX: 50,
  focalY: 50,
  announcement: "",
  leadTime: "Final engraving and placement are confirmed in your digital proof before production.",
  showFeaturedWork: true,
  seoTitle: "",
  seoDescription: "",
};
const adjustment = z.record(z.string().max(180), money);
export const pricingSchema = z.object({
  currency: z.literal("usd"),
  models: adjustment,
  colors: adjustment,
  patchBase: money,
  materials: adjustment,
  shapes: adjustment,
  sizes: z.object({ small: money, medium: money, large: money }),
  tiers: z
    .array(
      z.object({
        minimum: z.number().int().min(2).max(250),
        percent: z.number().int().min(1).max(50),
      }),
    )
    .max(12),
});
export type PriceBook = z.infer<typeof pricingSchema>;
export const DEFAULT_PRICING: PriceBook = {
  currency: "usd",
  models: {
    "112": 3000,
    "112FP": 3500,
    "112FPR": 3500,
    "112P": 3500,
    "112PM": 3500,
    "112PFP": 3500,
    "168": 3500,
    "168P": 3500,
    "256": 3500,
    "256P": 3500,
  },
  colors: {},
  patchBase: 500,
  materials: {},
  shapes: {},
  sizes: { small: 0, medium: 0, large: 0 },
  tiers: [],
};
export const promoDefinition = z
  .object({
    campaign: z.string().trim().min(1).max(120),
    type: z.enum(["percent", "fixed"]),
    amount: z.number().int().min(1).max(1000000),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
    minimumSpend: money,
    minimumQuantity: z.number().int().min(1).max(250),
    families: z.array(z.string().max(20)).max(10),
    orderType: z.enum(["any", "hat", "patch"]),
    maximumUses: z.number().int().min(1).max(1000000).nullable(),
    perCustomer: z.number().int().min(1).max(1000).nullable(),
    customerEmail: z.email().nullable(),
    firstOrder: z.boolean(),
    automatic: z.boolean(),
    perItem: z.boolean().default(false),
  })
  .refine((p) => p.type !== "percent" || p.amount <= 100, "Percentage must be at most 100")
  .refine(
    (p) => !p.startsAt || !p.endsAt || new Date(p.endsAt) > new Date(p.startsAt),
    "End must follow start",
  );
export type PromoDefinition = z.infer<typeof promoDefinition>;
export const promotionSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,40}$/),
  definition: promoDefinition,
  state: z.enum(["draft", "active", "inactive", "archived"]),
  version: z.number().int().min(0),
});
export type OwnerScope = "calibration" | "gallery" | "storefront" | "pricing";
export type DocumentRow<T = Json> = {
  scope: OwnerScope;
  key: string;
  draft: T;
  published: T | null;
  version: number;
  published_revision: number;
  updated_at: string;
};
