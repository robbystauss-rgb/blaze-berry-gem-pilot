import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  crownToDisplay,
  displayCrownRect,
  displayToCrown,
  fittedImageRect,
  patchDimensions,
  validateCalibration,
  type Calibration,
} from "./crown-geometry.ts";

type CatalogColor = { id: string; officialName: string; views: { front?: string } };
type CatalogModel = { id: string; bucket: string; heroDriveId?: string; colorways: CatalogColor[] };
const readJson = (relative: string) => JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
const raw = readJson("../data/master-catalog.json") as { models: CatalogModel[] };
const patches = readJson("../data/catalog-patches.json").models as Record<string, Partial<CatalogModel>>;
// Match the app's Vite catalog overlay, including recovered exact-model images.
const models = raw.models.map((model) => patches[model.id]
  ? { ...model, ...patches[model.id], colorways: patches[model.id].colorways ?? model.colorways ?? [] }
  : model).filter((model) => model.bucket === "ready");
const records = readJson("../data/crown-calibrations.json").records as (Calibration & { sourceSha256: string })[];
const expectedModels = ["112", "112FP", "112FPR", "112P", "112PM", "112PFP", "168", "168P", "256", "256P"].sort();
const EPSILON = 1e-9;
function close(actual: number, expected: number, context: string) {
  assert.ok(Math.abs(actual - expected) <= EPSILON, `${context}: ${actual} ≈ ${expected}`);
}

// The assets are lossless WebP snapshots. Read their dimensions from the
// container header so invalid dimensions are caught without a browser decoder.
function webpDimensions(bytes: Buffer) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunk === "VP8X") return { width: bytes.readUIntLE(data + 4, 3) + 1, height: bytes.readUIntLE(data + 7, 3) + 1 };
    if (chunk === "VP8L") {
      assert.equal(bytes[data], 0x2f);
      const bits = bytes.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    offset = data + length + (length % 2);
  }
  throw new Error("Lossless WebP image dimensions unavailable");
}

describe("exact selectable front-photograph calibration coverage", () => {
  it("covers each exact model/color front asset once without activating another model", () => {
    assert.deepEqual(models.map((model) => model.id).sort(), expectedModels);
    assert.equal(models.reduce((count, model) => count + model.colorways.length, 0), 243);
    const expected = new Set<string>();
    const actual = new Set<string>();
    const ids = new Set<string>();
    for (const record of records) {
      validateCalibration(record);
      const key = `${record.modelId}|${record.assetId}`;
      assert.equal(actual.has(key), false, `Duplicate asset calibration: ${key}`);
      assert.equal(ids.has(record.id), false, `Duplicate calibration ID: ${record.id}`);
      actual.add(key);
      ids.add(record.id);
    }
    for (const model of models) for (const color of model.colorways) {
      assert.ok(color.views.front, `${model.id} ${color.officialName} front photograph`);
      const key = `${model.id}|${color.views.front}`;
      expected.add(key);
      const record = records.find((item) => item.modelId === model.id && item.assetId === color.views.front);
      assert.ok(record, `Missing calibration: ${model.id} ${color.officialName}`);
      assert.equal(record.colorway, color.id, key);
    }
    assert.deepEqual([...actual].sort(), [...expected].sort());
    for (const model of models) {
      const hero = model.heroDriveId ?? model.colorways[0]?.views.front;
      assert.ok(actual.has(`${model.id}|${hero}`), `Missing exact-model hero calibration: ${model.id}`);
    }
  });

  it("binds every record to the actual image bytes and source dimensions", () => {
    for (const record of records) {
      const bytes = readFileSync(new URL(`../../public${record.imageUrl}`, import.meta.url));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), record.sha256, record.id);
      assert.match(record.sourceSha256, /^[a-f0-9]{64}$/, record.id);
      assert.deepEqual(webpDimensions(bytes), { width: record.sourceWidth, height: record.sourceHeight }, record.id);
      assert.ok(record.provenance.trim(), record.id);
    }
  });

  it("contains different photographed framing rather than one shared global rectangle", () => {
    const allBounds = new Set(records.map((record) => JSON.stringify(record.bounds)));
    assert.ok(allBounds.size >= expectedModels.length, "Expected independently calibrated photo framing");
    const varyingModels = models.filter((model) => new Set(records.filter((record) => record.modelId === model.id).map((record) => JSON.stringify(record.bounds))).size > 1);
    assert.ok(varyingModels.length > 0, "Colorway-specific framing must be represented where photography differs");
  });

  it("preserves canonical size ratios, proportions and anchors across all assets and viewport shapes", () => {
    const anchor = { x: 0.73, y: 0.29 };
    const widths = { small: 0.32, medium: 0.42, large: 0.52 } as const;
    for (const record of records) for (const [width, height] of [[320, 460], [460, 320], [768, 520], [1440, 900]]) {
      const image = fittedImageRect({ width: record.sourceWidth, height: record.sourceHeight }, { x: 0, y: 0, width, height })!;
      const crown = displayCrownRect(record.bounds, image);
      for (const size of ["small", "medium", "large"] as const) for (const aspect of [1, 1.35, 1.45]) {
        const patch = patchDimensions(size, aspect, record.bounds, image);
        close(patch.width / crown.width, widths[size], `${record.id} ${size} crown ratio`);
        close(patch.width / patch.height, aspect, `${record.id} ${size} shape ratio`);
      }
      const roundTrip = displayToCrown(crownToDisplay(anchor, record.bounds, image), record.bounds, image);
      close(roundTrip.x, anchor.x, `${record.id} anchor x`);
      close(roundTrip.y, anchor.y, `${record.id} anchor y`);
    }
  });
});
