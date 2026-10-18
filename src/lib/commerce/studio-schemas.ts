import { z } from "zod";
import { quoteLineSchema } from "./quote-schemas";
const text = z.string().trim(),
  cents = z.number().int().min(0).max(10_000_000);
export const studioKind = z.enum(["invoice", "proof"]);
export const studioToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const invoiceBodySchema = z
  .object({
    customerName: text.min(1).max(120),
    customerEmail: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    billingAddress: text.max(1500).default(""),
    shippingAddress: text.max(1500).default(""),
    lines: z.array(quoteLineSchema).min(1).max(50),
    shipping: cents,
    tax: cents,
    discount: cents,
    dueDate: z.string().date(),
    terms: text.max(4000),
    notes: text.max(4000),
    totalsConfirmed: z.boolean(),
    availabilityConfirmed: z.boolean(),
    requiresProof: z.boolean().default(false),
  })
  .strict()
  .superRefine((v, c) => {
    const subtotal = v.lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
    if (
      !Number.isSafeInteger(subtotal) ||
      subtotal + v.shipping + v.tax - v.discount <= 0 ||
      subtotal + v.shipping + v.tax > 10_000_000 ||
      v.discount > subtotal
    )
      c.addIssue({
        code: "custom",
        message: "Use a positive total up to $100,000 and a discount no greater than the subtotal.",
      });
    if (new Set(v.lines.map((l) => l.id)).size !== v.lines.length)
      c.addIssue({ code: "custom", message: "Line identifiers must be unique." });
  });
export const proofBodySchema = z
  .object({
    title: text.min(1).max(200),
    notes: text.max(4000),
    details: z
      .array(z.object({ label: text.min(1).max(80), value: text.min(1).max(500) }).strict())
      .max(24),
    mediaIds: z.array(z.string().uuid()).min(1).max(6),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const saveStudioSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("invoice"),
      id: z.string().uuid(),
      version: z.number().int().min(0),
      orderId: z.string().uuid().nullable(),
      body: invoiceBodySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("proof"),
      id: z.string().uuid(),
      version: z.number().int().min(0),
      orderId: z.string().uuid(),
      body: proofBodySchema,
    })
    .strict(),
]);
export const studioActionSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(1),
    action: z.enum(["issue", "rotate", "withdraw", "void", "prepare_payment"]),
  })
  .strict();
export const answerProofSchema = z
  .object({
    token: studioToken,
    version: z.number().int().min(1),
    action: z.enum(["approve", "changes"]),
    name: text.min(1).max(120),
    email: z.email().max(254),
    message: text.max(4000).default(""),
    confirmed: z.literal(true),
  })
  .strict()
  .refine(
    (v) => v.action !== "changes" || v.message.length >= 5,
    "Describe the requested changes (at least five characters).",
  );
export type InvoiceBody = z.infer<typeof invoiceBodySchema>;
export type ProofBody = z.infer<typeof proofBodySchema>;
export type StudioRow = {
  id: string;
  kind: "invoice" | "proof";
  number: number;
  order_id: string | null;
  state: string;
  provider_state?: string | null;
  body: InvoiceBody | ProofBody;
  sender: BusinessSender | null;
  subtotal: number;
  total: number;
  version: number;
  proof_version: number | null;
  expires_at: string | null;
  issued_at: string | null;
  created_at: string;
  responded_at: string | null;
  response: { name: string; email: string; message: string; action: string } | null;
};
export type BusinessSender = {
  name: string;
  email: string;
  phone: string;
  address: string;
  website: string;
};
export function invoiceTotals(b: InvoiceBody) {
  const subtotal = b.lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0);
  return { subtotal, total: subtotal + b.shipping + b.tax - b.discount };
}
