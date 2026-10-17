import type { Calibration } from "./crown-geometry.ts";

export type HatDisplayImage = {
  calibrationId: string;
  modelId: string;
  assetId: string;
  baseSha256: string;
  imageUrl: string;
  sha256: string;
  width: number;
  height: number;
};
/** A larger rendering is allowed only for the identical calibrated photograph.
 * It never becomes a new calibration/order identity or supplies another view.
 */
export function matchingHatDisplayImage(
  photo: Calibration | null | undefined,
  candidate: HatDisplayImage | undefined,
) {
  if (!photo || !candidate) return null;
  const c = candidate;
  return c.calibrationId === photo.id &&
    c.modelId === photo.modelId &&
    c.assetId === photo.assetId &&
    c.baseSha256 === photo.sha256 &&
    /^[a-f0-9]{64}$/.test(c.sha256) &&
    c.imageUrl === `/assets/hat-display/${c.sha256}.webp` &&
    Number.isSafeInteger(c.width) &&
    Number.isSafeInteger(c.height) &&
    c.width > photo.sourceWidth &&
    c.height > photo.sourceHeight &&
    Math.abs(c.width * photo.sourceHeight - c.height * photo.sourceWidth) <=
      Math.max(c.width, c.height)
    ? c
    : null;
}
export function hatImageDimensionsMatch(
  photo: Calibration,
  display: HatDisplayImage | null,
  width: number,
  height: number,
) {
  return (
    (width === photo.sourceWidth && height === photo.sourceHeight) ||
    (!!display && width === display.width && height === display.height)
  );
}
export function limitedPhotoDetail(width: number, height: number) {
  return width > 0 && height > 0 && Math.min(width, height) < 600;
}
/** Only request larger renditions of the same already-selected Drive view. */
export function detailedDriveView(
  src: string | null,
  boxWidth: number,
  pixelRatio: number,
  zoom: boolean,
) {
  if (!src || !/^https:\/\/lh3\.googleusercontent\.com\/d\/[A-Za-z0-9_-]+=w1200$/.test(src))
    return src;
  const required =
    Number.isFinite(boxWidth) && Number.isFinite(pixelRatio)
      ? Math.max(0, boxWidth) * Math.min(4, Math.max(1, pixelRatio)) * (zoom ? 1.35 : 1)
      : 1200;
  const width = [1200, 1600, 2400, 3200].find((size) => size >= required) ?? 3200;
  return src.replace(/=w1200$/, `=w${width}`);
}
