import { z } from "zod";
const text = z.string().trim();
export const customerBodySchema = z.object({
  name: text.min(1, "Enter the customer's name.").max(120),
  email: z
    .union([z.email().max(254), z.literal(""), z.null()])
    .transform((v) => (v ? v.toLowerCase() : null)),
  phone: text.max(40).default(""),
  phoneCountry: z.enum(["", "US"]).default(""),
  preferredContact: z.enum(["phone", "text", "email", "none"]).default("phone"),
  businessName: text.max(160).default(""),
  aliases: z.array(text.min(1).max(120)).max(10).default([]),
  tags: z.array(text.min(1).max(40)).max(20).default([]),
  deliveryPreference: z.enum(["unspecified", "shipping", "pickup"]).default("unspecified"),
  address: z
    .object({
      line1: text.max(200).default(""),
      line2: text.max(200).default(""),
      city: text.max(100).default(""),
      region: text.max(100).default(""),
      postalCode: text.max(30).default(""),
      country: text.max(80).default(""),
    })
    .default({ line1: "", line2: "", city: "", region: "", postalCode: "", country: "" }),
  preferences: text.max(4000).default(""),
});
export type CustomerBody = z.infer<typeof customerBodySchema>;
export const saveCustomerSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().min(0),
  body: customerBodySchema,
  reviewedDuplicate: z.boolean().default(false),
});
export function normalizeCustomerPhone(raw: string, country = "") {
  if (
    !/^\+?[0-9 () .-]*$/.test(raw) ||
    Array.from(raw).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw Error("Enter one phone number without extensions, links or control characters.");
  if (!raw.trim()) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) return "+" + digits;
  if (country === "US" && /^[2-9]\d{9}$/.test(digits)) return "+1" + digits;
  if (country === "US" && /^1[2-9]\d{9}$/.test(digits)) return "+" + digits;
  if (digits.length < 7 || digits.length > 15)
    throw Error(
      "Enter a valid phone number. Include +country code or explicitly select United States.",
    );
  if (raw.trim().startsWith("+") || country)
    throw Error("Check the phone number and selected country.");
  return digits; // Searchable local number; no country code is guessed.
}
export const savedBuildSchema = z.object({
  orderType: z.enum(["hat", "patch"]),
  modelId: text.min(1).max(40),
  variantId: text.min(1).max(180),
  leatherette: text.min(1).max(80),
  patchShape: text.min(1).max(50),
  patchSize: z.enum(["small", "medium", "large"]),
  physicalInches: z.object({
    width: z.number().positive().max(15),
    height: z.number().positive().max(15),
  }),
  placement: text.min(1).max(40),
  patchPosition: z
    .object({
      version: z.literal(2),
      anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
    })
    .nullable()
    .default(null),
  patchText: text.max(2000).default(""),
  quantity: z.number().int().min(1).max(250).default(1),
  notes: text.max(4000).default(""),
  previewSnapshot: z.record(z.string(), z.json()).nullable().default(null),
});
export type SavedBuild = z.infer<typeof savedBuildSchema>;
export const saveCustomerDesignSchema = z.object({
  sourceItemId: z.string().uuid().nullable().default(null),
  approvedProofId: z.string().uuid().nullable().default(null),
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  version: z.number().int().min(0),
  name: text.min(1).max(160),
  collection: text.max(100).default(""),
  configuration: savedBuildSchema,
  artworkAssetId: z.string().uuid().nullable(),
  note: text.min(5, "Describe this design revision in at least 5 characters.").max(500),
});
export type CustomerProfile = {
  id: string;
  number: number;
  name: string;
  email: string | null;
  phone: string;
  phone_normalized: string;
  preferred_contact: CustomerBody["preferredContact"];
  business_name: string;
  aliases: string[];
  tags: string[];
  delivery_preference: CustomerBody["deliveryPreference"];
  address: CustomerBody["address"];
  preferences: string;
  origin: string;
  archived: boolean;
  merged_into: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};
export type CustomerAsset = {
  id: string;
  customer_id: string;
  kind: string;
  name: string;
  mime: string;
  checksum: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  has_preview: boolean;
  provenance: string;
  created_at: string;
};
export type CustomerDesign = {
  id: string;
  customer_id: string;
  name: string;
  collection: string;
  state: string;
  version: number;
  updated_at: string;
  configuration: SavedBuild;
  artwork_asset_id: string | null;
  compatibility: string[];
};
