import assert from "node:assert/strict";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const manifest = JSON.parse(readFileSync("src/data/brand-renditions.json"));
const hash = (b) => createHash("sha256").update(b).digest("hex");
assert.equal(hash(readFileSync("public" + manifest.original)), manifest.sourceSha256);
for (const image of manifest.images) {
  const bytes = readFileSync("public" + image.imageUrl),
    meta = await sharp(bytes).metadata();
  assert.equal(hash(bytes), image.sha256);
  assert.equal(meta.width, image.width);
  assert.equal(meta.height, image.height);
  assert.ok(image.width < manifest.sourceWidth);
  assert.ok(
    Math.abs(image.width * manifest.sourceHeight - image.height * manifest.sourceWidth) <=
      manifest.sourceWidth,
  );
  assert.ok(image.bytes < readFileSync("public" + manifest.original).length);
}
assert.ok(
  manifest.images.some((i) => i.width === 768),
  "Phone DPR3 has a sufficient-density rendition",
);
console.log(
  "Approved logo source hash, derivative dimensions, density coverage and framing verified.",
);
