import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
import {
  saveEstimateSchema,
  quoteActionSchema,
  quoteResponseSchema,
  quoteTokenSchema,
  requestQuoteSchema,
} from "./quote-schemas";

export const getQuotes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().trim().max(100).default(""))
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./quotes.server")).listQuotes(actor, data);
  });
export const saveEstimate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveEstimateSchema)
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./quotes.server")).saveQuote(data, actor);
  });
export const quoteOwnerAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(quoteActionSchema)
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./quotes.server")).actOnQuote(data, actor);
  });

async function privateResponseHeaders() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
export const getPrivateQuote = createServerFn({ method: "GET" })
  .validator(quoteTokenSchema)
  .handler(async ({ data }) => {
    await privateResponseHeaders();
    await (await import("./pricing.server")).rateLimit("quote-review", 90);
    return (await import("./quotes.server")).publicQuote(data);
  });
export const answerPrivateQuote = createServerFn({ method: "POST" })
  .validator(quoteResponseSchema)
  .handler(async ({ data }) => {
    const { assertQuoteMutationOrigin } = await import("./quote-request-boundary.server");
    assertQuoteMutationOrigin();
    await privateResponseHeaders();
    await (await import("./pricing.server")).rateLimit("quote-response", 20);
    return (await import("./quotes.server")).respondToQuote(data);
  });
export const submitQuoteRequest = createServerFn({ method: "POST" })
  .validator(requestQuoteSchema)
  .handler(async ({ data }) => {
    const { assertQuoteMutationOrigin } = await import("./quote-request-boundary.server");
    assertQuoteMutationOrigin();
    await (await import("./pricing.server")).rateLimit("quote-request", 5);
    return (await import("./quotes.server")).receiveQuoteRequest(data);
  });
