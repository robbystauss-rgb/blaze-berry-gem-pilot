import { createFileRoute } from "@tanstack/react-router";
import { getSessionUser } from "@/lib/auth/verify.server";
import { requireAccess } from "@/lib/commerce/access.server";
import { studioBinary } from "@/lib/commerce/studio.server";
export const Route = createFileRoute("/api/studio-file/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url),
          mode = url.searchParams.get("mode") === "image" ? "image" : "pdf",
          position = Number(url.searchParams.get("position") ?? 0);
        const headers = {
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
        };
        if (
          !/^[a-f0-9-]{36}$/.test(params.id) ||
          !Number.isSafeInteger(position) ||
          position < 0 ||
          position > 5
        )
          return new Response("Not found", { status: 404, headers });
        let actor = null;
        const token = url.searchParams.get("token");
        if (!token)
          try {
            const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
            const user = await getSessionUser(bearer);
            if (user) actor = await requireAccess(user.id, "finance", bearer);
          } catch {
            /* Deny without leaking document existence. */
          }
        try {
          const file = await studioBinary(params.id, actor, token, mode, position);
          if (!file) return new Response("Not found", { status: 404, headers });
          return new Response(new Uint8Array(file.bytes), {
            headers: {
              ...headers,
              "Content-Type": file.mime,
              ...(mode === "pdf"
                ? { "Content-Disposition": `attachment; filename="REC-document-${params.id}.pdf"` }
                : {}),
            },
          });
        } catch {
          return new Response("Not found", { status: 404, headers });
        }
      },
    },
  },
});
