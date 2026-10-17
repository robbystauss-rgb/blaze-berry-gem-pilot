import { createHash } from "node:crypto";
import type { Sql } from "@/lib/db";
import { EXCLUDED_MEDIA_MD5, isExcludedMediaSource } from "@/lib/media-policy";

export function assertMediaOriginalAllowed(bytes: Uint8Array) {
  if (isExcludedMediaSource(undefined, createHash("sha256").update(bytes).digest("hex")))
    throw Error("This image was rejected for storefront use. Choose an approved photograph.");
}

export async function assertMediaPublicationAllowed(sql: Sql, ids: string[]) {
  if (!ids.length) return;
  // MD5 is only a database lookup for four known byte versions, not an authenticity detector.
  const [blocked] =
    await sql`select id from commerce_media where id=any(${ids}::text[]) and md5(original)=any(${EXCLUDED_MEDIA_MD5}::text[]) limit 1`;
  if (blocked)
    throw Error("This image was rejected for storefront use. Choose an approved photograph.");
}
