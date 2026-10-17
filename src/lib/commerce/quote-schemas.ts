import { z } from "zod";

const cents = z.number().int().min(0).max(10_000_000);
export const quoteLineSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(["product", "setup", "design", "service"]),
    title: z.string().trim().min(1).max(200),
    quantity: z.number().int().min(1).max(10_000),
    unitAmount: cents,
    specifications: z.string().trim().max(4000).default(""),
    productKey: z.string().trim().max(240).default(""),
  })
  .strict()
  .refine(
    (line) => line.kind === "product" || !line.productKey,
    "Only product lines can reserve inventory.",
  );

export const estimateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    customerName: z.string().trim().min(1).max(120),
    customerEmail: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    lines: z.array(quoteLineSchema).min(1).max(50),
    shipping: cents,
    tax: cents,
    terms: z.string().trim().min(1).max(4000),
    expiresAt: z.iso.datetime({ offset: true }),
    privateNotes: z.string().trim().max(4000).default(""),
    availabilityConfirmed: z.boolean(),
    totalsConfirmed: z.boolean(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const subtotal = value.lines.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal + value.shipping + value.tax > 10_000_000)
      ctx.addIssue({
        code: "custom",
        message: "Quote total cannot exceed $100,000.",
        path: ["lines"],
      });
    if (new Set(value.lines.map((line) => line.id)).size !== value.lines.length)
      ctx.addIssue({
        code: "custom",
        message: "Each quote line needs a unique identifier.",
        path: ["lines"],
      });
  });

export const saveEstimateSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(0),
    body: estimateSchema,
    requestId: z.string().uuid().optional(),
  })
  .strict();
export const quoteActionSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().min(1),
    action: z.enum(["issue", "revoke"]),
  })
  .strict();
export const quoteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const quoteResponseSchema = z
  .object({
    token: quoteTokenSchema,
    version: z.number().int().min(1),
    action: z.enum(["accept", "decline"]),
  })
  .strict();
export const requestQuoteSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    company: z.string().trim().max(160).default(""),
    quantity: z.number().int().min(1).max(10_000),
    details: z.string().trim().min(10).max(5000),
    permissionToRespond: z.literal(true),
    website: z.literal("").default(""),
  })
  .strict();

export type Estimate = z.infer<typeof estimateSchema>;
export type EstimateLine = z.infer<typeof quoteLineSchema>;
export type QuoteState = "draft" | "issued" | "accepted" | "declined" | "revoked";
export type OwnerQuote = {
  id: string;
  number: number;
  state: QuoteState;
  body: Estimate;
  subtotal: number;
  total: number;
  version: number;
  created_at: string;
  updated_at: string;
  issued_at: string | null;
  responded_at: string | null;
  order_id: string | null;
  request_id: string | null;
  expired: boolean;
};
export type PublicQuote = {
  number: number;
  title: string;
  customerName: string;
  state: QuoteState;
  lines: EstimateLine[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  terms: string;
  expiresAt: string;
  expired: boolean;
  version: number;
};
export type QuoteRequest = {
  id: string;
  name: string;
  email: string;
  company: string;
  quantity: number;
  details: string;
  state: "new" | "reviewed" | "archived";
  created_at: string;
};

export function quoteTotals(body: Estimate) {
  const subtotal = body.lines.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
  return { subtotal, total: subtotal + body.shipping + body.tax };
}
