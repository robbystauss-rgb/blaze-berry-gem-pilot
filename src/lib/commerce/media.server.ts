import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { assertPermission, audit } from "./core.server";
import { decodeArtwork } from "./checkout.server";
import type { Role } from "./types";
import { MAX_NEW_UPLOAD_DATA_URL_LENGTH } from "@/lib/upload-limits";
import { assertMediaOriginalAllowed } from "./media-policy.server";
import { EXCLUDED_MEDIA_MD5 } from "@/lib/media-policy";
export type MediaRow = {
  id: string;
  name: string;
  alt: string;
  tags: string[];
  width: number;
  height: number;
  version: number;
  created_at: string;
  original_size: number;
  references: { scope: string; key: string }[];
};
export async function mediaLibrary() {
  const sql = await getSql();
  return sql<MediaRow>`select m.id,m.name,m.alt,m.tags,m.width,m.height,m.version,m.created_at,octet_length(m.original) as original_size,
   coalesce((select jsonb_agg(jsonb_build_object('scope',d.scope,'key',d.key)) from commerce_documents d where d.scope in ('gallery','storefront') and (d.draft::text like '%'||m.id||'%' or d.published::text like '%'||m.id||'%')),'[]'::jsonb) as references
   from commerce_media m where not m.archived order by m.created_at desc limit 500`;
}
export async function uploadMedia(raw: unknown, actor: { userId: string; role: Role }) {
  assertPermission(actor.role, "website");
  return processUpload(raw, actor);
}
export async function uploadCatalogPhoto(raw: unknown, actor: { userId: string; role: Role }) {
  assertPermission(actor.role, "products");
  return processUpload(raw, actor);
}
async function processUpload(raw: unknown, actor: { userId: string; role: Role }) {
  const p = z
    .object({
      name: z.string().trim().min(1).max(180),
      data: z.string().max(MAX_NEW_UPLOAD_DATA_URL_LENGTH, "Upload a photo up to 3 MB."),
      alt: z.string().trim().max(250),
    })
    .parse(raw);
  const file = decodeArtwork(p.data);
  if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.mime))
    throw Error("Upload a PNG, JPG or WebP photo, up to 3 MB.");
  assertMediaOriginalAllowed(file.bytes);
  const image = sharp(file.bytes, {
    limitInputPixels: 24_000_000,
    animated: false,
    failOn: "error",
  });
  const meta = await image.metadata();
  if (!meta.width || !meta.height || (meta.pages && meta.pages > 1))
    throw Error("Choose a single image, up to 24 megapixels.");
  const { data: bytes, info } = await image
    .rotate()
    .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  const thumbnail = await sharp(bytes)
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const sql = await getSql(),
    id = randomUUID();
  await sql.transaction(async (tx) => {
    await tx`insert into commerce_assets(id,mime,bytes,actor_id) values(${id},'image/webp',${bytes},${actor.userId})`;
    const safeName = Array.from(p.name, (c) =>
      c.charCodeAt(0) < 32 || c === "/" || c === "\\" ? "_" : c,
    ).join("");
    await tx`insert into commerce_media(id,name,original,original_mime,thumbnail,width,height,alt) values(${id},${safeName},${file.bytes},${file.mime},${thumbnail},${info.width},${info.height},${p.alt})`;
    await audit(tx, actor.userId, "media.uploaded", "asset", id, null, {
      name: p.name,
      width: info.width,
      height: info.height,
    });
  });
  return { id, url: "/api/media/" + id };
}
export async function editMedia(raw: unknown, actor: { userId: string; role: Role }) {
  assertPermission(actor.role, "website");
  const p = z
    .object({
      id: z.string().uuid(),
      version: z.number().int().min(1),
      alt: z.string().trim().max(250),
      tags: z.array(z.string().trim().max(40)).max(20),
      archive: z.boolean().default(false),
      crop: z
        .object({
          left: z.number().min(0).max(0.95),
          top: z.number().min(0).max(0.95),
          width: z.number().min(0.05).max(1),
          height: z.number().min(0.05).max(1),
        })
        .nullable()
        .default(null),
      rotation: z.number().min(-180).max(180).default(0),
    })
    .parse(raw);
  const sql = await getSql();
  await sql.transaction(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('media-publishing'))`;
    const [m] = await tx<{
      original: Uint8Array;
      version: number;
    }>`select * from commerce_media where id=${p.id} and not archived for update`;
    if (!m || m.version !== p.version) throw Error("Photo changed. Refresh before editing.");
    if (p.archive) {
      const refs =
        await tx`select key from commerce_documents where scope in ('gallery','storefront') and (draft::text like ${"%" + p.id + "%"} or published::text like ${"%" + p.id + "%"})`;
      const products =
        await tx`select id from commerce_products where images @> ${JSON.stringify(["/api/media/" + p.id])}::jsonb or images @> ${JSON.stringify(["/api/catalog-image/" + p.id])}::jsonb`;
      if (refs.length || products.length)
        throw Error("This photo is in use. Remove its references before archiving.");
    }
    if (p.crop || p.rotation) {
      let pipeline = sharp(Buffer.from(m.original), { limitInputPixels: 24_000_000 }).rotate();
      const oriented = await pipeline.toBuffer();
      pipeline = sharp(oriented);
      if (p.crop) {
        const meta = await pipeline.metadata(),
          c = p.crop;
        if (c.left + c.width > 1.000001 || c.top + c.height > 1.000001)
          throw Error("Crop must stay inside the image.");
        pipeline = pipeline.extract({
          left: Math.floor(c.left * meta.width!),
          top: Math.floor(c.top * meta.height!),
          width: Math.max(1, Math.floor(c.width * meta.width!)),
          height: Math.max(1, Math.floor(c.height * meta.height!)),
        });
      }
      const bytes = await pipeline
        .rotate(p.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 88 })
        .toBuffer();
      const meta = await sharp(bytes).metadata();
      const thumb = await sharp(bytes)
        .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
        .webp()
        .toBuffer();
      await tx`update commerce_assets set bytes=${bytes} where id=${p.id}`;
      await tx`update commerce_media set thumbnail=${thumb},width=${meta.width},height=${meta.height} where id=${p.id}`;
    }
    await tx`update commerce_media set alt=${p.alt},tags=${JSON.stringify(p.tags)},archived=${p.archive},version=version+1 where id=${p.id}`;
    await audit(
      tx,
      actor.userId,
      p.archive ? "media.archived" : "media.edited",
      "asset",
      p.id,
      { version: m.version },
      { alt: p.alt, tags: p.tags, crop: p.crop, rotation: p.rotation },
    );
  });
}
export async function mediaIsPublished(id: string) {
  const sql = await getSql();
  const [row] = await sql<{
    published: boolean;
  }>`select (exists(select 1 from commerce_documents d where
    (d.scope='gallery' and d.published->>'consent'='true' and d.published->>'archived'='false' and d.published->'mediaIds' @> ${JSON.stringify([id])}::jsonb)
    or (d.scope='storefront' and d.published->>'heroMediaId'=${id}))
    or exists(select 1 from commerce_products p where p.state='active' and (p.publish_at is null or p.publish_at<=now()) and p.images @> ${JSON.stringify(["/api/media/" + id])}::jsonb))
    and not exists(select 1 from commerce_media m where m.id=${id} and md5(m.original)=any(${EXCLUDED_MEDIA_MD5}::text[])) as published`;
  return !!row?.published;
}
