import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
export async function validateHatDisplayImages(root = process.cwd()) {
  const base = JSON.parse(readFileSync(resolve(root, "src/data/crown-calibrations.json"))),
    manifest = JSON.parse(readFileSync(resolve(root, "src/data/hat-display-images.json"))),
    byId = new Map(base.records.map((r) => [r.id, r]));
  const errors = [],
    seen = new Set();
  let bytes = 0;
  if (manifest.version !== 1 || !Array.isArray(manifest.records))
    throw Error("Unsupported display-image manifest.");
  for (const r of manifest.records) {
    try {
      const photo = byId.get(r.calibrationId);
      if (!photo) throw Error("Unknown exact calibration.");
      if (seen.has(r.calibrationId)) throw Error("Duplicate photo rendition.");
      seen.add(r.calibrationId);
      if (
        r.assetId !== photo.assetId ||
        r.modelId !== photo.modelId ||
        r.baseSha256 !== photo.sha256 ||
        r.baselineSourceSha256 !== photo.sourceSha256
      )
        throw Error("Exact model/source/base identity mismatch.");
      if (
        !/^[a-f0-9]{64}$/.test(r.sha256) ||
        !/^[a-f0-9]{64}$/.test(r.sourceSha256) ||
        r.imageUrl !== `/assets/hat-display/${r.sha256}.webp`
      )
        throw Error("Invalid immutable rendition identity.");
      const file = resolve(root, "public" + r.imageUrl),
        buffer = readFileSync(file),
        m = await sharp(buffer).metadata();
      if (createHash("sha256").update(buffer).digest("hex") !== r.sha256)
        throw Error("Rendition bytes changed.");
      if (
        m.format !== "webp" ||
        m.width !== r.width ||
        m.height !== r.height ||
        r.width <= photo.sourceWidth ||
        r.height <= photo.sourceHeight
      )
        throw Error("Resolution is not a verified larger image.");
      if (
        Math.abs(r.width * photo.sourceHeight - r.height * photo.sourceWidth) >
        Math.max(r.width, r.height)
      )
        throw Error("Framing/aspect ratio changed.");
      if (m.exif || m.xmp || m.iptc || m.orientation)
        throw Error("Public rendition contains unnecessary photo metadata.");
      if (r.bytes !== statSync(file).size || r.bytes > 3_000_000)
        throw Error("Rendition byte budget mismatch.");
      if (
        !Number.isFinite(r.comparisonMeanRgbDifference) ||
        r.comparisonMeanRgbDifference < 0 ||
        r.comparisonMeanRgbDifference > 3
      )
        throw Error("Source visual comparison missing or invalid.");
      const proof = r.baselineProof;
      if (proof?.method === "decoded-calibration-pixels") {
        if (
          !Number.isSafeInteger(proof.changedChannels) ||
          proof.changedChannels < 0 ||
          proof.changedChannels > 4 ||
          !Number.isSafeInteger(proof.maximumChange) ||
          proof.maximumChange < 0 ||
          proof.maximumChange > 1 ||
          !/^[a-f0-9]{64}$/.test(proof.currentSourceSha256)
        )
          throw Error("Baseline source proof exceeded isolated rounding tolerance.");
      } else if (proof?.method !== "original-source-sha256") {
        throw Error("Verified baseline source proof is required.");
      }
      bytes += buffer.length;
    } catch (error) {
      errors.push(r.calibrationId + ": " + error.message);
    }
  }
  for (const photo of base.records)
    if (photo.sourceWidth >= 800 && !seen.has(photo.id))
      errors.push(photo.id + ": missing verified larger display rendition.");
  return {
    records: manifest.records.length,
    limited: base.records.filter((r) => Math.min(r.sourceWidth, r.sourceHeight) < 600).length,
    bytes,
    errors,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateHatDisplayImages();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
