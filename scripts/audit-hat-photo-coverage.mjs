// Public catalog evidence only. Never implies access to owner-published DB calibration.
import { readFileSync, writeFileSync, statSync } from "node:fs";
const photos = JSON.parse(readFileSync("src/data/crown-calibrations.json")).records;
const displays = JSON.parse(readFileSync("src/data/hat-display-images.json")).records;
const stages = JSON.parse(readFileSync("src/data/hat-stage-renditions.json")).records;
const active = photos.filter((p) => p.modelId !== "112PM"),
  rows = [];
const header = [
  "model",
  "photo_id",
  "colorway_id",
  "base_width",
  "base_height",
  "best_source_width",
  "best_source_height",
  "source_bytes",
  "responsive_derivatives",
  "static_reference",
  "detail_state",
  "provenance",
];
for (const p of active) {
  const source = displays.find((d) => d.calibrationId === p.id),
    width = source?.width ?? p.sourceWidth,
    height = source?.height ?? p.sourceHeight;
  rows.push([
    p.modelId,
    p.id,
    p.colorway,
    p.sourceWidth,
    p.sourceHeight,
    width,
    height,
    statSync("public" + (source?.imageUrl ?? p.imageUrl)).size,
    stages.find((r) => r.calibrationId === p.id)?.renditions.length ?? 0,
    "estimated; no measured reference",
    Math.min(width, height) < 600
      ? "REPLACE: detail limited"
      : "native detail available; measure crown",
    p.provenance ?? "",
  ]);
}
const csv = (row) => row.map((value) => '"' + String(value).replaceAll('"', '""') + '"').join(",");
writeFileSync("docs/HAT_PHOTO_COVERAGE.csv", [header, ...rows].map(csv).join("\n") + "\n");
const byModel = [...new Set(active.map((p) => p.modelId))].map((id) => {
  const values = rows.filter((row) => row[0] === id);
  return `| ${id} | ${values.length} | ${values.filter((row) => row[8] > 0).length} | ${values.filter((row) => String(row[10]).startsWith("REPLACE")).length} | 0 |`;
});
writeFileSync(
  "docs/HAT_PHOTO_AUDIT.md",
  `# Exact-photo audit\n\nGenerated from retained repository assets with \`node scripts/audit-hat-photo-coverage.mjs\`. This is static catalog evidence; owner-published production calibration requires separately authorized database verification.\n\n| Exact model | Active front photos | Responsive originals | Limited-detail originals | Static measured references |\n|---|---:|---:|---:|---:|\n${byModel.join("\n")}\n\n${active.length} active front photos; ${photos.length - active.length} historical 112PM entries excluded from public sales and new renditions. Full exact-photo IDs, decoded pixels and provenance are in [HAT_PHOTO_COVERAGE.csv](HAT_PHOTO_COVERAGE.csv). Low-detail sources must be replaced by owner-verified, higher-resolution photographs of the same model/colorway.\n\nThe front renderer uses canonical nominal inches, per-photo crown geometry and a retained, immutable source coordinate system. Without a measured reference, it uses the explicit 7.5-inch crown estimate; visual bounds are not physical measurements. Side/rear reference photos have no calibrated patch overlay. The obsolete percentage sizes no longer render current hat previews. Historical snapshots and coordinates remain stored unchanged.\n\nResponsive derivatives resize the retained exact full-resolution photograph without upscaling or changing its crop. Selection follows painted CSS width × device density × zoom. Original identity/hash/calibration stays authoritative, and missing/wrong-size renditions fall back to the identical canonical photo. Low-detail sources disable extra zoom. No new photos, materials, views or services are manufactured.\n\nSynthetic measured-reference crop fixtures test the mathematics only. They are not measurements of actual hats. Actual physical accuracy remains unverified until the owner supplies known reference lengths for each published photo.\n`,
);
console.log(
  JSON.stringify({
    activePhotos: active.length,
    limitedSources: rows.filter((r) => String(r[10]).startsWith("REPLACE")).length,
    staticMeasuredReferences: 0,
  }),
);
