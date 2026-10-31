import { z } from "zod";

export const PAYMENT_METHODS = ["venmo", "cash", "bank_transfer", "zelle", "other"] as const;
export const manualPaymentSchema = z.object({
  id: z.string().uuid("Choose an existing order."),
  amount: z
    .number()
    .int("Enter dollars and cents only.")
    .min(1, "Enter an amount greater than $0.")
    .max(10000000, "The payment amount is too large."),
  method: z.enum(PAYMENT_METHODS).default("other"),
  reference: z
    .string()
    .trim()
    .min(3, "Enter a transaction or receipt reference of at least 3 characters.")
    .max(160, "Keep the receipt reference to 160 characters."),
  reason: z
    .string()
    .trim()
    .min(
      5,
      "Add a verification note of at least 5 characters, such as ‘Payment verified in Venmo’. ",
    )
    .max(500, "Keep the verification note to 500 characters."),
  occurredAt: z.string().datetime("Choose a valid date and time received."),
  requestId: z.string().uuid("Reopen the payment form and retry."),
});
export type ManualPaymentInput = z.infer<typeof manualPaymentSchema>;

export function localDateTime(value: string | Date = new Date()) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function dollarsToCents(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return NaN;
  const [whole, fraction = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
