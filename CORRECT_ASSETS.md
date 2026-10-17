# REC Mama Made — Canonical Asset Rules

This project is wired so the customer-facing builder uses verified REC Mama Made hat mappings and the approved material source instead of silently substituting generated, legacy, supplier, or wrong-model imagery.

## Hats

The Grok export's `src/data/master-catalog.json` remains the base catalog.

`src/data/catalog-patches.json` is the correction overlay for recovered or corrected models. The catalog overlay plugin in `vite.config.ts` merges it into the base catalog imported by `src/lib/studio-store.ts`.

Audited source catalog (including archived records):

- 112 — Trucker: 104 complete Front / Side / Back colorways
- 112FP — Five Panel Trucker: 19 complete Front / Side / Back colorways
- 112P — Printed Trucker: 10 complete Front / Side / Back colorways
- 112PFP — Printed Five Panel Trucker: 36 complete Front / Side / Back colorways
- 168 — 7 Panel Mesh Back: 17 recovered complete Front / Side / Back colorways
- 256 — Umpqua Gramps Cap: 19 complete Front / Side / Back colorways
- 256P — Printed Umpqua Gramps Cap: 7 complete Front / Side / Back colorways
- 112FPR — Five Panel Trucker with Rope: 17 colorways; 10 complete Front / Side / Back sets and 7 single-view catalog photos
- 112PM — Printed Mesh Trucker: **archived**, 8 historical colorways and original assets retained
- 168P — Printed 7 Panel Mesh Back: 6 colorways with a catalog product photo each

The effective catalog contains 687 unique hat-view references: 666 Drive references and 21 local photos.

The active catalog excludes only exact model ID `112PM` through `src/lib/catalog-lifecycle.ts`. The nine other model identities and all their colorways remain intact. Its former `/112pm` route redirects permanently to `/hats`; retired builder drafts require a fresh active model/color selection. Server quoting, checkout, variant discovery and publishing also reject this model. Migration `0015_retire_112pm.sql` archives matching products and deactivates exact matching variants with audit records. Historical orders, prices, original files and frozen calibrations are not deleted or rewritten.

### Reviewed catalog refresh — 2026-10-16

`src/data/catalog-photo-refresh.json` records five independently matched **168P** color photographs extracted at native resolution from the newly discovered 2048×2048 color chart, Drive file `1U1bSocKIhagEpw-Q0vKV7zJ-z8y0rbZR`. The checked-in sanitized chart and WebP crops under `public/assets/catalog-refresh/` strip metadata without enlargement, sharpening, recoloring or generated detail. The manifest records exact model/color IDs, chart labels, source hash, crop rectangles and output hashes.

Eligible labels: Saltwater Duck Camo/Ice Grey, Harvest Duck Camo/Sandstone, Marsh Duck Camo/Loden, Mossy Oak Bottomland/Loden, and Bark Duck Camo/Brown. The chart's Realtree Advantage/DK Khaki label does not establish the existing Realtree Advantage Classic/Khaki variant and is excluded pending review. Chart dimension callouts are not accepted as photo calibration measurements.

These new photo identities improve catalog thumbnails and the model hero. They do **not** replace frozen builder photos or inherit old framing/calibration. Owner registration, calibration, preview and publishing of a replacement builder photograph remain separate. `scripts/validate-catalog-photo-refresh.mjs` verifies identity, dimensions, metadata, hashes and reproducible crops during `check:assets`.

Finished-work originals supplied separately remain private, outside Git and public assets. The controlled `scripts/import-reviewed-media.mjs` operator workflow imports a reviewed private bundle into the existing media library, deduplicates exact originals, and creates unpublished gallery drafts without consent or featured flags. Its remote mode requires active owner authorization and an explicitly approved commit. It never automatically publishes customer artwork or registers unverified model/color identities.

The additional 112PM, 112FPR, and 168P product photos are original embedded images from pages 5, 6, and 7 of `RECmamahatoptions.pdf`. They retain the source resolution (227×149 for 112PM/112FPR and 226×141 for 168P). `src/data/catalog-photo-provenance.json` records exact model/color mappings, source pages, dimensions, and SHA-256 hashes. It also records the 20 recovered 112FPR side/back Drive photos.

Catalog readiness and photo completeness are separate: a verified product photo is enough for a colorway to be selectable. Single-view assets retain `assetStatus: "partial"`. The preview offers only supplied views.

If a model, color, or view is missing, show a neutral unavailable state. Never substitute another Richardson model, a generated hat, or a guessed color rendering.

### Builder photo detail

`src/data/hat-display-images.json` binds larger display renditions to the **same** exact Drive asset, model, frozen calibration ID and base SHA-256. The 222 verified larger fronts use their native 2000×2500, 2400×2400 or 3000×2500 pixels, encoded as optimized WebP without enlargement, sharpening, recoloring or generated detail. Existing `/assets/crown/` images, calibration coordinates, source hashes and historical order snapshots remain immutable. A display rendition is not a new product/photo calibration identity. Failed or incorrectly sized display files fall back to the original exact photograph.

The 21 original PDF/catalog crops remain only 226–227 pixels wide; eight belong to archived 112PM. The 13 active limited-detail builder photos (seven 112FPR colors and six 168P colors) are explicitly labeled and do not offer extra zoom. The five new 168P catalog crops above have different framing and need independent calibration before builder publication. The owner can register a verified replacement through Hat photo calibration and calibrate/publish it independently. No different model, color or view is substituted.

Side/rear views request density-appropriate larger versions of their existing exact Drive asset IDs. Missing views remain missing. Original photographic resolution is the upper bound on genuine detail.

Run `npm run check:hat-images` and `npm run test:hat-images`. The production build verifies exact bindings, complete larger-front coverage, byte hashes, image dimensions, framing, stripped metadata and size limits. Maintenance recovery is explicit (`REC_FETCH_HAT_ORIGINALS=1 node scripts/recover-hat-display-images.mjs`); ordinary builds make no remote image changes. Source recovery checks the approved baseline hash, or an exceptionally strict full-frame decoded-pixel proof allowing at most four isolated one-level 8-bit differences; changed framing/photo pixels are rejected. Native-source hashes and comparison evidence are retained in the display manifest.

## Materials

The authoritative material source is the exact Drive file:

- `My leatherette options.PNG`
- Drive file ID: `15zmpsoRUBMsIs7q1luA6j53Q_QVpEl74`
- SHA-256: `0599792323e2758701af9b997b3225b0db4eca7578ea9bba7fd9ba297886df2a`

The exact approved source is stored at `public/materials/review/source.png`.

Customer material cards use the clean `public/materials/review/*.webp` crops from that source. There are 31 named approved-source material options. Two source cards are intentionally unnamed and are not added to the customer picker.

Do not replace these with internet images, supplier swatch-sheet crops, generated textures, or fuzzy filename matches.

## Historical files

### Excluded synthetic work imagery — 2026-10-17

`src/data/excluded-media.json` identifies two rejected synthetic compositions by exact Drive IDs and known original/attachment byte hashes: the five-hat outdoor assortment and the NOPSI/CBD three-hat composition. They are not approved evidence of finished REC work. Original reference files remain preserved privately. Source folder names are not proof of authenticity.

Active source discovery, reviewed imports, owner photo uploads and publication checks exclude these known sources. The revised private import contains 14 records and five private gallery drafts; the four directly supplied genuine finished-hat photos remain included. These exclusions do not remove legitimate catalog models or alter historical orders/artwork.

Some older product and material files remain in the repository because this correction is intentionally non-destructive. They are historical/reference assets only. Active UI code must not use them as fallbacks.

Likewise, older catalog helper files may remain on disk, but the active hat path is the effective `MASTER` exported by `src/lib/studio-store.ts`.

## Removed option

The old geographic patch-shape option is not part of the active patch-shape type, list, UI, or preview logic. Legacy saved values are normalized to Rounded Rectangle.

## Validation

Run:

`npm run check:assets`

The validator checks effective catalog counts, complete or single-view mappings, unique image references, local photo provenance and hashes, the exact material source, 31 named material swatches, active source-code fallbacks, and the Grok OG-card references.

`npm run build` runs `check:assets` before the normal build.
