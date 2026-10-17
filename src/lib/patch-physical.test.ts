import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Calibration, Point } from "./crown-geometry.ts";
import {
  defaultPhotoGeometry,
  physicalProjection,
  mountedVector,
  unmountedVector,
  geometryFromBoundary,
  geometrySignature,
  photoGeometryIssues,
  referenceMeasurement,
  isConvexPolygon,
  patchFits,
  constrainPatch,
} from "./patch-physical.ts";

const records = JSON.parse(
  readFileSync(new URL("../data/crown-calibrations.json", import.meta.url), "utf8"),
).records as Calibration[];
const close = (actual: number, expected: number, message = "projection") =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} versus ${expected}`);

test("measured reference scale accounts for rotation/shear/compression exactly once, including diagonal markers", () => {
  // Synthetic ruler geometry exercises arithmetic; these are NOT measurements
  // of any real catalog hat and must never be published as physical evidence.
  for (const model of ["112", "112FP", "256"]) {
    const photo = records.find((p) => p.modelId === model)!;
    for (const vector of [
      { x: 3, y: 0 },
      { x: 1.8, y: 2.4 },
    ]) {
      const geometry = {
        ...defaultPhotoGeometry(photo),
        rotation: -8,
        skew: 11,
        compression: 0.72,
      };
      const observed = mountedVector({ x: vector.x * 90, y: vector.y * 90 }, geometry);
      geometry.reference = {
        start: { x: 0.3, y: 0.3 },
        end: { x: 0.3 + observed.x / photo.sourceWidth, y: 0.3 + observed.y / photo.sourceHeight },
        inches: 3,
      };
      close(
        referenceMeasurement(photo, geometry)!.pixelsPerInch,
        90,
        "unprojected reference pixels/inch",
      );
      for (const scale of [1, 0.39, 1.4]) {
        const patch = physicalProjection({ width: 3, height: 2 }, photo, geometry, {
          x: 17,
          y: 23,
          width: photo.sourceWidth * scale,
          height: photo.sourceHeight * scale,
        });
        close(patch.width, 270 * scale);
        close(patch.height, 180 * scale);
        const mounted = mountedVector(
          { x: (vector.x * patch.width) / 3, y: (vector.y * patch.width) / 3 },
          geometry,
        );
        close(mounted.x, observed.x * scale, "reference span after mounting");
        close(mounted.y, observed.y * scale, "reference span after mounting");
      }
    }
  }
});

test("affine mount and inverse round-trip both coordinates across supported orientation controls", () => {
  for (const rotation of [-20, 0, 20])
    for (const skew of [-20, 0, 20])
      for (const compression of [0.65, 0.85, 1]) {
        const geometry = { rotation, skew, compression };
        for (const vector of [
          { x: 100, y: 0 },
          { x: 0, y: 75 },
          { x: -120, y: 55 },
        ]) {
          const restored = unmountedVector(mountedVector(vector, geometry), geometry);
          close(restored.x, vector.x);
          close(restored.y, vector.y);
        }
      }
});

test("unversioned frozen order geometry keeps legacy reference projection and identity", () => {
  const photo = records[0],
    geometry = defaultPhotoGeometry(photo);
  delete geometry.projectionVersion;
  geometry.compression = 0.7;
  geometry.reference = { start: { x: 0.3, y: 0.3 }, end: { x: 0.55, y: 0.3 }, inches: 3 };
  const frozen = JSON.stringify(geometry);
  const oldProjection = physicalProjection({ width: 3, height: 2 }, photo, geometry, {
    x: 0,
    y: 0,
    width: photo.sourceWidth,
    height: photo.sourceHeight,
  });
  close(oldProjection.width, 0.25 * photo.sourceWidth, "legacy snapshot base width");
  const historicalSignature = JSON.stringify([
    geometry.imageVersion,
    [geometry.bounds.x, geometry.bounds.y, geometry.bounds.width, geometry.bounds.height],
    geometry.polygon.map((p) => [p.x, p.y]),
    [geometry.anchor.x, geometry.anchor.y],
    [0.3, 0.3, 0.55, 0.3, 3],
    0,
    0,
    0.7,
  ]);
  assert.equal(geometrySignature(geometry), historicalSignature);
  const corrected = { ...geometry, projectionVersion: 2 as const };
  const updated = physicalProjection({ width: 3, height: 2 }, photo, corrected, {
    x: 0,
    y: 0,
    width: photo.sourceWidth,
    height: photo.sourceHeight,
  });
  close(updated.width * 0.7, 0.25 * photo.sourceWidth, "corrected visible span");
  assert.notEqual(geometrySignature(corrected), historicalSignature);
  assert.equal(JSON.stringify(geometry), frozen, "projection never modifies frozen order geometry");
});

test("a new source-coordinate boundary expands beyond the old crop and preserves its physical reference", () => {
  const geometry = defaultPhotoGeometry(records[0]);
  geometry.reference = { start: { x: 0.35, y: 0.4 }, end: { x: 0.6, y: 0.4 }, inches: 3 };
  const points = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.85 },
    { x: 0.1, y: 0.85 },
  ];
  const updated = geometryFromBoundary(points, geometry);
  assert.ok(updated.bounds.x < geometry.bounds.x);
  assert.ok(updated.bounds.width > geometry.bounds.width);
  close(updated.bounds.x, 0.1);
  close(updated.bounds.width, 0.8);
  assert.deepEqual(updated.reference, geometry.reference);
  const source = (p: Point, g: typeof geometry) => ({
    x: g.bounds.x + p.x * g.bounds.width,
    y: g.bounds.y + p.y * g.bounds.height,
  });
  const before = source(geometry.anchor, geometry),
    after = source(updated.anchor, updated);
  close(before.x, after.x);
  close(before.y, after.y);
  assert.deepEqual(updated.polygon, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);
  assert.notEqual(updated, geometry);
});

test("a boundary excluding the old anchor chooses an interior point and invalid outlines are rejected", () => {
  const geometry = defaultPhotoGeometry(records[0]);
  const updated = geometryFromBoundary(
    [
      { x: 0.02, y: 0.02 },
      { x: 0.18, y: 0.02 },
      { x: 0.18, y: 0.2 },
      { x: 0.02, y: 0.2 },
    ],
    geometry,
  );
  assert.deepEqual(photoGeometryIssues(records[0], updated), []);
  const star = [0, 2, 4, 1, 3].map((i) => ({
    x: 0.5 + 0.4 * Math.cos((i * Math.PI * 2) / 5),
    y: 0.5 + 0.4 * Math.sin((i * Math.PI * 2) / 5),
  }));
  assert.equal(
    isConvexPolygon(star),
    false,
    "equal turns in a crossing star are not a convex boundary",
  );
  assert.throws(() => geometryFromBoundary(star, geometry), /non-crossing/);
  assert.throws(
    () =>
      geometryFromBoundary(
        [
          { x: 0.1, y: 0.1 },
          { x: 0.11, y: 0.1 },
          { x: 0.11, y: 0.12 },
        ],
        geometry,
      ),
    /5%/,
  );
});

test("reference quality and whole-patch fit are reported before owner publication", () => {
  const photo = records[0],
    g = defaultPhotoGeometry(photo);
  assert.equal(
    referenceMeasurement(photo, g),
    null,
    "visual bounds never become a measured reference",
  );
  const dimensions = physicalProjection({ width: 3, height: 2 }, photo, g, {
    x: 0,
    y: 0,
    width: photo.sourceWidth,
    height: photo.sourceHeight,
  });
  close(
    dimensions.width,
    (g.bounds.width * photo.sourceWidth * 3) / 7.5,
    "explicit conservative estimate",
  );
  const crown = {
    width: g.bounds.width * photo.sourceWidth,
    height: g.bounds.height * photo.sourceHeight,
  };
  const safe = constrainPatch({ x: 3, y: -2 }, g.anchor, dimensions, crown, g);
  assert.ok(patchFits(safe, dimensions, crown, g.polygon));
  g.reference = { start: { x: 0.3, y: 0.3 }, end: { x: 0.301, y: 0.3 }, inches: 3 };
  assert.equal(referenceMeasurement(photo, g)!.valid, false);
  assert.ok(photoGeometryIssues(photo, g).some((issue) => issue.includes("20 source pixels")));
});
