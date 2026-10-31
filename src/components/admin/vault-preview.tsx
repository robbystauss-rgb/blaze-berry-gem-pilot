import { useEffect, useState } from "react";
import { SavedHatProof } from "@/components/hat/saved-hat-proof";
import { stageFrontCalibration } from "@/lib/stage-photos";
import { defaultPhotoGeometry, type PhotoGeometry } from "@/lib/patch-physical";
import { getPublicDocument, getPublishedHatPhoto } from "@/lib/commerce/owner-api";
import type { Calibration } from "@/lib/crown-geometry";
import type { SavedBuild, CustomerAsset } from "@/lib/commerce/customer-schemas";
import type { FamilyId } from "@/lib/catalog";
import catalog from "@/data/master-catalog.json";
import type { Json } from "@/lib/commerce/types";

/** Uses the existing frozen-proof renderer and physical projection. Private art
 * never enters the public builder store, localStorage, or published media. */
export function VaultPreview({
  configuration: c,
  asset,
}: {
  configuration: SavedBuild;
  asset?: CustomerAsset;
}) {
  const model = catalog.models.find((m) => m.id === c.modelId),
    variant = model?.colorways.find((v) => v.id === c.variantId);
  const base = variant ? stageFrontCalibration(c.modelId as FamilyId, variant.officialName) : null;
  const [calibrated, setCalibrated] = useState<{
    key: string;
    photo: Calibration;
    geometry: PhotoGeometry;
  } | null>(null);
  const key = `${c.modelId}:${c.variantId}`;
  useEffect(() => {
    let alive = true;
    if (base && variant)
      void getPublishedHatPhoto({ data: { modelId: c.modelId, colorway: variant.id } })
        .then(async (published) => {
          const photo = published?.photo ?? base;
          const saved =
            published?.geometry ??
            (await getPublicDocument({ data: { scope: "calibration", key: photo.id } }));
          if (alive)
            setCalibrated({
              key,
              photo,
              geometry: (saved as PhotoGeometry | null) ?? defaultPhotoGeometry(photo),
            });
        })
        .catch(() => {
          if (alive && base)
            setCalibrated({ key, photo: base, geometry: defaultPhotoGeometry(base) });
        });
    return () => {
      alive = false;
    };
  }, [key, c.modelId, base, variant]);
  const current =
    calibrated?.key === key
      ? calibrated
      : base
        ? { photo: base, geometry: defaultPhotoGeometry(base) }
        : null;
  if (!current || !variant)
    return (
      <p className="cc-notice">
        Preview unavailable for this exact model/colorway. The saved source artwork and
        specifications remain available for review.
      </p>
    );
  const preview = {
    version: 3,
    photo: current.photo,
    geometry: current.geometry,
    physicalInches: c.physicalInches,
    anchor: c.patchPosition?.anchor ?? current.geometry.anchor,
    scaleStatus: current.geometry.reference ? "measured" : "estimated",
  };
  if (c.placement === "side" || c.placement === "rear")
    return (
      <p className="cc-notice">
        Side/rear placement needs a new production proof. Source artwork and physical dimensions are
        saved; an unmeasured side mock-up is not shown as accurate.
      </p>
    );
  return (
    <div className="cc-vault-preview">
      <SavedHatProof
        specifications={{
          preview: preview as unknown as Json,
          leatherette: c.leatherette,
          patchShape: c.patchShape,
          patchText: c.patchText,
        }}
        itemId={asset?.id ?? "text"}
        artworkPath={asset ? `/api/customer-artwork/${asset.id}?preview=1` : undefined}
        hasArtwork={!!asset?.has_preview}
        compact
      />
      {asset && !asset.has_preview && (
        <p className="cc-notice">
          This source requires file review. Artwork is omitted from the mock-up; download the
          original.
        </p>
      )}
    </div>
  );
}
