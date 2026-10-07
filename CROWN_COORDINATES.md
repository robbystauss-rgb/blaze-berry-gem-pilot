# Hat preview crown coordinates

Front patch previews use the usable front crown in the exact rendered photograph. The photograph is never treated as the crown, and patch width is never a percentage of the preview container.

## Coordinate spaces

All origins are at the top left, with x increasing right and y increasing down.

| Space | Units | Meaning |
| --- | --- | --- |
| Source image | Normalized 0–1 | A point or bounds in the complete source photograph, including its whitespace. |
| Rendered image rectangle | CSS pixels | The complete image after object fitting, image offsets and any crop. A cover fit can have negative offsets. |
| Crown local | Normalized crown units | A center anchor relative to calibrated crown bounds. Anchors can be outside 0–1 to preserve free placement. |
| Preview display | CSS pixels | The projected patch center and uniform display dimensions inside the preview. |

`src/lib/crown-geometry.ts` is the shared transform engine. `fittedImageRect` resolves contain/cover fitting and object position. Source-to-display and source-to-crown transforms have explicit inverses. Rendering, dragging and keyboard placement use these transforms. The preview measures its frame with `ResizeObserver` and waits for the actual image dimensions before displaying a calibrated patch. Preview zoom applies to the photo and patch together; pointer movement is converted back to the unzoomed preview coordinate space.

## Sizing and proportions

The canonical patch frame widths are **Small = 32%, Medium = 42%, Large = 52% of calibrated crown width**. These are a visual convention, not measurements in inches. The existing nominal product dimension labels remain the production specifications shown to customers; this engine does not establish inch-accurate sizing on hats because measured physical crown widths are unavailable.

Patch height is its width divided by the existing silhouette aspect ratio. Circle is 1:1, Oval is 1.45:1, and the other existing preview silhouettes are 1.35:1. The existing uniform adjustment control scales width and height together. Crown height does not independently scale the patch, and a shallow crown does not silently shrink a selected patch.

The patch silhouette and artwork are separate. Existing clipping masks, leatherette textures and artwork `object-contain` fitting remain in place. Changing the hat never changes artwork proportions or the silhouette ratio.

## Calibration and asset identity

`src/data/crown-calibrations.json` identifies each exact model/colorway front asset, its normalized crown bounds, source dimensions and calibration provenance. Runtime lookup requires both the exact model ID and asset ID. There is no model-wide or full-image percentage fallback for missing front calibration.

Front images are lossless WebP snapshots of the existing catalog photography. The snapshot filename includes the SHA-256 of the encoded snapshot bytes, and provenance retains the source asset identity and source hash. The image rendered by the builder must match the calibration image URL and dimensions. The calibration validation gate verifies coverage, metadata and asset integrity. A replacement photograph requires a new snapshot identity and reviewed crown calibration; it cannot silently inherit unrelated bounds.

Missing calibration, failed images and mismatched dimensions are detectable. A calibrated front patch is withheld until valid image geometry is available. Existing side/rear views retain their existing placement and size behavior; this calibration layer covers the usable front crown.

## Saved builds and placement

The persisted draft retains its existing storage key and legacy fields. New front positions use an optional, explicit field:

```json
{ "patchPosition": { "version": 2, "anchor": { "x": 0.5, "y": 0.5 } } }
```

This is the patch center in crown-local coordinates. Model/colorway changes retain this anchor, selected size, uniform scale and artwork. Each photograph projects the anchor through its own crown bounds and rendered image rectangle. Projection and responsive resizing do not clamp or rewrite the anchor.

Legacy `patchOffsetX`/`patchOffsetY` values remain percentage-point offsets from the old container placement presets. They are never reinterpreted as crown-local coordinates. On the first valid front image, a draft with nonzero legacy offsets converts its old display center into the new crown coordinates. Old drafts did not save viewport dimensions, so conversion uses the first valid preview geometry. Zero-offset drafts use the new calibrated placement preset. The original legacy fields remain available; no historical order data or database rows are rewritten.

Only placement gestures apply a boundary. The existing travel allowance is retained as ±18% of preview width and ±14% of preview height around the calibrated placement preset. If a retained anchor projects outside that allowance after a hat change, the gesture boundary expands to include the starting anchor. Pointerdown therefore does not jump or progressively drift a position. Existing reset and placement-preset controls still intentionally choose their preset positions.

The public payment payload keeps its existing contract. This change adds no order-data migration and changes no checkout, pricing, catalog availability or upload behavior. Any future consumer of the optional v2 field must check its version before interpreting an anchor; legacy percentage fields keep their original meaning.

## Verification

Run the focused tests with:

```sh
npm run test:crowns
```

The pure geometry tests use a tolerance of **1e-9 CSS pixels or normalized units**. They cover known letterbox/crop offsets, object position, forward/inverse round trips, source-resolution independence, crop/whitespace calibration, delayed geometry, responsive dimensions, canonical sizes, silhouette ratios, legacy compatibility, repeated model projection, free placement and gesture boundaries. Calibration coverage checks use the same catalog correction overlay as the app.

Build, typecheck, asset validation and calibration validation are separate gates. Actual-builder visual QA must use the real hat/color/size controls with the same uploaded artwork through the available front-image matrix. Desktop, tablet, narrow mobile and orientation changes must be visually inspected in addition to numeric checks. Generated images alone do not establish a visual QA pass.
