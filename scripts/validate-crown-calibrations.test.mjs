import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectableFrontAssets, validateCalibrationMetadata } from "./validate-crown-calibrations.mjs";

const sha256 = "a".repeat(64);
const asset = { modelId: "112", colorway: "112:black", assetId: "exact-112-black-front" };
const record = {
  id: `112:black@${sha256.slice(0, 12)}`,
  ...asset,
  imageUrl: `/assets/crown/${sha256}.webp`,
  sourceWidth: 1000,
  sourceHeight: 800,
  sha256,
  sourceSha256: "b".repeat(64),
  bounds: { x: 0.2, y: 0.15, width: 0.6, height: 0.45 },
  provenance: "Front crown bounds inspected against exact catalog photograph.",
};
const manifest = { version: 1, coordinateSystem: "Normalized source-image coordinates, top-left origin", records: [record] };

describe("crown calibration metadata gate", () => {
  it("accepts a complete exact-asset manifest", () => {
    assert.deepEqual(validateCalibrationMetadata(manifest, [asset]), []);
  });

  it("uses the current catalog overlay and keeps unavailable models out", () => {
    const catalog = { models: [
      { id: "112", bucket: "ready", colorways: [{ id: "112:black", views: { front: "112-front" } }] },
      { id: "112PM", bucket: "missing", colorways: [] },
      { id: "168P", bucket: "missing", colorways: [] },
    ] };
    const patches = { models: { "112PM": { bucket: "ready", colorways: [{ id: "112PM:camo", views: { front: "112PM-front" } }] } } };
    assert.deepEqual(selectableFrontAssets(catalog, patches), [
      { modelId: "112", colorway: "112:black", assetId: "112-front" },
      { modelId: "112PM", colorway: "112PM:camo", assetId: "112PM-front" },
    ]);
  });

  it("rejects unversioned data, undocumented coordinates and missing records", () => {
    for (const invalid of [{ ...manifest, version: 2 }, { ...manifest, coordinateSystem: "pixels" }, { version: 1 }, { ...manifest, records: [] }]) {
      assert.ok(validateCalibrationMetadata(invalid, [asset]).length > 0);
    }
  });

  it("detects stale assets, borrowed model identities and unselectable colorways", () => {
    for (const patch of [{ assetId: "other-photo" }, { modelId: "112FP" }, { modelId: "999" }, { colorway: "112:unavailable" }]) {
      assert.ok(validateCalibrationMetadata({ ...manifest, records: [{ ...record, ...patch }] }, [asset]).length > 0, JSON.stringify(patch));
    }
  });

  it("rejects missing, duplicate or reused calibration identities", () => {
    for (const patch of [{ id: "" }, { id: "unbound-ID" }, { imageUrl: "/assets/crown/replacement.webp" }]) {
      assert.ok(validateCalibrationMetadata({ ...manifest, records: [{ ...record, ...patch }] }, [asset]).length > 0);
    }
    assert.ok(validateCalibrationMetadata({ ...manifest, records: [record, { ...record }] }, [asset]).some((error) => /duplicate|reused/.test(error)));
  });

  it("rejects invalid source metadata and out-of-image crown bounds", () => {
    const patches = [
      { sourceWidth: 0 }, { sourceWidth: 1.2 }, { sourceHeight: Infinity },
      { sha256: "bad" }, { sourceSha256: "" }, { provenance: "" },
      { bounds: { ...record.bounds, x: -0.01 } }, { bounds: { ...record.bounds, y: NaN } },
      { bounds: { ...record.bounds, width: 0 } }, { bounds: { ...record.bounds, height: -0.1 } },
      { bounds: { ...record.bounds, x: 0.7 } }, { bounds: { ...record.bounds, y: 0.7 } },
    ];
    for (const patch of patches) {
      assert.ok(validateCalibrationMetadata({ ...manifest, records: [{ ...record, ...patch }] }, [asset]).length > 0, JSON.stringify(patch));
    }
  });
});
