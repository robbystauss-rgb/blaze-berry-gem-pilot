// Immutable derivative checks run in the build; no remote assets or credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
const sources = JSON.parse(readFileSync("src/data/hat-display-images.json")).records;
const manifest = JSON.parse(readFileSync("src/data/hat-stage-renditions.json"));
assert.equal(manifest.version, 1);
const ids = new Set();
let count = 0,
  bytes = 0;
for (const row of manifest.records) {
  assert.ok(!ids.has(row.calibrationId));
  ids.add(row.calibrationId);
  const source = sources.find((record) => record.calibrationId === row.calibrationId);
  assert.ok(source && source.modelId !== "112PM", "active exact source required");
  assert.equal(row.sourceSha256, source.sha256);
  for (const image of row.renditions) {
    assert.equal(image.sourceSha256, source.sha256);
    assert.match(image.sha256, /^[a-f0-9]{64}$/);
    assert.equal(image.imageUrl, `/assets/hat-stage/${image.sha256}.webp`);
    const original = readFileSync("public" + image.imageUrl),
      meta = await sharp(original).metadata();
    assert.equal(createHash("sha256").update(original).digest("hex"), image.sha256);
    assert.equal(original.length, image.bytes);
    assert.equal(meta.width, image.width);
    assert.equal(meta.height, image.height);
    assert.ok(image.width < source.width && image.height < source.height, "no upscaling");
    assert.ok(
      Math.abs(image.width * source.height - image.height * source.width) <=
        Math.max(source.width, source.height),
      "unchanged framing",
    );
    count++;
    bytes += image.bytes;
  }
}
assert.equal(ids.size, sources.filter((source) => source.modelId !== "112PM").length);
console.log(
  JSON.stringify({
    verifiedExactPhotos: ids.size,
    derivatives: count,
    totalBytes: bytes,
    retired112PMAdded: false,
  }),
);
