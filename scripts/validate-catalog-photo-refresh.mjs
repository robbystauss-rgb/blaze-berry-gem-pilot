import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import sharp from "sharp";
const manifest = JSON.parse(readFileSync("src/data/catalog-photo-refresh.json"));
const catalog = JSON.parse(readFileSync("src/data/catalog-patches.json")).models;
const hash = (b) => createHash("sha256").update(b).digest("hex");
const seen = new Set();
for (const r of manifest.records) {
  assert.equal(r.modelId, "168P");
  assert.equal(r.role, "catalog-photo-only");
  const color = catalog[r.modelId].colorways.find((c) => c.id === r.colorwayId);
  assert.ok(color, "Exact model/color must already exist");
  assert.equal(color.officialName, r.sourceLabel);
  assert.ok(!seen.has(r.colorwayId));
  seen.add(r.colorwayId);
  for (const path of [r.imageUrl, r.sourceImageUrl])
    assert.match(path, /^\/assets\/catalog-refresh\/[a-f0-9]{64}\.(png|webp)$/);
  const source = readFileSync("public" + r.sourceImageUrl),
    bytes = readFileSync("public" + r.imageUrl);
  assert.equal(hash(source), r.sourceSha256);
  assert.equal(hash(bytes), r.sha256);
  const meta = await sharp(bytes).metadata();
  assert.equal(meta.width, r.width);
  assert.equal(meta.height, r.height);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.ok(bytes.length < 250000);
  const expected = await sharp(source).extract(r.crop).webp({ quality: 93 }).toBuffer();
  assert.ok(
    bytes.equals(expected),
    "Crop must be reproducible from the supplied source without editing",
  );
}
assert.equal(manifest.records.length, 5);
console.log(JSON.stringify({ verifiedCatalogPhotos: 5, errors: [] }));
