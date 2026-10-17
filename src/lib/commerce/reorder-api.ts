import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
export const getOwnReorderLines = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const { ownReorderLines } = await import("./reorder.server");
    return ownReorderLines(context.userId, data);
  });
export const getReorderIntent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string().uuid())
  .handler(async ({ data, context }) => {
    const { prepareReorder } = await import("./reorder.server");
    return prepareReorder(context.userId, data);
  });
