import type { Calibration, Dimensions, PatchSize, Point, Rect } from "./crown-geometry";

/** Nominal production sizes already offered by this catalog, independent of bitmap padding. */
export function physicalPatch(shape: string, size: PatchSize): Dimensions {
  const n = { small: 0, medium: 1, large: 2 }[size];
  if (shape === "Circle") return { width: [2, 2.5, 3][n], height: [2, 2.5, 3][n] };
  if (shape === "Shield") return { width: [2.25, 2.75, 3][n], height: [2.5, 3, 3.5][n] };
  if (shape === "Hexagon") return { width: [2.25, 2.75, 3.25][n], height: [1.95, 2.38, 2.81][n] };
  return {
    width: [2.5, 3, 3.5][n],
    height: (shape === "Oval" ? [1.75, 2, 2.25] : [1.5, 2, 2.25])[n],
  };
}
export type PhotoGeometry = {
  imageVersion: string;
  bounds: Rect;
  polygon: Point[]; // crown-local usable area, clockwise, convex
  anchor: Point;
  reference: { start: Point; end: Point; inches: number } | null; // source-image coordinates
  rotation: number;
  skew: number;
  compression: number;
};
export function defaultPhotoGeometry(photo: Calibration): PhotoGeometry {
  return {
    imageVersion: photo.sha256,
    bounds: photo.bounds,
    polygon: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    anchor: { x: 0.5, y: 0.5 },
    reference: null,
    rotation: 0,
    skew: 0,
    compression: 1,
  };
}
/** Stable across JSONB key ordering and client/server serialization. */
export function geometrySignature(g: PhotoGeometry): string {
  return JSON.stringify([
    g.imageVersion,
    [g.bounds.x, g.bounds.y, g.bounds.width, g.bounds.height],
    g.polygon.map((p) => [p.x, p.y]),
    [g.anchor.x, g.anchor.y],
    g.reference
      ? [
          g.reference.start.x,
          g.reference.start.y,
          g.reference.end.x,
          g.reference.end.y,
          g.reference.inches,
        ]
      : null,
    g.rotation,
    g.skew,
    g.compression,
  ]);
}
/** Conservative illustrative scale only. Never described as a measured crown width. */
export const ESTIMATED_CROWN_WIDTH_INCHES = 7.5;
export function physicalProjection(
  physical: Dimensions,
  photo: Calibration,
  geometry: PhotoGeometry,
  image: Rect,
): Dimensions {
  const r = geometry.reference;
  const pixelsPerInch = r
    ? ((Math.hypot(
        (r.end.x - r.start.x) * photo.sourceWidth,
        (r.end.y - r.start.y) * photo.sourceHeight,
      ) /
        r.inches) *
        image.width) /
      photo.sourceWidth
    : (geometry.bounds.width * image.width) / ESTIMATED_CROWN_WIDTH_INCHES;
  return { width: physical.width * pixelsPerInch, height: physical.height * pixelsPerInch };
}
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
export function isConvexPolygon(p: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length],
      c = p[(i + 2) % p.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-7) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return !!sign;
}
export function patchFits(
  anchor: Point,
  patch: Dimensions,
  crown: Dimensions,
  polygon: Point[],
  rotation = 0,
  skew = 0,
  compression = 1,
): boolean {
  const angle = (rotation * Math.PI) / 180,
    shear = Math.tan((skew * Math.PI) / 180);
  return [-1, 1].every((x) =>
    [-1, 1].every((y) => {
      const dx = ((x * patch.width) / 2) * compression + (shear * y * patch.height) / 2,
        dy = (y * patch.height) / 2;
      return pointInPolygon(
        {
          x: anchor.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) / crown.width,
          y: anchor.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) / crown.height,
        },
        polygon,
      );
    }),
  );
}
/** Move freely until the entire physical patch reaches the owner-defined boundary. */
export function constrainPatch(
  wanted: Point,
  safe: Point,
  patch: Dimensions,
  crown: Dimensions,
  g: PhotoGeometry,
): Point {
  const fits = (p: Point) =>
    patchFits(p, patch, crown, g.polygon, g.rotation, g.skew, g.compression);
  if (fits(wanted)) return wanted;
  const origin = fits(safe) ? safe : g.anchor;
  if (!fits(origin)) return g.anchor;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const p = { x: origin.x + (wanted.x - origin.x) * t, y: origin.y + (wanted.y - origin.y) * t };
    if (fits(p)) lo = t;
    else hi = t;
  }
  return { x: origin.x + (wanted.x - origin.x) * lo, y: origin.y + (wanted.y - origin.y) * lo };
}
export function dimensionLabel(shape: string, size: PatchSize): string {
  const d = physicalPatch(shape, size);
  return shape === "Circle"
    ? `${d.width}″ diameter`
    : `${d.width}″ × ${d.height}″${shape === "Custom Die-Cut" ? " maximum" : ""}`;
}
