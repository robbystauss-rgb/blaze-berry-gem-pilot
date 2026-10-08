import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireAccess } from "@/lib/commerce/access.server";
export const Route = createFileRoute("/api/catalog-image/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const sql = await getSql();
        const [asset] = await sql<{
          mime: string;
          bytes: Uint8Array;
          published: boolean;
        }>`select a.mime,a.bytes,exists(select 1 from commerce_products p where p.state='active' and p.images @> ${JSON.stringify(["/api/catalog-image/" + params.id])}::jsonb) as published from commerce_assets a where a.id=${params.id}`;
        if (!asset) return new Response("Not found", { status: 404 });
        if (!asset.published) {
          try {
            const user = await getSessionUser(
              request.headers.get("authorization")?.replace(/^Bearer /, ""),
            );
            if (!user) throw new Error();
            await requireAccess(
              user.id,
              "products",
              request.headers.get("authorization")?.replace(/^Bearer /, ""),
            );
          } catch {
            return new Response("Not found", { status: 404 });
          }
        }
        return new Response(new Uint8Array(asset.bytes), {
          headers: {
            "Content-Type": asset.mime,
            "Cache-Control": asset.published ? "public, max-age=300" : "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
