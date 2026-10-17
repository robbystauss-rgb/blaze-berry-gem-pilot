import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
export const getContentPreview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requireAccess } = await import("./access.server");
    await requireAccess(context.userId, "website", context.bearerToken);
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ key: string; value: string }>`select key,value from commerce_content`;
    const drafts = await sql<{
      key: string;
      draft: { value: string };
    }>`select key,draft from commerce_documents where scope='content'`;
    return Object.fromEntries([
      ...rows.map((r) => [r.key, r.value]),
      ...drafts.map((r) => [r.key, r.draft.value]),
    ]) as Record<string, string>;
  });
