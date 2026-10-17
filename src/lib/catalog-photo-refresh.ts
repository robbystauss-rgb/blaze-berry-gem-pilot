import manifest from "@/data/catalog-photo-refresh.json";

/** Product photography has its own identity; never reuse its framing for calibration. */
export function refreshedCatalogPhoto(modelId: string, colorwayId: string | undefined) {
  return (
    manifest.records.find((r) => r.modelId === modelId && r.colorwayId === colorwayId)?.imageUrl ??
    null
  );
}
