import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { validateHatDisplayImages } from "./validate-hat-display-images.mjs";
let root, record, bytes, manifest;
const base = {
  id: "112:test@" + "a".repeat(12),
  modelId: "112",
  assetId: "approved-test-file",
  sha256: "a".repeat(64),
  sourceSha256: "c".repeat(64),
  sourceWidth: 16,
  sourceHeight: 12,
};
function write(records) {
  writeFileSync(
    join(root, "src/data/hat-display-images.json"),
    JSON.stringify({ version: 1, records }),
  );
}
before(async () => {
  root = mkdtempSync(join(tmpdir(), "rec-hat-display-"));
  mkdirSync(join(root, "src/data"), { recursive: true });
  mkdirSync(join(root, "public/assets/hat-display"), { recursive: true });
  bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#ccc" } })
    .webp()
    .toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex");
  record = {
    calibrationId: base.id,
    modelId: base.modelId,
    assetId: base.assetId,
    baseSha256: base.sha256,
    baselineSourceSha256: base.sourceSha256,
    sourceSha256: "d".repeat(64),
    imageUrl: "/assets/hat-display/" + hash + ".webp",
    sha256: hash,
    width: 32,
    height: 24,
    bytes: bytes.length,
    comparisonMeanRgbDifference: 0.1,
    baselineProof: { method: "original-source-sha256" },
  };
  manifest = join(root, "public" + record.imageUrl);
  writeFileSync(manifest, bytes);
  writeFileSync(
    join(root, "src/data/crown-calibrations.json"),
    JSON.stringify({ records: [base] }),
  );
});
after(() => {
  if (!resolve(root).startsWith(resolve(tmpdir(), "rec-hat-display-")))
    throw Error("Unsafe fixture cleanup target.");
  rmSync(root, { recursive: true });
});
test("accepts an immutable larger same-photo frame with stripped metadata and checked byte budget", async () => {
  write([record]);
  assert.deepEqual((await validateHatDisplayImages(root)).errors, []);
});
test("rejects changed product identity, framing, file hashes and traversal paths", async () => {
  for (const change of [
    { modelId: "112FP" },
    { baseSha256: "e".repeat(64) },
    { width: 31 },
    { imageUrl: "/assets/hat-display/../../private" },
    { comparisonMeanRgbDifference: 20 },
    { comparisonMeanRgbDifference: -1 },
    { baselineProof: null },
    { baselineProof: { method: "decoded-calibration-pixels" } },
    { baselineProof: { method: "unverified" } },
  ]) {
    write([{ ...record, ...change }]);
    assert.ok((await validateHatDisplayImages(root)).errors.length);
  }
  write([record]);
  writeFileSync(manifest, Buffer.concat([bytes, Buffer.from("tampered")]));
  assert.ok((await validateHatDisplayImages(root)).errors.length);
  writeFileSync(manifest, bytes);
});
test("rejects duplicate mappings, unproven source drift and missing large-photo coverage", async () => {
  write([record, record]);
  assert.ok((await validateHatDisplayImages(root)).errors.length);
  write([
    {
      ...record,
      baselineProof: { method: "decoded-calibration-pixels", changedChannels: 5, maximumChange: 1 },
    },
  ]);
  assert.ok((await validateHatDisplayImages(root)).errors.length);
  writeFileSync(
    join(root, "src/data/crown-calibrations.json"),
    JSON.stringify({ records: [{ ...base, sourceWidth: 1200, sourceHeight: 1000 }] }),
  );
  write([]);
  assert.match((await validateHatDisplayImages(root)).errors[0], /missing verified/);
});
