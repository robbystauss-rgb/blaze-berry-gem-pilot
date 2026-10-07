import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const MODEL_IDS = new Set(["112", "112FP", "112FPR", "112P", "112PM", "112PFP", "168", "168P", "256", "256P"]);
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

export function selectableFrontAssets(catalog, patches) {
  return catalog.models.flatMap((raw) => {
    const model = { ...raw, ...patches.models?.[raw.id] };
    return model.bucket === "ready" ? model.colorways.filter((color) => color.views?.front).map((color) => ({ modelId: model.id, colorway: color.id, assetId: color.views.front })) : [];
  });
}

/** Normalized source-image coordinates, top-left origin; no display pixels. */
export function validateCalibrationMetadata(data, assets) {
  const errors = [];
  if (data?.version !== 1) errors.push("Unsupported calibration file version");
  if (!data?.coordinateSystem || !/normalized/i.test(data.coordinateSystem)) errors.push("Missing normalized coordinate-system documentation");
  if (!Array.isArray(data?.records)) return [...errors, "Calibration records must be an array"];
  const expected = new Map(assets.map((asset) => [asset.colorway, asset]));
  const ids = new Set();
  const colors = new Set();
  const imageRefs = new Set();
  for (const record of data.records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push("Calibration records must be objects");
      continue;
    }
    const label = record.colorway ?? record.id ?? "unknown record";
    const fail = (message) => errors.push(`${label}: ${message}`);
    if (typeof record.id !== "string" || !record.id || ids.has(record.id)) fail("missing or duplicate calibration ID");
    ids.add(record.id);
    if (colors.has(record.colorway)) fail("duplicate colorway calibration");
    colors.add(record.colorway);
    if (!MODEL_IDS.has(record.modelId)) fail("unknown exact Richardson model identity");
    const asset = expected.get(record.colorway);
    if (!asset) fail("not a currently selectable colorway");
    else if (asset.modelId !== record.modelId || asset.assetId !== record.assetId) fail("calibration does not match exact catalog model/asset identity");
    for (const key of ["sourceWidth", "sourceHeight"]) if (!Number.isSafeInteger(record[key]) || record[key] <= 0) fail(`${key} must be a positive integer`);
    for (const key of ["sha256", "sourceSha256"]) if (!SHA256.test(record[key] ?? "")) fail(`invalid ${key}`);
    if (record.imageUrl !== `/assets/crown/${record.sha256}.webp`) fail("immutable snapshot URL must contain its exact SHA-256 identity");
    if (imageRefs.has(record.imageUrl)) fail("snapshot reused across exact catalog assets");
    imageRefs.add(record.imageUrl);
    if (!record.id?.endsWith(`@${record.sha256?.slice(0, 12)}`)) fail("calibration ID must be bound to snapshot hash");
    if (typeof record.provenance !== "string" || record.provenance.length < 20) fail("missing photographic calibration provenance");
    const bounds = record.bounds;
    if (!bounds || ["x", "y", "width", "height"].some((key) => !Number.isFinite(bounds[key]))) fail("bounds must contain four finite numbers");
    else if (bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > 1 + 1e-9 || bounds.y + bounds.height > 1 + 1e-9) fail("crown bounds must be positive and stay within normalized image space");
  }
  for (const asset of assets) if (!colors.has(asset.colorway)) errors.push(`${asset.colorway}: missing exact-asset crown calibration`);
  return errors;
}

export function webpDimensions(bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw new Error("Not a WebP image");
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) throw new Error("Truncated WebP chunk");
    if (kind === "VP8X" && size >= 10) return { width: 1 + bytes.readUIntLE(start + 4, 3), height: 1 + bytes.readUIntLE(start + 7, 3) };
    if (kind === "VP8L" && size >= 5 && bytes[start] === 0x2f) {
      const bits = bytes.readUInt32LE(start + 1);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
    }
    offset = start + size + (size % 2);
  }
  throw new Error("No lossless WebP dimensions found");
}

export async function validateCrownCalibrations({ root = process.cwd(), sourceCache, verifyRemote = false } = {}) {
  const read = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  const data = read("src/data/crown-calibrations.json");
  const assets = selectableFrontAssets(read("src/data/master-catalog.json"), read("src/data/catalog-patches.json"));
  const errors = validateCalibrationMetadata(data, assets);
  let checkedSources = 0;
  for (const record of data.records ?? []) {
    if (!record || typeof record !== "object") continue;
    if (!/^\/assets\/crown\/[a-f0-9]{64}\.webp$/.test(record.imageUrl ?? "")) continue;
    const file = path.join(root, "public", record.imageUrl);
    try {
      const bytes = fs.readFileSync(file);
      if (hash(bytes) !== record.sha256) errors.push(`${record.colorway}: immutable calibrated photograph changed`);
      const dimensions = webpDimensions(bytes);
      if (dimensions.width !== record.sourceWidth || dimensions.height !== record.sourceHeight) errors.push(`${record.colorway}: snapshot dimensions differ from calibrated source`);
    } catch (error) { errors.push(`${record.colorway}: ${error.message}`); }
    try {
      let source;
      if (record.assetId.startsWith("/assets/hats/")) source = fs.readFileSync(path.join(root, "public", record.assetId));
      else if (sourceCache) source = fs.readFileSync(path.join(sourceCache, `${record.colorway.replace(":", "__")}.jpg`));
      else if (verifyRemote) {
        const response = await fetch(`https://lh3.googleusercontent.com/d/${record.assetId}=w1200`);
        if (!response.ok) throw new Error(`Source photography returned HTTP ${response.status}`);
        source = Buffer.from(await response.arrayBuffer());
      }
      if (source) {
        checkedSources++;
        if (hash(source) !== record.sourceSha256) errors.push(`${record.colorway}: original source photograph changed; recalibration required`);
      }
    } catch (error) { errors.push(`${record.colorway}: source verification failed: ${error.message}`); }
  }
  const snapshotDir = path.join(root, "public/assets/crown");
  const referencedSnapshots = new Set((data.records ?? []).filter((record) => record && typeof record.imageUrl === "string").map((record) => path.basename(record.imageUrl)));
  if (fs.existsSync(snapshotDir)) for (const file of fs.readdirSync(snapshotDir)) {
    if (!referencedSnapshots.has(file)) errors.push(`Unreferenced calibrated snapshot file: ${file}`);
  }
  return { errors, calibratedAssets: data.records?.length ?? 0, selectableAssets: assets.length, checkedSources };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cacheFlag = process.argv.indexOf("--source-cache");
  const result = await validateCrownCalibrations({ sourceCache: cacheFlag >= 0 ? process.argv[cacheFlag + 1] : undefined, verifyRemote: process.argv.includes("--verify-remote") });
  if (result.errors.length) {
    console.error("Crown calibration validation FAILED");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else console.log(`Crown calibration validation passed: ${result.calibratedAssets}/${result.selectableAssets} exact selectable assets, immutable snapshot hashes and dimensions verified; ${result.checkedSources} original sources verified.`);
}
