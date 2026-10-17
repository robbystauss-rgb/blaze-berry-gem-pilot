import { z } from "zod";
import { CONTENT_KEYS } from "./types";

export const INFO_PAGES = [
  "contact",
  "about",
  "faq",
  "shipping_policy",
  "refund_policy",
  "privacy_policy",
] as const;
export const faqSchema = z
  .array(
    z
      .object({
        question: z.string().trim().min(1).max(180),
        answer: z.string().trim().min(1).max(2000),
      })
      .strict(),
  )
  .max(30);
export const footerLinksSchema = z
  .array(
    z
      .object({
        label: z.string().trim().min(1).max(40),
        path: z.enum([
          "/hats",
          "/order",
          "/actual-work",
          "/shop",
          "/quote-request",
          "/info?page=contact",
          "/info?page=about",
          "/info?page=faq",
        ]),
      })
      .strict(),
  )
  .max(8);
export const pageSeoSchema = z.partialRecord(
  z.enum(INFO_PAGES),
  z.object({ title: z.string().trim().max(70), description: z.string().trim().max(170) }).strict(),
);
export type ContentKey = (typeof CONTENT_KEYS)[number];
export function validateContentValue(key: ContentKey, raw: string): string {
  const value = z.string().trim().max(20000).parse(raw);
  if (key === "contact_email" && value) return z.email().parse(value);
  if (key === "contact_phone" && value.length > 80)
    throw Error("Keep the phone number under 80 characters.");
  if (
    key === "featured_product_ids" &&
    value &&
    !value.split(",").every((id) => z.string().uuid().safeParse(id.trim()).success)
  )
    throw Error("Use comma-separated product IDs.");
  if (key === "faq_items" || key === "footer_links" || key === "page_seo") {
    const parsed = value ? JSON.parse(value) : key === "page_seo" ? {} : [];
    return JSON.stringify(
      (key === "faq_items"
        ? faqSchema
        : key === "footer_links"
          ? footerLinksSchema
          : pageSeoSchema
      ).parse(parsed),
    );
  }
  if (
    (key === "seo_title" && value.length > 70) ||
    (key === "seo_description" && value.length > 170)
  )
    throw Error("SEO text exceeds its allowed length.");
  return value;
}
export function parsePublicField<T>(schema: z.ZodType<T>, value?: string): T | null {
  try {
    const result = schema.safeParse(JSON.parse(value || "null"));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export const CONTENT_LABELS: Record<ContentKey, string> = {
  announcement: "Fallback announcement",
  homepage_intro: "Homepage introduction",
  contact_email: "Public email",
  contact_phone: "Public phone",
  shipping_policy: "Shipping policy",
  refund_policy: "Refund policy",
  privacy_policy: "Privacy policy",
  seo_title: "Default SEO title",
  seo_description: "Default meta description",
  featured_product_ids: "Featured product IDs",
  about_story: "About / our story",
  faq_items: "Frequently asked questions",
  footer_links: "Additional footer links",
  page_seo: "Information page SEO",
};
