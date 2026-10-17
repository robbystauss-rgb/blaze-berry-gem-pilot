// Operator-side import only; no public upload endpoint or executable manifest fields.
// Reuses the existing private media library, publishing permissions and audit trail.
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { assertPermission, audit } from "./core.server";
import type { Role } from "./types";
import { assertMediaOriginalAllowed } from "./media-policy.server";

export async function importReviewedPhoto(
  input: {
    name: string;
    alt: string;
    source: string;
    tags: string[];
    mime: string;
    bytes: Uint8Array;
  },
  actor: { userId: string; role: Role },
) {
  assertPermission(actor.role, "website");
  const p = z
    .object({
      name: z.string().trim().min(1).max(180),
      alt: z.string().trim().min(1).max(250),
      source: z.string().trim().min(1).max(1000),
      tags: z.array(z.string().trim().max(40)).max(20),
      mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
    })
    .parse(input);
  const original = Buffer.from(input.bytes);
  if (!original.length || original.length > 25_000_000)
    throw Error("Reviewed photos must be at most 25 MB.");
  assertMediaOriginalAllowed(original);
  const image = sharp(original, { limitInputPixels: 24_000_000, failOn: "error", animated: false });
  const meta = await image.metadata();
  const expected = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" }[p.mime];
  if (meta.format !== expected || !meta.width || !meta.height || (meta.pages && meta.pages > 1))
    throw Error("Original does not match its declared single-image format.");
  const digest = createHash("sha256").update(original).digest("hex");
  const { data: bytes, info } = await image
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 93 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(bytes)
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  const sql = await getSql();
  return sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${"media-original:" + digest}))`;
    // Match original bytes across all sources, including previously uploaded media.
    const [existing] = await tx<{
      id: string;
      archived: boolean;
    }>`select id,archived from commerce_media where original=${original} limit 1`;
    if (existing) return { id: existing.id, duplicate: true, archived: existing.archived };
    const id = randomUUID(),
      name = Array.from(p.name, (c) =>
        c.charCodeAt(0) < 32 || c === "/" || c === "\\" ? "_" : c,
      ).join("");
    await tx`insert into commerce_assets(id,mime,bytes,actor_id) values(${id},'image/webp',${bytes},${actor.userId})`;
    await tx`insert into commerce_media(id,name,original,original_mime,thumbnail,width,height,alt,tags) values(${id},${name},${original},${p.mime},${thumbnail},${info.width},${info.height},${p.alt},${JSON.stringify(p.tags)})`;
    await audit(tx, actor.userId, "media.reviewed_import", "asset", id, null, {
      name,
      source: p.source,
      originalSha256: digest,
      originalWidth: meta.width,
      originalHeight: meta.height,
      public: false,
    });
    return { id, duplicate: false, archived: false };
  });
}
