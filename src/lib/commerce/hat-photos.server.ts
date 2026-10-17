import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getSql, type Sql } from "@/lib/db";
import { MASTER } from "@/lib/studio-store";
import { assertPermission, audit } from "./core.server";
import type { Calibration } from "@/lib/crown-geometry";
import type { Role } from "./types";
import type { PhotoGeometry } from "@/lib/patch-physical";
import { isRetiredHatModel } from "@/lib/catalog-lifecycle";
import { assertMediaPublicationAllowed } from "./media-policy.server";
type PhotoRow = {
  id: string;
  model_id: string;
  colorway: string;
  asset_id: string;
  image_url: string;
  sha256: string;
  width: number;
  height: number;
  provenance: string;
};
function descriptor(p: PhotoRow, publicView = false): Calibration {
  return {
    id: p.id,
    modelId: p.model_id,
    colorway: p.colorway,
    assetId: p.asset_id,
    imageUrl: p.image_url,
    sourceWidth: p.width,
    sourceHeight: p.height,
    sha256: p.sha256,
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    provenance: publicView
      ? `Owner-verified front photograph for exact Richardson ${p.model_id} variant ${p.colorway}.`
      : p.provenance,
  };
}
export async function ownerHatPhotos() {
  const sql = await getSql();
  return (
    await sql<PhotoRow>`select * from commerce_hat_photos order by created_at desc limit 500`
  ).map((p) => descriptor(p));
}
export async function exactHatPhoto(id: string, tx?: Sql) {
  const sql = tx ?? (await getSql());
  const [row] = await sql<PhotoRow>`select * from commerce_hat_photos where id=${id}`;
  return row ? descriptor(row) : null;
}
export async function registerHatPhoto(raw: unknown, actor: { userId: string; role: Role }) {
  assertPermission(actor.role, "website");
  const p = z
    .object({
      modelId: z.string().max(12),
      colorway: z.string().max(180),
      mediaId: z.string().uuid(),
      verified: z.literal(true),
      provenance: z.string().trim().min(10).max(1000),
    })
    .parse(raw);
  const model = MASTER.models.find((m) => m.id === p.modelId),
    color = model?.colorways.find((c) => c.id === p.colorway);
  if (!color || model?.bucket !== "ready")
    throw Error(
      "Choose an exact existing, ready model and colorway. This operation does not create missing variants or views.",
    );
  const sql = await getSql(),
    assetId = randomUUID(),
    id = "uploaded:" + randomUUID();
  await sql.transaction(async (tx) => {
    await assertMediaPublicationAllowed(tx, [p.mediaId]);
    const [m] = await tx<{
      bytes: Uint8Array;
      width: number;
      height: number;
    }>`select a.bytes,m.width,m.height from commerce_media m join commerce_assets a on a.id=m.id where m.id=${p.mediaId} and not m.archived for share of a,m`;
    if (!m) throw Error("Choose an available uploaded photograph.");
    const hash = createHash("sha256").update(m.bytes).digest("hex");
    await tx`insert into commerce_assets(id,mime,bytes,actor_id) values(${assetId},'image/webp',${m.bytes},${actor.userId})`;
    await tx`insert into commerce_hat_photos(id,model_id,colorway,asset_id,image_url,sha256,width,height,provenance,actor_id) values(${id},${p.modelId},${p.colorway},${assetId},${"/api/catalog-image/" + assetId},${hash},${m.width},${m.height},${p.provenance},${actor.userId})`;
    await audit(tx, actor.userId, "hat_photo.registered", "hat_photo", id, null, {
      modelId: p.modelId,
      colorway: p.colorway,
      sourceMediaId: p.mediaId,
      view: "front",
      sha256: hash,
      provenance: p.provenance,
    });
  });
  return (await exactHatPhoto(id))!;
}
export async function publishedHatPhoto(modelId: string, colorway: string) {
  if (isRetiredHatModel(modelId)) return null;
  const sql = await getSql();
  const [p] = await sql<
    PhotoRow & { published: PhotoGeometry }
  >`select p.*,d.published from commerce_hat_photos p join commerce_documents d on d.scope='calibration' and d.key=p.id where p.model_id=${modelId} and p.colorway=${colorway} and d.published is not null order by d.updated_at desc limit 1`;
  return p ? { photo: descriptor(p, true), geometry: p.published } : null;
}
