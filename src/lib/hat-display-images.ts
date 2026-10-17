import manifest from "@/data/hat-display-images.json";
import type { Calibration } from "./crown-geometry";
import { matchingHatDisplayImage, type HatDisplayImage } from "./hat-image-quality";
const byPhoto = new Map(
  (manifest.records as HatDisplayImage[]).map((record) => [record.calibrationId, record]),
);
export function hatDisplayImage(photo: Calibration | null | undefined) {
  return matchingHatDisplayImage(photo, photo ? byPhoto.get(photo.id) : undefined);
}
