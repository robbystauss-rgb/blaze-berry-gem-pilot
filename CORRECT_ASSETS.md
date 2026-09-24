# REC Mama Made — Canonical Asset Rules

This project is wired so the customer-facing builder uses verified REC Mama Made hat mappings and the approved material source instead of silently substituting generated, legacy, supplier, or wrong-model imagery.

## Hats

The Grok export's `src/data/master-catalog.json` remains the base catalog.

`src/data/catalog-patches.json` is the authoritative correction overlay for recovered or corrected models. `src/lib/studio-store.ts` applies that overlay before the rest of the app reads `MASTER`.

Effective audited catalog:

- 112 — Trucker: 104 complete Front / Side / Back colorways
- 112FP — Five Panel Trucker: 19 complete Front / Side / Back colorways
- 112P — Printed Trucker: 10 complete Front / Side / Back colorways
- 112PFP — Printed Five Panel Trucker: 36 complete Front / Side / Back colorways
- 168 — 7 Panel Mesh Back: 17 recovered complete Front / Side / Back colorways
- 256 — Umpqua Gramps Cap: 19 complete Front / Side / Back colorways
- 256P — Printed Umpqua Gramps Cap: 7 complete Front / Side / Back colorways
- 112FPR — Five Panel Trucker with Rope: 10 verified FRONT photos only; asset-incomplete
- 112PM — Printed Mesh Trucker: no verified product-photo library yet
- 168P — Printed 7 Panel Mesh Back: no verified product-photo library yet

The effective catalog contains 646 unique hat-view Drive references.

If a model, color, or view is missing, show a neutral unavailable state. Never substitute another Richardson model, a generated hat, or a guessed color rendering.

## Materials

The authoritative material source is the exact Drive file:

- `My leatherette options.PNG`
- Drive file ID: `15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74`
- SHA-256: `0599792323e2758701af9b997b3225b0db4eca7578ea9bba7fd9ba297886df2a`

The exact approved source is stored at `public/materials/review/source.png`.

Customer material cards use the clean `public/materials/review/*.webp` crops from that source. There are 31 named approved-source material options. Two source cards are intentionally unnamed and are not added to the customer picker.

Do not replace these with internet images, supplier swatch-sheet crops, generated textures, or fuzzy filename matches.

## Historical files

Some older product and material files remain in the repository because this correction is intentionally non-destructive. They are historical/reference assets only. Active UI code must not use them as fallbacks.

Likewise, older catalog helper files may remain on disk, but the active hat path is the effective `MASTER` exported by `src/lib/studio-store.ts`.

## Removed option

The old geographic patch-shape option is not part of the active patch-shape type, list, UI, or preview logic. Legacy saved values are normalized to Rounded Rectangle.

## Validation

Run:

`npm run check:assets`

The validator checks the effective catalog counts, complete view mappings, unique Drive image references, the exact approved material source, 31 named material swatches, active source-code fallbacks, and the Grok OG-card references.

`npm run build` runs `check:assets` before the normal build.
