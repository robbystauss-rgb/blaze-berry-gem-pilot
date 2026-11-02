// Resize the retained approved logo; preserve original bytes and full framing.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const original = "/brand/rec-mama-made-louisiana-logo.jpeg";
const bytes = readFileSync("public" + original);
const metadata = await sharp(bytes).metadata();
const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
mkdirSync("public/assets/brand", { recursive: true });
const images = [];
for (const width of [128, 256, 512, 768, 1024].filter((w) => w < metadata.width)) {
  const { data, info } = await sharp(bytes)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 90, effort: 5 })
    .toBuffer({ resolveWithObject: true });
  const sha256 = createHash("sha256").update(data).digest("hex");
  const imageUrl = `/assets/brand/${sha256}.webp`;
  writeFileSync("public" + imageUrl, data);
  images.push({ imageUrl, sha256, width: info.width, height: info.height, bytes: data.length });
}
writeFileSync(
  "src/data/brand-renditions.json",
  JSON.stringify(
    {
      version: 1,
      original,
      sourceSha256,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      images,
    },
    null,
    2,
  ) + "\n",
);
console.log("Approved logo delivery derivatives generated; original unchanged.");
