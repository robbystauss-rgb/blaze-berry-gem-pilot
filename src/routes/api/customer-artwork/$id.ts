import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireAccess } from "@/lib/commerce/access.server";
import { customerArtwork } from "@/lib/commerce/customers.server";
export const Route = createFileRoute("/api/customer-artwork/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
          const user = await getSessionUser(bearer);
          if (!user) return new Response("Unauthorized", { status: 401 });
          const actor = await requireAccess(user.id, "customers", bearer);
          const preview = new URL(request.url).searchParams.get("preview") === "1";
          const asset = await customerArtwork(params.id, actor, preview);
          return new Response(new Uint8Array(asset.bytes), {
            headers: {
              "Content-Type": asset.mime,
              "Content-Disposition": preview
                ? "inline"
                : `attachment; filename="source-${params.id}"; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "sandbox; default-src 'none'",
              "X-Robots-Tag": "noindex, nofollow",
            },
          });
        } catch {
          return new Response("Private artwork unavailable", { status: 403 });
        }
      },
    },
  },
});
