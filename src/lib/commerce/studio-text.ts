import { z } from "zod";

/** One recipient only. Reject URI delimiters, extensions and control characters. */
export function normalizeCustomerPhone(value: string): string {
  if (Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
    throw Error("Enter one mobile number without control characters.");
  const v = value.trim();
  if (!v) return "";
  if (v.length > 40 || !/^\+?[0-9 () .-]+$/.test(v))
    throw Error("Enter one mobile number, without an extension or message text.");
  const digits = v.replace(/\D/g, "");
  const phone = v.startsWith("+")
    ? "+" + digits
    : digits.length === 10
      ? "+1" + digits
      : digits.length === 11 && digits.startsWith("1")
        ? "+" + digits
        : "";
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone))
    throw Error(
      "Use a 10-digit US/Canada number or an international number starting with + and country code.",
    );
  return phone;
}
export const customerPhoneSchema = z
  .string()
  .max(40)
  .transform((v, ctx) => {
    try {
      return normalizeCustomerPhone(v);
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        message: e instanceof Error ? e.message : "Invalid phone number.",
      });
      return z.NEVER;
    }
  });
export const studioContactSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0),
    phone: customerPhoneSchema,
  })
  .strict();
export const studioTextSchema = z
  .object({
    id: z.string().uuid(),
    path: z.string().regex(/^\/(invoice|design-proof)\/[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export function studioTextMessage(kind: "invoice" | "proof", secureUrl: string) {
  return kind === "invoice"
    ? `Hi! Thank you for choosing REC Mama Made! Your custom order invoice is ready. You can review and pay securely here: ${secureUrl}`
    : `Hi! Thank you for choosing REC Mama Made! Your design proof is ready. Please review it and approve the design or request revisions here: ${secureUrl} Artwork approval is separate from invoice payment.`;
}
/** iOS Messages uses &body; Android and desktop handlers use the RFC query form. */
export function nativeSmsHref(phone: string, message: string, userAgent: string, touchPoints = 0) {
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) throw Error("Save a valid customer phone number first.");
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1);
  return `sms:${phone}${ios ? "&" : "?"}body=${encodeURIComponent(message)}`;
}
