import { z } from "zod";
import type { PaymentBuild } from "@/lib/payments";
import { stageFrontCalibration } from "@/lib/stage-photos";
import { isFrontPlacement } from "@/lib/crown-geometry";
import {
  physicalPatch,
  defaultPhotoGeometry,
  physicalProjection,
  patchFits,
  geometrySignature,
  type PhotoGeometry,
} from "@/lib/patch-physical";
import { publishedDocument } from "./publishing.server";
export async function previewSnapshot(build: PaymentBuild) {
  const dimensions = physicalPatch(build.patchShape, build.patchSize);
  if (build.orderType !== "hat" || !isFrontPlacement(build.placement))
    return {
      version: 3,
      physicalInches: dimensions,
      scaleStatus: "uncalibrated-view",
      productionIntent: "Confirm placement and fit in digital proof",
    };
  const base = stageFrontCalibration(build.family, build.colorway);
  if (!base)
    throw Error("Exact product photograph needs calibration before this preview can be saved.");
  const replacement = await (
    await import("./hat-photos.server")
  ).publishedHatPhoto(base.modelId, base.colorway);
  const photo = replacement?.photo ?? base;
  const saved =
    replacement?.geometry ?? (await publishedDocument<PhotoGeometry>("calibration", photo.id));
  const geometry = saved?.imageVersion === photo.sha256 ? saved : defaultPhotoGeometry(photo);
  if (build.previewVersion === 3) {
    const expected = z
      .object({
        photoId: z.string().max(240),
        imageVersion: z.string().length(64),
        geometrySignature: z.string().max(6000),
      })
      .parse(build.expectedPreview);
    if (
      expected.photoId !== photo.id ||
      expected.imageVersion !== photo.sha256 ||
      expected.geometrySignature !== geometrySignature(geometry)
    )
      throw Error(
        "The hat photograph or calibration changed. Reload the builder and review its preview before checkout.",
      );
  }
  const position = build.previewPlacement?.position;
  const anchor = position
    ? z
        .object({
          version: z.literal(2),
          anchor: z.object({ x: z.number().finite(), y: z.number().finite() }),
        })
        .parse(position).anchor
    : geometry.anchor;
  const projected = physicalProjection(dimensions, photo, geometry, {
    x: 0,
    y: 0,
    width: photo.sourceWidth,
    height: photo.sourceHeight,
  });
  if (
    !patchFits(
      anchor,
      projected,
      {
        width: geometry.bounds.width * photo.sourceWidth,
        height: geometry.bounds.height * photo.sourceHeight,
      },
      geometry.polygon,
      geometry.rotation,
      geometry.skew,
      geometry.compression,
    )
  )
    throw Error(
      "Patch extends beyond the usable crown. Adjust the placement or choose a smaller size.",
    );
  return {
    version: 3,
    photo,
    geometry,
    physicalInches: dimensions,
    anchor,
    exactVariantId: photo.colorway,
    scaleStatus: geometry.reference ? "owner-reference" : "estimated",
    productionIntent:
      "Unmodified original artwork; physical dimensions in inches; placement confirmed in digital proof",
  };
}
