import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireAccess } from "@/lib/commerce/access.server";
import { mediaIsPublished } from "@/lib/commerce/media.server";
export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!/^[a-f0-9-]{36}$/.test(params.id)) return new Response("Not found", { status: 404 });
        const original = new URL(request.url).searchParams.get("original") === "1";
        const published = !original && (await mediaIsPublished(params.id));
        if (!published)
          try {
            const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
            const user = await getSessionUser(bearer);
            if (!user) throw Error();
            await requireAccess(user.id, "website", bearer);
          } catch {
            return new Response("Not found", { status: 404 });
          }
        const sql = await getSql();
        const [m] = await sql<{
          bytes: Uint8Array;
          thumbnail: Uint8Array;
          original: Uint8Array;
          original_mime: string;
        }>`select a.bytes,m.thumbnail,m.original,m.original_mime from commerce_media m join commerce_assets a on a.id=m.id where m.id=${params.id} and not m.archived`;
        if (!m) return new Response("Not found", { status: 404 });
        const thumbnail = new URL(request.url).searchParams.get("thumbnail") === "1";
        return new Response(
          new Uint8Array(original ? m.original : thumbnail ? m.thumbnail : m.bytes),
          {
            headers: {
              "Content-Type": original ? m.original_mime : "image/webp",
              "Cache-Control": published ? "public, max-age=60" : "private, no-store",
              "X-Content-Type-Options": "nosniff",
              ...(original
                ? { "Content-Disposition": 'attachment; filename="original-' + params.id + '"' }
                : {}),
            },
          },
        );
      },
    },
  },
});
