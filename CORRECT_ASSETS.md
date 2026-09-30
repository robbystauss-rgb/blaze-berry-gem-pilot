# REC Mama Made — Canonical Asset Rules

This project is wired so the customer-facing builder uses verified REC Mama Made hat mappings and the approved material source instead of silently substituting generated, legacy, supplier, or wrong-model imagery.

## Hats

The Grok export's `src/data/master-catalog.json` remains the base catalog.

`src/data/catalog-patches.json` is the correction overlay for recovered or corrected models. The catalog overlay plugin in `vite.config.ts` merges it into the base catalog imported by `src/lib/studio-store.ts`.

Effective audited catalog:

- 112 — Trucker: 104 complete Front / Side / Back colorways
- 112FP — Five Panel Trucker: 19 complete Front / Side / Back colorways
- 112P — Printed Trucker: 10 complete Front / Side / Back colorways
- 112PFP — Printed Five Panel Trucker: 36 complete Front / Side / Back colorways
- 168 — 7 Panel Mesh Back: 17 recovered complete Front / Side / Back colorways
- 256 — Umpqua Gramps Cap: 19 complete Front / Side / Back colorways
- 256P — Printed Umpqua Gramps Cap: 7 complete Front / Side / Back colorways
- 112FPR — Five Panel Trucker with Rope: 17 colorways; 10 complete Front / Side / Back sets and 7 single-view catalog photos
- 112PM — Printed Mesh Trucker: 8 colorways with a catalog product photo each
- 168P — Printed 7 Panel Mesh Back: 6 colorways with a catalog product photo each

The effective catalog contains 687 unique hat-view references: 666 Drive references and 21 local photos.

The additional 112PM, 112FPR, and 168P product photos are original embedded images from pages 5, 6, and 7 of `RECmamahatoptions.pdf`. They retain the source resolution (227×149 for 112PM/112FPR and 226×141 for 168P). `src/data/catalog-photo-provenance.json` records exact model/color mappings, source pages, dimensions, and SHA-256 hashes. It also records the 20 recovered 112FPR side/back Drive photos.

Catalog readiness and photo completeness are separate: a verified product photo is enough for a colorway to be selectable. Single-view assets retain `assetStatus: "partial"`. The preview offers only supplied views.

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

The validator checks effective catalog counts, complete or single-view mappings, unique image references, local photo provenance and hashes, the exact material source, 31 named material swatches, active source-code fallbacks, and the Grok OG-card references.

`npm run build` runs `check:assets` before the normal build.
