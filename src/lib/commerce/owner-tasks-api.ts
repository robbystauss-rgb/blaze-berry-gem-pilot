import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";
export const getOwnerTasks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.unknown())
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "website", context.bearerToken);
    return (await import("./owner-tasks.server")).ownerTasks(data, actor);
  });
export const updateOwnerTask = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.unknown())
  .handler(async ({ data, context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "website", context.bearerToken);
    return (await import("./owner-tasks.server")).saveOwnerTask(data, actor);
  });
export const getOwnerDashboardInsights = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    const actor = await requireAccess(context.userId, "website", context.bearerToken);
    return (await import("./owner-tasks.server")).ownerDashboardInsights(actor);
  });
