import exclusions from "@/data/excluded-media.json";

export const EXCLUDED_MEDIA_MD5 = exclusions.records.flatMap((r) => r.md5);

/** Exact known sources only; no filename, hat model, or logo guesses. */
export function isExcludedMediaSource(driveId: string | undefined, sha256?: string) {
  return exclusions.records.some(
    (r) =>
      (driveId !== undefined && r.driveIds.includes(driveId)) ||
      (sha256 !== undefined && r.sha256.includes(sha256)),
  );
}
