import manifest from "@/data/hat-display-images.json";
import stageManifest from "@/data/hat-stage-renditions.json";
import type { Calibration } from "./crown-geometry";
import {
  matchingHatDisplayImage,
  matchingHatStageImages,
  selectHatStageImage,
  type HatDisplayImage,
} from "./hat-image-quality";
const byPhoto = new Map(
  (manifest.records as HatDisplayImage[]).map((record) => [record.calibrationId, record]),
);
export function hatDisplayImage(photo: Calibration | null | undefined) {
  return matchingHatDisplayImage(photo, photo ? byPhoto.get(photo.id) : undefined);
}
const stages = new Map(stageManifest.records.map((record) => [record.calibrationId, record]));
export function hatStageImages(photo: Calibration | null | undefined) {
  const source = hatDisplayImage(photo),
    row = photo ? stages.get(photo.id) : undefined;
  return row && row.sourceSha256 === source?.sha256
    ? matchingHatStageImages(source, row.renditions)
    : [];
}
export function hatStageImage(
  photo: Calibration | null | undefined,
  cssWidth: number,
  pixelRatio: number,
  zoom: boolean,
) {
  return selectHatStageImage(
    hatDisplayImage(photo),
    hatStageImages(photo),
    cssWidth,
    pixelRatio,
    zoom,
  );
}
