import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireAccess } from "@/lib/commerce/access.server";
import { getSql } from "@/lib/db";
export const Route = createFileRoute("/api/artwork/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
          const user = await getSessionUser(bearer);
          if (!user) return new Response("Unauthorized", { status: 401 });
          const actor = await requireAccess(user.id, "production", bearer);
          const sql = await getSql();
          const [item] = await sql<{
            artwork: Uint8Array;
            artwork_type: string;
            assigned_to: string | null;
          }>`select i.artwork,i.artwork_type,o.assigned_to from commerce_order_items i join commerce_orders o on o.id=i.order_id where i.id=${params.id}
          union all select f.bytes as artwork,f.mime as artwork_type,o.assigned_to from commerce_production_files f join commerce_orders o on o.id=f.order_id where f.id=${params.id}`;
          if (!item?.artwork) return new Response("Not found", { status: 404 });
          if (actor.role === "production" && item.assigned_to !== user.id)
            return new Response("Forbidden", { status: 403 });
          const extension: Record<string, string> = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/webp": "webp",
            "image/svg+xml": "svg",
            "application/pdf": "pdf",
          };
          return new Response(new Uint8Array(item.artwork), {
            headers: {
              "Content-Type": item.artwork_type,
              "Content-Disposition": `attachment; filename="artwork-${params.id}.${extension[item.artwork_type] ?? "bin"}"`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "sandbox; default-src 'none'",
            },
          });
        } catch {
          return new Response("Access denied", { status: 403 });
        }
      },
    },
  },
});
