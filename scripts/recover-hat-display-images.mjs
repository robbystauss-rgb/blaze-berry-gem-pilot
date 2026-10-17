// Explicit maintenance only: retrieve larger renditions of the SAME approved
// Drive assets. Frozen calibration/order images are never replaced or rewritten.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { sourcePixelProof } from "./hat-source-pixel-proof.mjs";
if (process.env.REC_FETCH_HAT_ORIGINALS !== "1")
  throw Error("Set REC_FETCH_HAT_ORIGINALS=1 for explicit approved-source recovery.");
const root = process.cwd(),
  manifest = JSON.parse(readFileSync(resolve(root, "src/data/crown-calibrations.json")));
const cache = resolve(root, "artifacts/image-quality/originals"),
  output = resolve(root, "public/assets/hat-display");
mkdirSync(cache, { recursive: true });
mkdirSync(output, { recursive: true });
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function bytesFor(photo, suffix) {
  const filename = resolve(cache, photo.sha256 + "-" + suffix + ".bin");
  if (existsSync(filename)) return readFileSync(filename);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(
        `https://lh3.googleusercontent.com/d/${photo.assetId}=${suffix}`,
        { signal: AbortSignal.timeout(25000) },
      );
      if (!response.ok) throw Error("HTTP " + response.status);
      if (Number(response.headers.get("content-length") || 0) > 20_000_000)
        throw Error("Source exceeds size limit.");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 20_000_000) throw Error("Source exceeds size limit.");
      writeFileSync(filename, buffer);
      return buffer;
    } catch (error) {
      if (attempt) throw error;
    }
  }
}
const result = { records: [], limited: [], errors: [] };
let done = 0;
const previousFile = resolve(root, "src/data/hat-display-images.json");
const previous = new Map(
  (existsSync(previousFile) ? JSON.parse(readFileSync(previousFile)).records : []).map((r) => [
    r.calibrationId,
    r,
  ]),
);
const queue = [...manifest.records];
async function worker() {
  for (;;) {
    const photo = queue.shift();
    if (!photo) return;
    try {
      if (photo.assetId.startsWith("/")) {
        result.limited.push({
          calibrationId: photo.id,
          modelId: photo.modelId,
          colorway: photo.colorway,
          width: photo.sourceWidth,
          height: photo.sourceHeight,
          reason: "Original catalog/PDF source is low resolution; no replacement invented.",
        });
        continue;
      }
      const prior = previous.get(photo.id),
        nativeCache = resolve(cache, photo.sha256 + "-s0.bin");
      const baseline = await bytesFor(photo, "w1200");
      let baselineProof = { method: "original-source-sha256" };
      if (hash(baseline) !== photo.sourceSha256) {
        const current = await sharp(baseline)
          .rotate()
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const approved = await sharp(resolve(root, "public" + photo.imageUrl))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const proof =
          current.info.width === approved.info.width && current.info.height === approved.info.height
            ? sourcePixelProof(current.data, approved.data)
            : null;
        if (!proof)
          throw Error("Approved source has changed; stop and review image/calibration identity.");
        baselineProof = {
          method: "decoded-calibration-pixels",
          ...proof,
          currentSourceSha256: hash(baseline),
        };
      }
      if (
        prior?.baseSha256 === photo.sha256 &&
        prior.assetId === photo.assetId &&
        prior.modelId === photo.modelId &&
        existsSync(resolve(root, "public" + prior.imageUrl)) &&
        hash(readFileSync(resolve(root, "public" + prior.imageUrl))) === prior.sha256 &&
        existsSync(nativeCache) &&
        hash(readFileSync(nativeCache)) === prior.sourceSha256
      ) {
        result.records.push({ ...prior, baselineProof });
        continue;
      }
      const original = await bytesFor(photo, "s0");
      const image = sharp(original, { limitInputPixels: 24_000_000, animated: false }).rotate();
      const { data, info } = await image
        .webp({ quality: 93, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      if (info.width <= photo.sourceWidth || info.height <= photo.sourceHeight) {
        result.limited.push({
          calibrationId: photo.id,
          modelId: photo.modelId,
          colorway: photo.colorway,
          width: info.width,
          height: info.height,
          reason: "No larger original available.",
        });
        continue;
      }
      if (
        Math.abs(info.width * photo.sourceHeight - info.height * photo.sourceWidth) >
        Math.max(info.width, info.height)
      )
        throw Error(
          "Original has different framing/aspect; independent calibration review required.",
        );
      const sample = async (bytes) =>
        sharp(bytes)
          .rotate()
          .flatten({ background: "#fff" })
          .resize(96, 96, { fit: "fill" })
          .removeAlpha()
          .toColourspace("srgb")
          .raw()
          .toBuffer();
      const a = await sample(baseline),
        b = await sample(original);
      const difference = a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
      if (difference > 3)
        throw Error(
          "Original does not visually match the approved photo (mean RGB difference " +
            difference.toFixed(3) +
            ").",
        );
      const sha256 = hash(data),
        path = resolve(output, sha256 + ".webp");
      if (existsSync(path) && hash(readFileSync(path)) !== sha256)
        throw Error("Existing immutable rendition hash mismatch.");
      if (!existsSync(path)) writeFileSync(path, data);
      result.records.push({
        calibrationId: photo.id,
        modelId: photo.modelId,
        assetId: photo.assetId,
        baseSha256: photo.sha256,
        imageUrl: "/assets/hat-display/" + sha256 + ".webp",
        sha256,
        width: info.width,
        height: info.height,
        bytes: data.length,
        sourceSha256: hash(original),
        baselineSourceSha256: photo.sourceSha256,
        baselineProof,
        comparisonMeanRgbDifference: Number(difference.toFixed(6)),
      });
    } catch (error) {
      result.errors.push({ calibrationId: photo.id, error: error.message });
    } finally {
      done++;
      if (done % 10 === 0)
        console.log(
          JSON.stringify({
            processed: done,
            total: manifest.records.length,
            recovered: result.records.length,
            errors: result.errors.length,
          }),
        );
    }
  }
}
await Promise.all(Array.from({ length: 3 }, worker));
result.records.sort((a, b) => a.calibrationId.localeCompare(b.calibrationId));
result.limited.sort((a, b) => a.calibrationId.localeCompare(b.calibrationId));
writeFileSync(
  resolve(root, "artifacts/image-quality/recovery-results.json"),
  JSON.stringify(result, null, 2),
);
// A partial recovery must never replace the last reviewed manifest.
if (result.errors.length) {
  console.error(JSON.stringify({ errors: result.errors, manifestPreserved: true }));
  process.exitCode = 1;
} else {
  const target = resolve(root, "src/data/hat-display-images.json");
  writeFileSync(
    target + ".tmp",
    JSON.stringify(
      {
        version: 1,
        source:
          "Larger original bytes from exact approved Drive asset IDs; canonical calibration photographs unchanged. WebP quality93, no upscaling, sharpening or recoloring.",
        records: result.records,
      },
      null,
      2,
    ) + "\n",
  );
  renameSync(target + ".tmp", target);
}
console.log(
  JSON.stringify({
    recovered: result.records.length,
    limited: result.limited.length,
    errors: result.errors,
    totalBytes: result.records.reduce((n, r) => n + r.bytes, 0),
  }),
);
if (result.errors.length) process.exitCode = 1;
