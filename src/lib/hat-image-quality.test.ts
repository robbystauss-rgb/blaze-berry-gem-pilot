import { test } from "node:test";
import assert from "node:assert/strict";
import type { Calibration } from "./crown-geometry.ts";
import {
  matchingHatDisplayImage,
  hatImageDimensionsMatch,
  limitedPhotoDetail,
  detailedDriveView,
  type HatDisplayImage,
} from "./hat-image-quality.ts";
const photo: Calibration = {
  id: "112:black@" + "a".repeat(12),
  modelId: "112",
  colorway: "112:black",
  assetId: "same-exact-file",
  imageUrl: "/assets/crown/" + "a".repeat(64) + ".webp",
  sha256: "a".repeat(64),
  sourceWidth: 1200,
  sourceHeight: 1000,
  bounds: { x: 0.2, y: 0.2, width: 0.6, height: 0.5 },
  provenance: "Exact approved original",
};
const display: HatDisplayImage = {
  calibrationId: photo.id,
  modelId: photo.modelId,
  assetId: photo.assetId,
  baseSha256: photo.sha256,
  imageUrl: "/assets/hat-display/" + "b".repeat(64) + ".webp",
  sha256: "b".repeat(64),
  width: 3000,
  height: 2500,
};
test("larger rendition is bound to exact model, asset, calibration and immutable base hash", () => {
  assert.equal(matchingHatDisplayImage(photo, display), display);
  for (const change of [
    { modelId: "112FP" },
    { assetId: "another-color" },
    { baseSha256: "c".repeat(64) },
    { calibrationId: "another-view" },
    { imageUrl: "https://example.invalid/unverified.jpg" },
    { sha256: "not-a-hash" },
  ])
    assert.equal(matchingHatDisplayImage(photo, { ...display, ...change }), null);
  assert.equal(matchingHatDisplayImage({ ...photo, id: "uploaded:other" }, display), null);
});
test("larger images must preserve framing and genuine resolution; geometry and canonical identity are untouched", () => {
  const before = structuredClone(photo);
  for (const change of [
    { width: 1200, height: 1000 },
    { width: 3000, height: 2400 },
    { width: 0 },
    { height: NaN },
  ])
    assert.equal(matchingHatDisplayImage(photo, { ...display, ...change }), null);
  assert.ok(hatImageDimensionsMatch(photo, display, 3000, 2500));
  assert.ok(hatImageDimensionsMatch(photo, display, 1200, 1000));
  assert.equal(hatImageDimensionsMatch(photo, display, 3000, 2400), false);
  assert.equal(hatImageDimensionsMatch(photo, null, 3000, 2500), false);
  assert.deepEqual(photo, before);
});
test("honest limited-detail classification catches PDF crops without penalizing normal catalog fronts", () => {
  assert.equal(limitedPhotoDetail(227, 149), true);
  assert.equal(limitedPhotoDetail(226, 141), true);
  assert.equal(limitedPhotoDetail(1200, 1500), false);
  assert.equal(limitedPhotoDetail(0, 0), false);
});
test("side/rear view density requests preserve exact asset and host, respect screen/zoom and remain bounded", () => {
  const url = "https://lh3.googleusercontent.com/d/exact-view_ID=w1200";
  assert.equal(detailedDriveView(url, 390, 3, false), url);
  assert.equal(detailedDriveView(url, 390, 3, true), url.replace("1200", "1600"));
  assert.equal(detailedDriveView(url, 900, 2, true), url.replace("1200", "3200"));
  assert.equal(detailedDriveView(url, 99999, 99, true), url.replace("1200", "3200"));
  for (const src of [
    "/assets/crown/exact.webp",
    "https://other.invalid/d/exact-view_ID=w1200",
    "https://lh3.googleusercontent.com/d/exact-view_ID=w360",
    null,
  ])
    assert.equal(detailedDriveView(src, 900, 2, true), src);
});
