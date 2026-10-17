import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  saveStudioSchema,
  studioActionSchema,
  studioToken,
  answerProofSchema,
  studioKind,
} from "./studio-schemas";
import { MAX_NEW_UPLOAD_DATA_URL_LENGTH } from "@/lib/upload-limits";
export const getStudioDocuments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(studioKind)
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./studio.server")).listStudio(data, actor);
  });
export const saveStudioDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveStudioSchema)
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./studio.server")).saveStudio(data, actor);
  });
export const studioOwnerAction = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(studioActionSchema)
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./studio.server")).actOnStudio(data, actor);
  });
export const getStudioDetail = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./studio.server")).studioOwnerDocument(data, actor);
  });
export const getStudioOrder = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./studio.server")).invoiceFromOrder(data, actor);
  });
export const uploadStudioPhoto = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({
        name: z.string().max(180),
        data: z.string().max(MAX_NEW_UPLOAD_DATA_URL_LENGTH),
        alt: z.string().max(250),
      })
      .strict(),
  )
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./media.server")).uploadMedia(data, actor);
  });
export const emailStudioDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z
      .object({ id: z.string().uuid(), path: z.string().max(100), requestId: z.string().uuid() })
      .strict(),
  )
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    const { getRequest } = await import("@tanstack/react-start/server");
    return (await import("./studio-email.server")).sendStudioEmail(
      data,
      actor,
      new URL(getRequest().url).origin,
    );
  });
export const refreshDocumentDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const actor = await (
      await import("./access.server")
    ).requireAccess(context.userId, "finance", context.bearerToken);
    return (await import("./studio-email.server")).refreshStudioDelivery(data, actor);
  });
async function privacy() {
  const { setResponseHeader } = await import("@tanstack/react-start/server");
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  setResponseHeader("Referrer-Policy", "no-referrer");
}
export const getPrivateStudio = createServerFn({ method: "GET" })
  .validator(studioToken)
  .handler(async ({ data }) => {
    await privacy();
    await (await import("./pricing.server")).rateLimit("studio-view", 90);
    return (await import("./studio.server")).viewStudio(data);
  });
export const payPrivateInvoice = createServerFn({ method: "POST" })
  .validator(studioToken)
  .handler(async ({ data }) => {
    await (await import("./quote-request-boundary.server")).assertQuoteMutationOrigin();
    await privacy();
    await (await import("./pricing.server")).rateLimit("studio-pay", 20);
    return (await import("./studio.server")).payStudio(data);
  });
export const answerPrivateProof = createServerFn({ method: "POST" })
  .validator(answerProofSchema)
  .handler(async ({ data }) => {
    await (await import("./quote-request-boundary.server")).assertQuoteMutationOrigin();
    await privacy();
    await (await import("./pricing.server")).rateLimit("proof-answer", 20);
    const response = await (await import("./studio.server")).answerProof(data);
    await (await import("./order-email.server")).tryOrderEmails();
    return response;
  });
