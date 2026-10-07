import data from "@/data/crown-calibrations.json";
import { validateCalibration, type Calibration } from "./crown-geometry";

const manifest = data as { version: number; records: Calibration[] };
if (manifest.version !== 1 || !Array.isArray(manifest.records)) throw new Error("Invalid crown calibration manifest");
const records = manifest.records;
const byAsset = new Map<string, Calibration>();
for (const record of records) {
  validateCalibration(record);
  const key = `${record.modelId}|${record.assetId}`;
  if (byAsset.has(key)) throw new Error(`Duplicate crown calibration: ${key}`);
  byAsset.set(key, record);
}

/** Asset IDs are exact catalog identities, never a model-wide fallback. */
export function crownCalibration(modelId: string, assetId: string | undefined): Calibration | null {
  return assetId ? byAsset.get(`${modelId}|${assetId}`) ?? null : null;
}
