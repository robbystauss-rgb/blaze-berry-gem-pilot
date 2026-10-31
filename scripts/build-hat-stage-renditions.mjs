// Real exact-photo derivatives only. No upscaling, sharpening, model substitution
// or changes to the original calibration/source identities.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
const source = JSON.parse(readFileSync("src/data/hat-display-images.json", "utf8"));
const output = "public/assets/hat-stage";
mkdirSync(output, { recursive: true });
// Generated public delivery files are reproducible build outputs. Retained full
// photographs and the provenance manifest remain the source of truth in Git.
const previousPath = "src/data/hat-stage-renditions.json";
if (existsSync(previousPath)) {
  const previous = JSON.parse(readFileSync(previousPath));
  const active = source.records.filter((record) => record.modelId !== "112PM");
  if (
    previous.version === 1 &&
    previous.records.length === active.length &&
    active.every((record) => {
      const row = previous.records.find((value) => value.calibrationId === record.calibrationId);
      return (
        row?.sourceSha256 === record.sha256 &&
        row.renditions.every((image) => existsSync("public" + image.imageUrl))
      );
    })
  ) {
    console.log(
      "Exact-photo stage derivatives already generated; build validation checks bytes and dimensions.",
    );
    process.exit(0);
  }
}
const records = [];
const queue = source.records.filter((r) => r.modelId !== "112PM");
await Promise.all(
  Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const original = queue.shift(),
        bytes = readFileSync("public" + original.imageUrl);
      if (createHash("sha256").update(bytes).digest("hex") !== original.sha256)
        throw Error("Exact-photo source hash mismatch.");
      const metadata = await sharp(bytes).metadata();
      if (metadata.width !== original.width || metadata.height !== original.height)
        throw Error("Exact-photo source dimensions changed.");
      const renditions = [];
      for (const width of [600, 1200, 1800, 2400].filter((w) => w < original.width)) {
        const { data, info } = await sharp(bytes)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 91, effort: 5 })
          .toBuffer({ resolveWithObject: true });
        const sha256 = createHash("sha256").update(data).digest("hex"),
          imageUrl = `/assets/hat-stage/${sha256}.webp`;
        if (!existsSync("public" + imageUrl)) writeFileSync("public" + imageUrl, data);
        renditions.push({
          imageUrl,
          sha256,
          width: info.width,
          height: info.height,
          bytes: data.length,
          sourceSha256: original.sha256,
        });
      }
      records.push({
        calibrationId: original.calibrationId,
        sourceSha256: original.sha256,
        renditions,
      });
    }
  }),
);
records.sort((a, b) => a.calibrationId.localeCompare(b.calibrationId));
writeFileSync(
  "src/data/hat-stage-renditions.json",
  JSON.stringify(
    {
      version: 1,
      source:
        "Verified identical calibrated photographs, resized from retained high-resolution WebP renditions. No source upscaling, sharpening or photo substitution.",
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    exactPhotos: records.length,
    derivatives: records.reduce((n, r) => n + r.renditions.length, 0),
    bytes: records.reduce((n, r) => n + r.renditions.reduce((s, d) => s + d.bytes, 0), 0),
  }),
);
