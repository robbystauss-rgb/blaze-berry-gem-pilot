import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { audit, assertPermission } from "./core.server";
import {
  calibrationSchema,
  gallerySchema,
  storefrontSchema,
  pricingSchema,
  type OwnerScope,
  type DocumentRow,
} from "./owner-schemas";
import type { Role } from "./types";
import manifest from "@/data/crown-calibrations.json";
import { FAMILIES, LEATHERETTES, PATCH_SHAPES, colorsForFamily } from "@/lib/catalog";
import { isRetiredHatModel } from "@/lib/catalog-lifecycle";
import { ARCHIVED_MODELS } from "@/lib/studio-store";
import { assertMediaPublicationAllowed } from "./media-policy.server";

export const documentInput = z.object({
  scope: z.enum(["calibration", "gallery", "storefront", "pricing"]),
  key: z.string().min(1).max(240),
  version: z.number().int().min(0),
  action: z.enum(["draft", "publish", "revert", "unpublish"]),
  body: z.unknown(),
  revision: z.number().int().min(1).optional(),
});
export function documentPermission(scope: OwnerScope) {
  return scope === "pricing" ? ("finance" as const) : ("website" as const);
}
export async function readDocuments(scope: OwnerScope) {
  const sql = await getSql();
  return {
    documents:
      await sql<DocumentRow>`select * from commerce_documents where scope=${scope} order by updated_at desc limit 500`,
    revisions: await sql<{
      id: string;
      key: string;
      revision: number;
      created_at: string;
      actor_id: string;
    }>`select id,key,revision,created_at,actor_id from commerce_document_revisions where scope=${scope} order by created_at desc limit 100`,
  };
}
export async function publishedDocument<T>(scope: OwnerScope, key: string): Promise<T | null> {
  const sql = await getSql();
  const [row] = await sql<{
    published: T | null;
  }>`select published from commerce_documents where scope=${scope} and key=${key}`;
  return row?.published ?? null;
}
export async function saveDocument(raw: unknown, actor: { userId: string; role: Role }) {
  const p = documentInput.parse(raw);
  assertPermission(actor.role, documentPermission(p.scope));
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    if (p.scope === "gallery" || p.scope === "storefront")
      await tx`select pg_advisory_xact_lock(hashtext('media-publishing'))`;
    // Serializes first creation and later changes, including two brand-new drafts.
    await tx`select pg_advisory_xact_lock(hashtext(${"document:" + p.scope + ":" + p.key}))`;
    const [before] =
      await tx<DocumentRow>`select * from commerce_documents where scope=${p.scope} and key=${p.key} for update`;
    if ((before?.version ?? 0) !== p.version)
      throw Error("This draft changed. Refresh and review before saving.");
    let body = p.body;
    if (p.action === "revert") {
      const [r] = await tx<{
        body: unknown;
      }>`select body from commerce_document_revisions where scope=${p.scope} and key=${p.key} and revision=${p.revision ?? 0}`;
      if (!r) throw Error("Published revision not found.");
      body = r.body;
    }
    if (p.scope === "calibration") {
      const photo =
        manifest.records.find((r) => r.id === p.key) ??
        (await (await import("./hat-photos.server")).exactHatPhoto(p.key, tx));
      if (!photo) throw Error("Choose an exact verified catalog photograph.");
      if (isRetiredHatModel(photo.modelId) && (p.action === "publish" || p.action === "revert"))
        throw Error("This hat model is archived and cannot be republished.");
      const g = calibrationSchema.parse(body);
      if (g.imageVersion !== photo.sha256)
        throw Error("Photo changed. Recalibrate this exact image.");
      if (
        g.reference &&
        Math.hypot(
          (g.reference.end.x - g.reference.start.x) * photo.sourceWidth,
          (g.reference.end.y - g.reference.start.y) * photo.sourceHeight,
        ) < 20
      )
        throw Error("Reference markers must be at least 20 source pixels apart.");
      body = g;
    } else if (p.scope === "gallery") {
      z.string().uuid().parse(p.key);
      const g = gallerySchema.parse(body);
      if (
        isRetiredHatModel(g.family) &&
        (p.action === "publish" || p.action === "revert") &&
        !g.archived
      )
        throw Error(
          "This hat model is archived. Keep its project private for historical reference.",
        );
      if (g.family && !(g.family in FAMILIES)) throw Error("Choose a verified Richardson model.");
      const media = await tx<{
        id: string;
        alt: string;
      }>`select id,alt from commerce_media where id=any(${g.mediaIds}::text[]) and not archived for share`;
      if (media.length !== new Set(g.mediaIds).size)
        throw Error("One or more photos are unavailable.");
      if ((p.action === "publish" || p.action === "revert") && !g.archived)
        await assertMediaPublicationAllowed(tx, g.mediaIds);
      if (p.action !== "draft" && !g.archived && (!g.consent || media.some((m) => !m.alt.trim())))
        throw Error("Confirm permission to publish and add alt text for every photo.");
      body = g;
    } else if (p.scope === "storefront") {
      if (p.key !== "main") throw Error("Unknown storefront document.");
      const g = storefrontSchema.parse(body);
      if (g.heroMediaId) {
        if (p.action === "publish" || p.action === "revert")
          await assertMediaPublicationAllowed(tx, [g.heroMediaId]);
        const [m] = await tx<{
          alt: string;
        }>`select alt from commerce_media where id=${g.heroMediaId} and not archived`;
        if (!m || (p.action !== "draft" && !m.alt.trim()))
          throw Error("Choose an available hero photo with alt text.");
      }
      body = g;
    } else {
      if (p.key !== "main") throw Error("Unknown price book.");
      const g = pricingSchema.parse(body);
      if (
        p.action !== "draft" &&
        (g.patchBase <= 0 ||
          Object.values(g.models).some((v) => v <= 0) ||
          Object.values(g.colors).some((v) => v <= 0))
      )
        throw Error("Published base prices must be positive.");
      if (
        Object.keys(g.colors).some(
          (k) =>
            !Object.keys(FAMILIES).some(
              (f) =>
                k.startsWith(f + ":") &&
                [
                  ...colorsForFamily(f as keyof typeof FAMILIES),
                  ...(ARCHIVED_MODELS.find((m) => m.id === f)?.colorways.map(
                    (c) => c.officialName,
                  ) ?? []),
                ].includes(k.slice(f.length + 1)),
            ),
        )
      )
        throw Error("Color price override must identify an exact available model and color.");
      if (
        Object.keys(g.models).some((k) => !(k in FAMILIES)) ||
        Object.keys(FAMILIES).some((k) => !(k in g.models))
      )
        throw Error("Keep every exact Richardson model in the price book.");
      if (
        Object.keys(g.materials).some((k) => !LEATHERETTES.some((m) => m.id === k)) ||
        Object.keys(g.shapes).some(
          (k) => !PATCH_SHAPES.includes(k as (typeof PATCH_SHAPES)[number]),
        )
      )
        throw Error("Unknown material or shape.");
      if (new Set(g.tiers.map((t) => t.minimum)).size !== g.tiers.length)
        throw Error("Each quantity tier needs a different minimum.");
      body = g;
    }
    const publish = p.action === "publish" || p.action === "revert";
    if (p.action === "unpublish" && !before?.published)
      throw Error("This document is not published.");
    const revision = (before?.published_revision ?? 0) + (publish ? 1 : 0);
    await tx`insert into commerce_documents(scope,key,draft,published,published_revision) values(${p.scope},${p.key},${JSON.stringify(body)},${publish ? JSON.stringify(body) : null},${revision}) on conflict(scope,key) do update set draft=excluded.draft,published=case when ${p.action === "unpublish"} then null when ${publish} then excluded.published else commerce_documents.published end,version=commerce_documents.version+1,published_revision=${revision},updated_at=now()`;
    if (publish)
      await tx`insert into commerce_document_revisions(id,scope,key,revision,body,actor_id) values(${randomUUID()},${p.scope},${p.key},${revision},${JSON.stringify(body)},${actor.userId})`;
    await audit(
      tx,
      actor.userId,
      `${p.scope}.${p.action}`,
      "document",
      p.key,
      before ? { draft: before.draft, published: before.published } : null,
      { body, revision },
    );
    return { version: (before?.version ?? 0) + 1, revision };
  });
}
