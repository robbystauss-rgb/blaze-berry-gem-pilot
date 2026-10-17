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
  /** Missing on historical order snapshots: retain their original projection. */
  projectionVersion?: 2;
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
    projectionVersion: 2,
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
  const signature: unknown[] = [
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
  ];
  if (g.projectionVersion === 2) signature.push(2);
  return JSON.stringify(signature);
}
/** Conservative illustrative scale only. Never described as a measured crown width. */
export const ESTIMATED_CROWN_WIDTH_INCHES = 7.5;
/** The same right-to-left scale, shear and rotation used by CSS and Canvas. */
export function mountedVector(
  vector: Point,
  geometry: Pick<PhotoGeometry, "rotation" | "skew" | "compression">,
): Point {
  const angle = (geometry.rotation * Math.PI) / 180;
  const x = vector.x * geometry.compression + Math.tan((geometry.skew * Math.PI) / 180) * vector.y;
  return {
    x: x * Math.cos(angle) - vector.y * Math.sin(angle),
    y: x * Math.sin(angle) + vector.y * Math.cos(angle),
  };
}
export function unmountedVector(
  vector: Point,
  geometry: Pick<PhotoGeometry, "rotation" | "skew" | "compression">,
): Point {
  const angle = (geometry.rotation * Math.PI) / 180;
  const x = vector.x * Math.cos(angle) + vector.y * Math.sin(angle);
  const y = -vector.x * Math.sin(angle) + vector.y * Math.cos(angle);
  return { x: (x - Math.tan((geometry.skew * Math.PI) / 180) * y) / geometry.compression, y };
}
export function referenceMeasurement(photo: Calibration, geometry: PhotoGeometry) {
  if (!geometry.reference) return null;
  const r = geometry.reference;
  const vector = {
    x: (r.end.x - r.start.x) * photo.sourceWidth,
    y: (r.end.y - r.start.y) * photo.sourceHeight,
  };
  const sourcePixels = Math.hypot(vector.x, vector.y);
  const flat = geometry.projectionVersion === 2 ? unmountedVector(vector, geometry) : vector;
  const pixelsPerInch = Math.hypot(flat.x, flat.y) / r.inches;
  return {
    sourcePixels,
    pixelsPerInch,
    valid:
      sourcePixels >= 20 &&
      Number.isFinite(pixelsPerInch) &&
      pixelsPerInch > 0 &&
      r.inches >= 0.25 &&
      r.inches <= 15,
  };
}
/** Source coordinates let a fresh outline expand beyond the previous crop. */
export function geometryFromBoundary(points: Point[], geometry: PhotoGeometry): PhotoGeometry {
  if (
    points.length < 3 ||
    points.length > 12 ||
    !isConvexPolygon(points) ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1,
    )
  )
    throw new Error("Draw 3–12 non-crossing corners around a convex usable area.");
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const bounds = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
  if (bounds.width < 0.05 || bounds.height < 0.05)
    throw new Error("The usable area must span at least 5% of the photograph in each direction.");
  const sourceAnchor = {
    x: geometry.bounds.x + geometry.anchor.x * geometry.bounds.width,
    y: geometry.bounds.y + geometry.anchor.y * geometry.bounds.height,
  };
  const anchor = pointInPolygon(sourceAnchor, points)
    ? sourceAnchor
    : {
        x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
        y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
      };
  return {
    ...geometry,
    bounds,
    polygon: points.map((p) => ({
      x: (p.x - bounds.x) / bounds.width,
      y: (p.y - bounds.y) / bounds.height,
    })),
    anchor: { x: (anchor.x - bounds.x) / bounds.width, y: (anchor.y - bounds.y) / bounds.height },
  };
}
export function photoGeometryIssues(photo: Calibration, geometry: PhotoGeometry): string[] {
  const b = geometry.bounds,
    issues: string[] = [];
  if (
    ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
    b.x < 0 ||
    b.y < 0 ||
    b.width < 0.05 ||
    b.height < 0.05 ||
    b.x + b.width > 1.000001 ||
    b.y + b.height > 1.000001
  )
    issues.push("Keep the usable crown inside the photograph, at least 5% wide and high.");
  if (
    geometry.polygon.length < 3 ||
    geometry.polygon.length > 12 ||
    !isConvexPolygon(geometry.polygon) ||
    geometry.polygon.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)
  )
    issues.push("Use 3–12 non-crossing corners in a convex boundary.");
  if (!pointInPolygon(geometry.anchor, geometry.polygon))
    issues.push("Place the default anchor inside the usable boundary.");
  if (geometry.reference && !referenceMeasurement(photo, geometry)?.valid)
    issues.push("Use a known 0.25–15 inch length and markers at least 20 source pixels apart.");
  if (
    !Number.isFinite(geometry.rotation) ||
    Math.abs(geometry.rotation) > 20 ||
    !Number.isFinite(geometry.skew) ||
    Math.abs(geometry.skew) > 20 ||
    !Number.isFinite(geometry.compression) ||
    geometry.compression < 0.65 ||
    geometry.compression > 1
  )
    issues.push(
      "Keep rotation and shear between −20° and 20°, and horizontal perspective between 0.65 and 1.",
    );
  return issues;
}
export function physicalProjection(
  physical: Dimensions,
  photo: Calibration,
  geometry: PhotoGeometry,
  image: Rect,
): Dimensions {
  const reference = referenceMeasurement(photo, geometry);
  // A photographed reference already includes perspective. Undo the mount
  // transform before deriving scale so compression is not applied twice.
  const pixelsPerInch = reference
    ? (reference.pixelsPerInch * image.width) / photo.sourceWidth
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
  if (p.length < 3 || p.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)))
    return false;
  let sign = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length],
      c = p[(i + 2) % p.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-7) return false;
    if (sign && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
    // A star can have equally signed consecutive turns while crossing itself.
    // Every other vertex must also lie strictly on this edge's interior side.
    for (let j = 0; j < p.length; j++) {
      if (j === i || j === (i + 1) % p.length) continue;
      const side = (b.x - a.x) * (p[j].y - a.y) - (b.y - a.y) * (p[j].x - a.x);
      if (Math.abs(side) < 1e-7 || Math.sign(side) !== sign) return false;
    }
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
  return [-1, 1].every((x) =>
    [-1, 1].every((y) => {
      const offset = mountedVector(
        { x: (x * patch.width) / 2, y: (y * patch.height) / 2 },
        { rotation, skew, compression },
      );
      return pointInPolygon(
        {
          x: anchor.x + offset.x / crown.width,
          y: anchor.y + offset.y / crown.height,
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
