/** All source/crown coordinates start at top-left; x right, y down.
 * Source and crown-local points are unitless. Display rectangles use CSS pixels.
 * Anchors can be outside [0,1]: free placement is not confined to the crown.
 */
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Dimensions = { width: number; height: number };
export type CrownPosition = { version: 2; anchor: Point };
export type FrontPlacement = "front-center" | "left-front" | "right-front";
export type PatchSize = "small" | "medium" | "large";
export type Calibration = {
  id: string;
  modelId: string;
  colorway: string;
  assetId: string;
  imageUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  sha256: string;
  bounds: Rect;
  provenance: string;
};

/** Visual frame width / calibrated crown width. These are not inch measurements.
 * Existing product dimension labels remain nominal production specifications.
 * There are no measured physical crown widths in the supplied catalog.
 */
export const PATCH_CROWN_WIDTH = { small: 0.32, medium: 0.42, large: 0.52 } as const;
export const DEFAULT_ANCHORS: Record<FrontPlacement, Point> = {
  "front-center": { x: 0.5, y: 0.5 },
  "left-front": { x: 0.28, y: 0.52 },
  "right-front": { x: 0.72, y: 0.52 },
};
export const LEGACY_PLACEMENTS = {
  "front-center": { x: 0.5, y: 0.44 },
  "left-front": { x: 0.37, y: 0.46 },
  "right-front": { x: 0.63, y: 0.46 },
  side: { x: 0.62, y: 0.44 },
  rear: { x: 0.5, y: 0.4 },
} as const;

function positive(value: number) { return Number.isFinite(value) && value > 0; }
export function validateCalibration(record: Calibration): void {
  const b = record.bounds;
  if (!record.id || !record.modelId || !record.assetId || !record.provenance ||
      !/^\/assets\/crown\/[a-f0-9]{64}\.(jpg|jpeg|png|webp)$/.test(record.imageUrl) ||
      !/^[a-f0-9]{64}$/.test(record.sha256) || !record.imageUrl.includes(record.sha256) ||
      !positive(record.sourceWidth) || !positive(record.sourceHeight) || !b ||
      !Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < 0 || b.y < 0 ||
      !positive(b.width) || !positive(b.height) || b.x + b.width > 1 || b.y + b.height > 1) {
    throw new Error(`Invalid crown calibration: ${record.id || "unknown"}`);
  }
}
export function isCrownPosition(value: unknown): value is CrownPosition {
  if (!value || typeof value !== "object") return false;
  const p = value as CrownPosition;
  return p.version === 2 && !!p.anchor && Number.isFinite(p.anchor.x) && Number.isFinite(p.anchor.y);
}
export function isFrontPlacement(value: string): value is FrontPlacement {
  return Object.hasOwn(DEFAULT_ANCHORS, value);
}
export function patchAspectRatio(shape: string): number {
  // Preserve the existing preview silhouettes and masking; hats cannot alter shape.
  return shape === "Circle" ? 1 : shape === "Oval" ? 1.45 : 1.35;
}

/** Rectangle occupied by the actual source image, including any negative crop offsets.
 * objectPosition uses fractions of leftover space, matching CSS object-position.
 */
export function fittedImageRect(source: Dimensions, box: Rect, fit: "contain" | "cover" = "contain", objectPosition: Point = { x: 0.5, y: 0.5 }): Rect | null {
  if (!positive(source.width) || !positive(source.height) || !positive(box.width) || !positive(box.height)) return null;
  const factor = (fit === "contain" ? Math.min : Math.max)(box.width / source.width, box.height / source.height);
  const width = source.width * factor;
  const height = source.height * factor;
  return { x: box.x + (box.width - width) * objectPosition.x, y: box.y + (box.height - height) * objectPosition.y, width, height };
}
export function sourceToDisplay(point: Point, image: Rect): Point {
  return { x: image.x + point.x * image.width, y: image.y + point.y * image.height };
}
export function displayToSource(point: Point, image: Rect): Point {
  return { x: (point.x - image.x) / image.width, y: (point.y - image.y) / image.height };
}
export function crownToSource(point: Point, crown: Rect): Point {
  return { x: crown.x + point.x * crown.width, y: crown.y + point.y * crown.height };
}
export function sourceToCrown(point: Point, crown: Rect): Point {
  return { x: (point.x - crown.x) / crown.width, y: (point.y - crown.y) / crown.height };
}
export function crownToDisplay(point: Point, crown: Rect, image: Rect): Point {
  return sourceToDisplay(crownToSource(point, crown), image);
}
export function displayToCrown(point: Point, crown: Rect, image: Rect): Point {
  return sourceToCrown(displayToSource(point, image), crown);
}
export function displayCrownRect(crown: Rect, image: Rect): Rect {
  return { ...sourceToDisplay(crown, image), width: crown.width * image.width, height: crown.height * image.height };
}
export function patchDimensions(size: PatchSize, aspect: number, crown: Rect, image: Rect, scale = 1): Dimensions {
  if (!positive(aspect) || !positive(scale)) throw new Error("Invalid patch aspect or scale");
  const width = crown.width * image.width * PATCH_CROWN_WIDTH[size] * scale;
  return { width, height: width / aspect };
}
export function legacyToCrown(offset: Point, placement: FrontPlacement, container: Dimensions, crown: Rect, image: Rect): CrownPosition {
  const base = LEGACY_PLACEMENTS[placement];
  return { version: 2, anchor: displayToCrown({ x: (base.x + offset.x / 100) * container.width, y: (base.y + offset.y / 100) * container.height }, crown, image) };
}
/** Only gestures are constrained by the existing +/-18%, +/-14% stage travel.
 * Never clamp on projection/model changes; that would cause cumulative drift.
 * A previously outlying anchor stays reachable without jumping on pointerdown.
 */
export function dragAnchor(start: Point, delta: Point, container: Dimensions, crown: Rect, image: Rect, placement: FrontPlacement = "front-center"): Point {
  const origin = crownToDisplay(start, crown, image);
  const base = crownToDisplay(DEFAULT_ANCHORS[placement], crown, image);
  const x = Math.min(Math.max(base.x + container.width * 0.18, origin.x), Math.max(Math.min(base.x - container.width * 0.18, origin.x), origin.x + delta.x));
  const y = Math.min(Math.max(base.y + container.height * 0.14, origin.y), Math.max(Math.min(base.y - container.height * 0.14, origin.y), origin.y + delta.y));
  return displayToCrown({ x, y }, crown, image);
}
