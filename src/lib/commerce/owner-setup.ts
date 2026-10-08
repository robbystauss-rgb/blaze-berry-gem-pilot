import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
const input = z.object({ token: z.string().regex(/^[\w-]{43,128}$/) });
export const inspectOwnerSetup = createServerFn({ method: "POST" })
  .validator(input)
  .handler(async ({ data }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    assertSameSiteRequest();
    const { inspectOwnerInvitation } = await import("./owner-setup.server");
    return inspectOwnerInvitation(data.token);
  });
export const acceptOwnerSetup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(input)
  .handler(async ({ data, context }) => {
    const { getSql } = await import("@/lib/db");
    const { redeemOwnerInvitation } = await import("./owner-setup.server");
    return redeemOwnerInvitation(await getSql(), context.userId, data.token);
  });
