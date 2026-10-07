import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_ANCHORS,
  PATCH_CROWN_WIDTH,
  crownToDisplay,
  crownToSource,
  displayCrownRect,
  displayToCrown,
  displayToSource,
  dragAnchor,
  fittedImageRect,
  isCrownPosition,
  isFrontPlacement,
  legacyToCrown,
  patchAspectRatio,
  patchDimensions,
  sourceToCrown,
  sourceToDisplay,
  validateCalibration,
  type Calibration,
  type Point,
  type Rect,
} from "./crown-geometry.ts";

// Pure arithmetic tolerance: 1e-9 CSS pixels or normalized units. Browser
// rendering has a separate subpixel tolerance in the actual-builder QA.
const EPSILON = 1e-9;
function close(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) <= EPSILON, message ?? `${actual} ≈ ${expected}`);
}
function pointClose(actual: Point, expected: Point) {
  close(actual.x, expected.x);
  close(actual.y, expected.y);
}
function rectClose(actual: Rect, expected: Rect) {
  pointClose(actual, expected);
  close(actual.width, expected.width);
  close(actual.height, expected.height);
}

const source = { width: 1000, height: 500 };
const box = { x: 10, y: 20, width: 300, height: 300 };
const crown = { x: 0.2, y: 0.1, width: 0.6, height: 0.4 };
const image = { x: 10, y: 95, width: 300, height: 150 };
const fixture: Calibration = {
  id: "fixture-112-black",
  modelId: "112",
  colorway: "Black",
  assetId: "catalog-112-black-front",
  imageUrl: `/assets/crown/${"a".repeat(64)}.jpg`,
  sourceWidth: source.width,
  sourceHeight: source.height,
  sha256: "a".repeat(64),
  bounds: crown,
  provenance: "Unit-test photographed crown fixture",
};

describe("source, rendered-image, crown and preview coordinates", () => {
  it("accounts for contain letterboxing and container offsets", () => {
    rectClose(fittedImageRect(source, box)!, image);
    rectClose(displayCrownRect(crown, image), { x: 70, y: 110, width: 180, height: 60 });
    pointClose(crownToSource({ x: 0.25, y: 0.75 }, crown), { x: 0.35, y: 0.4 });
    pointClose(crownToDisplay({ x: 0.25, y: 0.75 }, crown, image), { x: 115, y: 155 });
  });

  it("accounts for cover cropping, including negative offsets", () => {
    const cropped = fittedImageRect(source, box, "cover")!;
    rectClose(cropped, { x: -140, y: 20, width: 600, height: 300 });
    pointClose(crownToDisplay({ x: 0.5, y: 0.5 }, crown, cropped), { x: 160, y: 110 });
    pointClose(displayToCrown({ x: 160, y: 110 }, crown, cropped), { x: 0.5, y: 0.5 });
  });

  it("honors object-position when the image is letterboxed or cropped", () => {
    rectClose(fittedImageRect(source, box, "contain", { x: 0, y: 1 })!, { x: 10, y: 170, width: 300, height: 150 });
    rectClose(fittedImageRect(source, box, "cover", { x: 1, y: 0 })!, { x: -290, y: 20, width: 600, height: 300 });
  });

  it("round trips every transform, including anchors outside the crown", () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.123, y: 0.987 }, { x: -0.3, y: 1.25 }];
    for (const fit of ["contain", "cover"] as const) {
      const rendered = fittedImageRect(source, box, fit)!;
      for (const point of points) {
        pointClose(displayToSource(sourceToDisplay(point, rendered), rendered), point);
        pointClose(sourceToCrown(crownToSource(point, crown), crown), point);
        pointClose(displayToCrown(crownToDisplay(point, crown, rendered), crown, rendered), point);
      }
    }
  });

  it("is independent of source resolution", () => {
    for (const factor of [0.25, 2, 10]) {
      const rendered = fittedImageRect({ width: source.width * factor, height: source.height * factor }, box)!;
      rectClose(rendered, image);
      pointClose(crownToDisplay({ x: 0.31, y: 0.67 }, crown, rendered), crownToDisplay({ x: 0.31, y: 0.67 }, crown, image));
    }
  });

  it("represents whitespace and a cropped photograph through calibration", () => {
    const fullImage = { x: 0, y: 0, width: 1000, height: 1000 };
    const fullCrown = { x: 0.2, y: 0.25, width: 0.6, height: 0.3 };
    // Remove 100 source pixels from each edge, then render the cropped image
    // at its original pixel scale. Both photographs describe the same crown.
    const croppedImage = { x: 100, y: 100, width: 800, height: 800 };
    const croppedCrown = { x: 0.125, y: 0.1875, width: 0.75, height: 0.375 };
    rectClose(displayCrownRect(fullCrown, fullImage), displayCrownRect(croppedCrown, croppedImage));
    pointClose(crownToDisplay({ x: 0.7, y: 0.2 }, fullCrown, fullImage), crownToDisplay({ x: 0.7, y: 0.2 }, croppedCrown, croppedImage));
    for (const size of ["small", "medium", "large"] as const) {
      assert.deepEqual(patchDimensions(size, 1.35, fullCrown, fullImage), patchDimensions(size, 1.35, croppedCrown, croppedImage));
    }
  });

  it("defers geometry until both source and preview have dimensions", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.equal(fittedImageRect({ width: value, height: 500 }, box), null);
      assert.equal(fittedImageRect({ width: 1000, height: value }, box), null);
      assert.equal(fittedImageRect(source, { ...box, width: value }), null);
      assert.equal(fittedImageRect(source, { ...box, height: value }), null);
    }
    // The later image-load/resize measurement creates the correct geometry.
    rectClose(fittedImageRect(source, box)!, image);
  });
});

describe("canonical sizes and proportions", () => {
  it("uses one distinct Small / Medium / Large crown-width convention", () => {
    assert.deepEqual(PATCH_CROWN_WIDTH, { small: 0.32, medium: 0.42, large: 0.52 });
    for (const [size, expectedWidth] of [["small", 57.6], ["medium", 75.6], ["large", 93.6]] as const) {
      const dimensions = patchDimensions(size, 1.35, crown, image);
      close(dimensions.width, expectedWidth);
      close(dimensions.width / dimensions.height, 1.35);
    }
  });

  it("preserves the existing silhouette aspect ratios across every size", () => {
    const shapes = { Circle: 1, Oval: 1.45, Rectangle: 1.35, "Rounded Rectangle": 1.35, Hexagon: 1.35, Shield: 1.35, "Custom Die-Cut": 1.35 };
    for (const [shape, aspect] of Object.entries(shapes)) {
      assert.equal(patchAspectRatio(shape), aspect);
      for (const size of ["small", "medium", "large"] as const) {
        const normal = patchDimensions(size, aspect, crown, image);
        const adjusted = patchDimensions(size, aspect, crown, image, 1.2);
        close(normal.width / normal.height, aspect);
        close(adjusted.width / adjusted.height, aspect);
        close(adjusted.width / normal.width, 1.2);
        close(adjusted.height / normal.height, 1.2);
      }
    }
  });

  it("uses crown width alone and never shrinks a tall patch to crown height", () => {
    const shallowCrown = { ...crown, height: 0.01 };
    assert.deepEqual(patchDimensions("large", 1, shallowCrown, image), patchDimensions("large", 1, crown, image));
    assert.ok(patchDimensions("large", 1, shallowCrown, image).height > displayCrownRect(shallowCrown, image).height);
  });

  it("preserves ratios and placement at narrow, portrait, tablet and desktop breakpoints", () => {
    const anchor = { x: 0.73, y: 0.28 };
    for (const [width, height] of [[320, 460], [390, 460], [460, 390], [768, 520], [1024, 720], [1440, 900]]) {
      const rendered = fittedImageRect(source, { x: 0, y: 0, width, height })!;
      for (const size of ["small", "medium", "large"] as const) {
        const patch = patchDimensions(size, 1.45, crown, rendered);
        close(patch.width / displayCrownRect(crown, rendered).width, PATCH_CROWN_WIDTH[size]);
        close(patch.width / patch.height, 1.45);
      }
      pointClose(displayToCrown(crownToDisplay(anchor, crown, rendered), crown, rendered), anchor);
    }
  });

  it("rejects invalid uniform scale and aspect metadata", () => {
    for (const value of [0, -1, NaN, Infinity]) {
      assert.throws(() => patchDimensions("small", value, crown, image));
      assert.throws(() => patchDimensions("small", 1.35, crown, image, value));
    }
  });
});

describe("placement and saved-coordinate compatibility", () => {
  it("projects the same anchor on differing models/colors without progressive drift", () => {
    const anchor = { x: -0.11, y: 0.78 };
    const variants = [
      { crown, image },
      { crown: { x: 0.1, y: 0.15, width: 0.72, height: 0.51 }, image: { x: 30, y: 0, width: 480, height: 600 } },
      { crown: { x: 0.25, y: 0.22, width: 0.43, height: 0.31 }, image: { x: -100, y: 45, width: 780, height: 390 } },
    ];
    let recovered = { ...anchor };
    for (let iteration = 0; iteration < 20; iteration++) for (const variant of variants) {
      recovered = displayToCrown(crownToDisplay(recovered, variant.crown, variant.image), variant.crown, variant.image);
      pointClose(recovered, anchor);
    }
  });

  it("converts legacy container-percent offsets instead of reinterpreting them as crown coordinates", () => {
    const legacy = legacyToCrown({ x: 8, y: -4 }, "front-center", { width: 300, height: 300 }, crown, image);
    assert.equal(legacy.version, 2);
    pointClose(legacy.anchor, { x: 104 / 180, y: 10 / 60 });
    pointClose(crownToDisplay(legacy.anchor, crown, image), { x: 174, y: 120 });
    assert.notEqual(legacy.anchor.x, 8);
    assert.notEqual(legacy.anchor.y, -4);
    // Conversion does not mutate the old stored fields or require a database migration.
    const offset = { x: 8, y: -4 };
    legacyToCrown(offset, "front-center", { width: 300, height: 300 }, crown, image);
    assert.deepEqual(offset, { x: 8, y: -4 });
  });

  it("keeps legacy placement presets distinct during conversion", () => {
    for (const [placement, expected] of [["front-center", { x: 150, y: 132 }], ["left-front", { x: 111, y: 138 }], ["right-front", { x: 189, y: 138 }]] as const) {
      const position = legacyToCrown({ x: 0, y: 0 }, placement, { width: 300, height: 300 }, crown, image);
      pointClose(crownToDisplay(position.anchor, crown, image), expected);
    }
    assert.deepEqual(DEFAULT_ANCHORS["front-center"], { x: 0.5, y: 0.5 });
  });

  it("requires a versioned finite anchor while preserving free placement outside the crown", () => {
    assert.equal(isCrownPosition({ version: 2, anchor: { x: -0.5, y: 1.4 } }), true);
    for (const value of [null, {}, { version: 1, anchor: { x: 0.5, y: 0.5 } }, { patchOffsetX: 8, patchOffsetY: -4 }, { version: 2, anchor: { x: NaN, y: 0.5 } }, { version: 2, anchor: { x: 0.5, y: Infinity } }, { version: 2, anchor: { x: "0.5", y: 0.5 } }]) {
      assert.equal(isCrownPosition(value), false);
    }
    assert.equal(isFrontPlacement("front-center"), true);
    assert.equal(isFrontPlacement("side"), false);
    assert.equal(isFrontPlacement("constructor"), false);
    assert.equal(isFrontPlacement("toString"), false);
  });

  it("maps pointer displacement through crown geometry", () => {
    const start = { x: 0.5, y: 0.5 };
    const moved = dragAnchor(start, { x: 18, y: -12 }, { width: 300, height: 300 }, crown, image);
    pointClose(moved, { x: 0.6, y: 0.3 });
    pointClose(crownToDisplay(moved, crown, image), { x: 178, y: 128 });
  });

  it("retains the existing stage-travel boundary relative to each placement preset", () => {
    const container = { width: 300, height: 300 };
    for (const placement of ["front-center", "left-front", "right-front"] as const) {
      const start = DEFAULT_ANCHORS[placement];
      const upper = dragAnchor(start, { x: 10000, y: 10000 }, container, crown, image, placement);
      const lower = dragAnchor(start, { x: -10000, y: -10000 }, container, crown, image, placement);
      pointClose(upper, { x: start.x + 0.3, y: start.y + 0.7 });
      pointClose(lower, { x: start.x - 0.3, y: start.y - 0.7 });
      // A new gesture cannot progressively accumulate more travel.
      pointClose(dragAnchor(upper, { x: 10000, y: 10000 }, container, crown, image, placement), upper);
    }
  });

  it("never jumps an outlying anchor on pointerdown after a model switch", () => {
    const container = { width: 300, height: 300 };
    const start = { x: -0.5, y: 2 };
    pointClose(dragAnchor(start, { x: 0, y: 0 }, container, crown, image), start);
    pointClose(dragAnchor(start, { x: -100, y: 100 }, container, crown, image), start);
    pointClose(dragAnchor(start, { x: 40, y: -30 }, container, crown, image), { x: -0.5 + 40 / 180, y: 1.5 });
    // Rendering on a new model preserves the canonical anchor even when its
    // projection exceeds that image's gesture boundary.
    const otherCrown = { x: 0.3, y: 0.2, width: 0.4, height: 0.25 };
    pointClose(displayToCrown(crownToDisplay(start, otherCrown, image), otherCrown, image), start);
  });
});

describe("calibration validation", () => {
  it("accepts normalized crown bounds tied to the exact content-addressed image", () => {
    assert.doesNotThrow(() => validateCalibration(fixture));
  });

  it("rejects missing identity/provenance, invalid bounds and stale image identity", () => {
    const invalid: Partial<Calibration>[] = [
      { id: "" }, { modelId: "" }, { assetId: "" }, { provenance: "" },
      { sha256: "bad" }, { imageUrl: `/assets/crown/${"b".repeat(64)}.jpg` },
      { imageUrl: "/assets/replacement.jpg" }, { sourceWidth: 0 }, { sourceHeight: Infinity },
      { bounds: { ...crown, x: -0.01 } }, { bounds: { ...crown, y: NaN } },
      { bounds: { ...crown, width: 0 } }, { bounds: { ...crown, height: -0.1 } },
      { bounds: { ...crown, x: 0.7 } }, { bounds: { ...crown, y: 0.7 } },
    ];
    for (const patch of invalid) assert.throws(() => validateCalibration({ ...fixture, ...patch }), JSON.stringify(patch));
  });
});
