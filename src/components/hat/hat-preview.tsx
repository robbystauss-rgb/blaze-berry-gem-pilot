import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FamilyId, LeatheretteId, PatchShape, PatchSize, Placement } from "@/lib/catalog";
import { FAMILIES, getLeatherette } from "@/lib/catalog";
import { useOrder } from "@/lib/order-store";
import {
  familyHero,
  familyHeroCalibration,
  stageFrontCalibration,
  stageViews,
} from "@/lib/stage-photos";
import {
  DEFAULT_ANCHORS,
  crownToDisplay,
  dragAnchor,
  fittedImageRect,
  isCrownPosition,
  isFrontPlacement,
  legacyToCrown,
  type Calibration,
  type Point,
  type Rect,
} from "@/lib/crown-geometry";
import { cn } from "@/lib/utils";
import { getPublicDocument, getPublishedHatPhoto } from "@/lib/commerce/owner-api";
import {
  defaultPhotoGeometry,
  physicalPatch,
  physicalProjection,
  constrainPatch,
  patchFits,
  dimensionLabel,
  geometrySignature,
  type PhotoGeometry,
} from "@/lib/patch-physical";
import { PatchFace } from "./patch-face";
import { hatDisplayImage, hatStageImage, hatStageImages } from "@/lib/hat-display-images";
import {
  detailedDriveView,
  hatImageDimensionsMatch,
  limitedPhotoDetail,
} from "@/lib/hat-image-quality";

type Props = {
  family: FamilyId;
  colorway: string;
  leatherette: LeatheretteId;
  shape: PatchShape;
  size: PatchSize;
  placement: Placement;
  patchText: string;
  artworkUrl?: string;
  mode?: "svg" | "photo" | "auto";
  className?: string;
  showCaption?: boolean;
  patchOnly?: boolean;
  /** When set, placement controls sit on the hat itself. */
  placementMode?: boolean;
};

// Uncalibrated angles remain reference photos. Placement presets live below the stage.
const OFFSET_X_LIMIT = 18;
const OFFSET_Y_LIMIT = 14;
const SCALE_MIN = 0.75;
const SCALE_MAX = 1.25;

type ViewName = "front" | "side" | "back";
type PlacementTransform = { x: number; y: number; scale: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanTransform(transform: PlacementTransform): PlacementTransform {
  return {
    x: Number(clamp(transform.x, -OFFSET_X_LIMIT, OFFSET_X_LIMIT).toFixed(2)),
    y: Number(clamp(transform.y, -OFFSET_Y_LIMIT, OFFSET_Y_LIMIT).toFixed(2)),
    scale: Number(clamp(transform.scale, SCALE_MIN, SCALE_MAX).toFixed(2)),
  };
}

function clipFor(shape: PatchShape): string {
  switch (shape) {
    case "Circle":
      return "circle(50% at 50% 50%)";
    case "Oval":
      return "ellipse(46% 38% at 50% 50%)";
    case "Hexagon":
      return "polygon(25% 8%, 75% 8%, 96% 50%, 75% 92%, 25% 92%, 4% 50%)";
    case "Shield":
      return "polygon(12% 6%, 88% 6%, 88% 58%, 50% 96%, 12% 58%)";
    case "Custom Die-Cut":
      return "polygon(8% 28%, 28% 8%, 72% 6%, 94% 30%, 88% 68%, 70% 94%, 30% 96%, 8% 70%)";
    case "Rounded Rectangle":
      return "inset(6% round 22%)";
    default:
      return "inset(8%)";
  }
}

function patchOnView(placement: Placement, view: ViewName) {
  if (view === "side") return placement === "side";
  if (view === "back") return placement === "rear";
  return placement === "front-center" || placement === "left-front" || placement === "right-front";
}

export function HatPreview({
  family,
  colorway,
  leatherette,
  shape,
  size,
  placement,
  patchText,
  artworkUrl,
  className,
  showCaption,
  patchOnly,
  placementMode,
}: Props) {
  const leather = getLeatherette(leatherette);
  const draft = useOrder();
  const named = colorway.trim();
  const baseFront = stageFrontCalibration(family, named);
  const [ownerPhoto, setOwnerPhoto] = useState<{
    key: string;
    value: Awaited<ReturnType<typeof getPublishedHatPhoto>>;
  }>({ key: "", value: null });
  const photoKey = family + "|" + (baseFront?.colorway ?? "");
  useEffect(() => {
    let active = true;
    if (named && baseFront)
      void getPublishedHatPhoto({ data: { modelId: family, colorway: baseFront.colorway } })
        .then((value) => {
          if (active) setOwnerPhoto({ key: photoKey, value });
        })
        .catch(() => {
          if (active) setOwnerPhoto({ key: photoKey, value: null });
        });
    return () => {
      active = false;
    };
  }, [photoKey, named, family, baseFront]);
  const override = ownerPhoto.key === photoKey && named ? ownerPhoto.value : null;
  const matched = stageViews(family, named || "none");
  const hero =
    !named && !patchOnly ? (familyHeroCalibration(family)?.imageUrl ?? familyHero(family)) : null;
  const shots = hero
    ? { front: hero, side: null, back: null }
    : { ...matched, front: override?.photo.imageUrl ?? matched.front };
  const available = (["front", "side", "back"] as const).filter((view) => shots[view]);
  const [view, setView] = useState<ViewName>("front");
  const [zoom, setZoom] = useState(false);
  const drag = useRef<{ x: number } | null>(null);
  const active = available.includes(view) ? view : (available[0] ?? "front");
  const src = shots[active];
  const calibration =
    active === "front"
      ? hero
        ? familyHeroCalibration(family)
        : (override?.photo ?? baseFront)
      : null;
  const [publishedGeometry, setPublishedGeometry] = useState<{
    key: string;
    value: PhotoGeometry | null;
  }>({ key: "", value: null });
  useEffect(() => {
    let alive = true;
    if (calibration)
      void getPublicDocument({ data: { scope: "calibration", key: calibration.id } })
        .then((v) => {
          if (alive)
            setPublishedGeometry({ key: calibration.id, value: v as PhotoGeometry | null });
        })
        .catch(() => {
          if (alive) setPublishedGeometry({ key: calibration.id, value: null });
        });
    return () => {
      alive = false;
    };
  }, [calibration?.id]);
  const photoGeometry = useMemo(
    () =>
      calibration
        ? override?.photo.id === calibration.id
          ? override.geometry
          : publishedGeometry.key === calibration.id &&
              publishedGeometry.value?.imageVersion === calibration.sha256
            ? publishedGeometry.value
            : defaultPhotoGeometry(calibration)
        : null,
    [calibration, publishedGeometry, override],
  );
  const calibratedFront = active === "front" && isFrontPlacement(placement);
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [loadedImage, setLoadedImage] = useState<{
    src: string;
    width: number;
    height: number;
  } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [failedRendition, setFailedRendition] = useState<string | null>(null);
  const [pixelRatio, setPixelRatio] = useState(1);
  const [imageBox, setImageBox] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const originalRendition = hatDisplayImage(calibration);
  const verifiedRenditions = useMemo(() => hatStageImages(calibration), [calibration]);
  const nativeWidth = calibration
    ? (originalRendition?.width ?? calibration.sourceWidth)
    : loadedImage?.src === src
      ? loadedImage.width
      : 0;
  const nativeHeight = calibration
    ? (originalRendition?.height ?? calibration.sourceHeight)
    : loadedImage?.src === src
      ? loadedImage.height
      : 0;
  const nativePaintedWidth =
    nativeWidth && nativeHeight
      ? Math.min(imageBox.width, (imageBox.height * nativeWidth) / nativeHeight)
      : 0;
  const densityLimited =
    nativePaintedWidth > 0 && nativeWidth < nativePaintedWidth * pixelRatio * 1.35;
  const detailLimited = calibration
    ? densityLimited ||
      limitedPhotoDetail(
        originalRendition?.width ?? calibration.sourceWidth,
        originalRendition?.height ?? calibration.sourceHeight,
      )
    : loadedImage?.src === src &&
      (densityLimited || limitedPhotoDetail(loadedImage.width, loadedImage.height));
  const expanded = zoom && !detailLimited;
  const paintedWidth =
    calibration && imageBox.width > 0
      ? Math.min(
          imageBox.width,
          (imageBox.height * calibration.sourceWidth) / calibration.sourceHeight,
        )
      : 0;
  const rendition = useMemo(
    () => hatStageImage(calibration, paintedWidth, pixelRatio, expanded),
    [calibration, paintedWidth, pixelRatio, expanded],
  );
  const preferredImageSrc = calibration
    ? (rendition?.imageUrl ?? src)
    : detailedDriveView(src, imageBox.width, pixelRatio, expanded);
  const imageSrc = preferredImageSrc === failedRendition ? src : preferredImageSrc;
  const sourceReady =
    loadedImage?.src === src &&
    calibration?.imageUrl === src &&
    hatImageDimensionsMatch(
      calibration,
      originalRendition,
      loadedImage.width,
      loadedImage.height,
      verifiedRenditions,
    );
  // Delivery pixel density never changes the saved source coordinate system.
  const imageRect =
    sourceReady && calibration
      ? fittedImageRect(
          { width: calibration.sourceWidth, height: calibration.sourceHeight },
          imageBox,
        )
      : null;
  const showPatch = patchOnly || !src || patchOnView(placement, active);
  const usesDraftTransform =
    !patchOnly &&
    family === draft.family &&
    colorway === draft.colorway &&
    placement === draft.placement;
  const invalidPosition =
    usesDraftTransform &&
    draft.patchPosition !== undefined &&
    !isCrownPosition(draft.patchPosition);
  const storedTransform = cleanTransform({
    x: usesDraftTransform ? Number(draft.patchOffsetX) || 0 : 0,
    y: usesDraftTransform ? Number(draft.patchOffsetY) || 0 : 0,
    scale: usesDraftTransform ? Number(draft.patchScale) || 1 : 1,
  });
  const [guides, setGuides] = useState(false);
  const [adjustment, setAdjustment] = useState("");
  const [undo, setUndo] = useState<{ photoId: string; anchor: Point } | null>(null);
  const [liveAnchor, setLiveAnchor] = useState<Point | null>(null);
  useEffect(() => {
    if (!usesDraftTransform || !sourceReady || !calibration || !photoGeometry || !calibratedFront)
      return;
    const identity = {
      family,
      colorway,
      photoId: calibration.id,
      imageVersion: calibration.sha256,
      geometrySignature: geometrySignature(photoGeometry),
    };
    if (JSON.stringify(draft.previewIdentity) !== JSON.stringify(identity))
      draft.set("previewIdentity", identity);
  }, [
    usesDraftTransform,
    sourceReady,
    calibration,
    photoGeometry,
    calibratedFront,
    family,
    colorway,
    draft.previewIdentity,
  ]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      setImageBox({ x: 0, y: 0, width: frame.clientWidth, height: frame.clientHeight });
      setPixelRatio(window.devicePixelRatio || 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    // SSR/cached images can finish before React attaches onLoad during hydration.
    const image = imageRef.current;
    if (src && image?.complete && image.getAttribute("src") === imageSrc) {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        if (
          rendition &&
          imageSrc === rendition.imageUrl &&
          (image.naturalWidth !== rendition.width || image.naturalHeight !== rendition.height)
        ) {
          setFailedRendition(imageSrc);
          return;
        }
        setFailedImage(null);
        setLoadedImage({ src, width: image.naturalWidth, height: image.naturalHeight });
      } else {
        // An early failure can also precede React's onError attachment.
        setLoadedImage(null);
        if (imageSrc !== src) setFailedRendition(imageSrc);
        else setFailedImage(src);
      }
    }
  }, [src, imageSrc, rendition]);

  useEffect(() => {
    if (!calibratedFront || !isFrontPlacement(placement)) {
      setLiveAnchor(null);
      return;
    }
    if (invalidPosition) {
      setLiveAnchor(null);
      return;
    }
    if (usesDraftTransform && isCrownPosition(draft.patchPosition)) {
      const wanted = draft.patchPosition.anchor;
      const dimensions =
        calibration && photoGeometry && imageRect
          ? physicalProjection(physicalPatch(shape, size), calibration, photoGeometry, imageRect)
          : null;
      const safe =
        dimensions && photoGeometry && imageRect
          ? constrainPatch(
              wanted,
              photoGeometry.anchor,
              dimensions,
              {
                width: photoGeometry.bounds.width * imageRect.width,
                height: photoGeometry.bounds.height * imageRect.height,
              },
              photoGeometry,
            )
          : wanted;
      setLiveAnchor(safe);
      if (
        usesDraftTransform &&
        (Math.abs(safe.x - wanted.x) > 1e-6 || Math.abs(safe.y - wanted.y) > 1e-6)
      ) {
        draft.set("patchPosition", { version: 2, anchor: safe });
        setAdjustment(
          "Placement adjusted to fit this photograph. Review the patch position before ordering.",
        );
      }
      return;
    }
    if (!imageRect || !calibration) {
      setLiveAnchor(null);
      return;
    }
    // Old offsets are percentage points of the old container, never crown units.
    const position =
      usesDraftTransform && (storedTransform.x !== 0 || storedTransform.y !== 0)
        ? legacyToCrown(
            { x: storedTransform.x, y: storedTransform.y },
            placement,
            imageBox,
            calibration.bounds,
            imageRect,
          )
        : { version: 2 as const, anchor: photoGeometry?.anchor ?? DEFAULT_ANCHORS[placement] };
    setLiveAnchor(position.anchor);
    if (usesDraftTransform) draft.set("patchPosition", position);
  }, [
    calibratedFront,
    placement,
    usesDraftTransform,
    invalidPosition,
    draft.patchPosition,
    src,
    sourceReady,
    imageBox.width,
    imageBox.height,
    photoGeometry,
    shape,
    size,
  ]);

  const viewKey = `${placement}|${shots.front ?? ""}|${shots.side ?? ""}|${shots.back ?? ""}`;
  useEffect(() => {
    if (placement === "side" && shots.side) setView("side");
    else if (placement === "rear" && shots.back) setView("back");
    else if (shots.front) setView("front");
  }, [viewKey, placement, shots.front, shots.side, shots.back]);

  function resetTransform() {
    if (usesDraftTransform) draft.patch({ patchOffsetX: 0, patchOffsetY: 0, patchScale: 1 });
    if (isFrontPlacement(placement))
      saveAnchor(photoGeometry?.anchor ?? DEFAULT_ANCHORS[placement], true);
  }
  function saveAnchor(anchor: Point, commit: boolean) {
    setLiveAnchor(anchor);
    if (commit && usesDraftTransform) {
      if (calibration && isCrownPosition(draft.patchPosition))
        setUndo({ photoId: calibration.id, anchor: draft.patchPosition.anchor });
      draft.set("patchPosition", { version: 2, anchor });
      setAdjustment("");
    }
  }
  function resizePatch(direction: number) {
    if (!calibratedFront || !usesDraftTransform) return;
    const sizes = ["small", "medium", "large"] as const;
    draft.patch({
      patchSize: sizes[Math.max(0, Math.min(2, sizes.indexOf(size) + direction))],
      patchScale: 1,
    });
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (placementMode) return;
    drag.current = { x: event.clientX };
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (placementMode) {
      drag.current = null;
      return;
    }
    if (!drag.current || available.length < 2) return;
    const delta = event.clientX - drag.current.x;
    drag.current = null;
    if (Math.abs(delta) < 36) return;
    const index = available.indexOf(active);
    const next = available[index + (delta < 0 ? 1 : -1)];
    if (next) setView(next);
  }

  return (
    <div className={cn("relative h-full min-h-[46vh] overflow-hidden lg:min-h-0", className)}>
      <div
        className="relative h-full min-h-[46vh] overflow-hidden touch-pan-y lg:min-h-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div
          ref={frameRef}
          data-hat-preview={family}
          data-colorway={colorway}
          data-calibration={calibration?.id ?? "missing"}
          data-image-rect={imageRect ? JSON.stringify(imageRect) : "loading"}
          data-crown-bounds={photoGeometry ? JSON.stringify(photoGeometry.bounds) : undefined}
          data-preview-version="3"
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{ transform: expanded ? "scale(1.35)" : "scale(1)" }}
        >
          {patchOnly || !src ? (
            <div className="grid h-full place-items-center p-5">
              {patchOnly ? (
                <PatchCard
                  key={`${leatherette}-${shape}-${size}`}
                  leatherette={leatherette}
                  shape={shape}
                  size={size}
                  patchText={patchText}
                  artworkUrl={artworkUrl}
                />
              ) : (
                <div className="max-w-sm rounded-3xl bg-stage-photo/94 px-6 py-5 text-center shadow-[0_14px_36px_rgba(45,38,30,0.08)] ring-1 ring-stage-line">
                  <p className="font-semibold text-stage-ink">Verified product photo unavailable</p>
                  <p className="mt-1 text-sm leading-6 text-stage-muted">
                    We do not substitute a different hat or generate a missing angle.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <img
              ref={imageRef}
              key={src}
              src={imageSrc ?? undefined}
              alt={`${FAMILIES[family].label} ${named || "model"} ${active}`}
              className="h-full w-full object-contain object-center"
              decoding="async"
              onLoad={(event) => {
                if (
                  rendition &&
                  imageSrc === rendition.imageUrl &&
                  (event.currentTarget.naturalWidth !== rendition.width ||
                    event.currentTarget.naturalHeight !== rendition.height)
                ) {
                  setFailedRendition(imageSrc);
                  return;
                }
                setFailedImage(null);
                setLoadedImage({
                  src,
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                });
              }}
              onError={() => {
                setLoadedImage(null);
                if (imageSrc !== src) setFailedRendition(imageSrc);
                else setFailedImage(src);
              }}
            />
          )}
          {guides && placementMode && calibratedFront && photoGeometry && imageRect && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 h-full w-full"
              viewBox={`0 0 ${imageBox.width} ${imageBox.height}`}
            >
              <polygon
                points={photoGeometry.polygon
                  .map((point) => {
                    const p = crownToDisplay(point, photoGeometry.bounds, imageRect);
                    return p.x + "," + p.y;
                  })
                  .join(" ")}
                fill="none"
                stroke="#285855"
                strokeWidth="1.5"
                strokeDasharray="5 4"
              />
              <path
                d={`M ${imageRect.x + imageRect.width / 2} ${imageRect.y} v ${imageRect.height}`}
                stroke="#285855"
                strokeWidth="1"
                strokeDasharray="4 5"
              />
            </svg>
          )}
          {!patchOnly &&
            showPatch &&
            calibratedFront &&
            photoGeometry &&
            !invalidPosition &&
            calibration &&
            imageRect &&
            liveAnchor && (
              <PatchOverlay
                leather={leather}
                shape={shape}
                size={size}
                placement={placement}
                patchText={patchText}
                artworkUrl={artworkUrl}
                interactive={Boolean(placementMode && usesDraftTransform)}
                calibration={calibration}
                imageRect={imageRect}
                anchor={liveAnchor}
                onAnchor={saveAnchor}
                photoGeometry={photoGeometry}
              />
            )}
          {!patchOnly && calibratedFront && src && !calibration && (
            <p
              role="status"
              className="absolute bottom-16 left-4 right-4 rounded-2xl bg-stage-photo/94 p-3 text-center text-sm text-stage-ink"
            >
              Patch preview calibration unavailable for this photograph.
            </p>
          )}
          {!patchOnly && !calibratedFront && src && failedImage === src && (
            <p
              role="status"
              className="absolute left-4 right-4 bottom-16 rounded-2xl bg-stage-photo/95 p-3 text-center text-sm text-stage-ink"
            >
              This exact reference photo is unavailable. Choose another view or try again later.
            </p>
          )}
          {!patchOnly && !calibratedFront && detailLimited && failedImage !== src && (
            <p className="patch-scale-caption" data-photo-detail="limited">
              Reference photo · detail limited at this screen density; a sharper original is needed
              for zoom.
            </p>
          )}
          {!patchOnly &&
            calibratedFront &&
            calibration &&
            src &&
            (failedImage === src || (loadedImage?.src === src && !sourceReady)) && (
              <p
                role="status"
                className="absolute bottom-16 left-4 right-4 rounded-2xl bg-stage-photo/94 p-3 text-center text-sm text-stage-ink"
              >
                Calibrated product photo unavailable. Patch preview will return when the verified
                photograph loads.
              </p>
            )}
          {!patchOnly && calibratedFront && invalidPosition && (
            <p
              role="status"
              className="absolute bottom-16 left-4 right-4 rounded-2xl bg-stage-photo/94 p-3 text-center text-sm text-stage-ink"
            >
              Saved placement format unavailable. Use Reset in Place to choose a new position.
            </p>
          )}
          {adjustment && calibratedFront && (
            <p
              role="status"
              className="absolute left-4 right-4 bottom-28 rounded-xl bg-stage-photo/95 p-2 text-center text-xs text-stage-ink"
            >
              {adjustment}
            </p>
          )}
          {!patchOnly && calibratedFront && photoGeometry && (
            <p className="patch-scale-caption">
              {dimensionLabel(shape, size)} ·{" "}
              {shape === "Custom Die-Cut" && "Artwork bounding area · cutline prepared in proof · "}
              {photoGeometry.reference
                ? "Owner-calibrated reference"
                : "Estimated photo scale · final fit confirmed in proof"}
              {detailLimited && (
                <span className="block" data-photo-detail="limited">
                  Catalog photo · detail limited
                </span>
              )}
            </p>
          )}
          {!patchOnly && !calibratedFront && showPatch && (
            <p className="patch-scale-caption">
              Reference photo only · this angle needs measured calibration before an attached
              preview can be shown
              {detailLimited && (
                <span className="block" data-photo-detail="limited">
                  Catalog photo · detail limited
                </span>
              )}
            </p>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-[14%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse,rgba(44,33,30,0.14),transparent_70%)]" />
        {placementMode && !patchOnly && (
          <>
            {showPatch && usesDraftTransform && calibratedFront && (
              <div className="absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stage-photo/94 p-1.5 shadow-[0_8px_24px_rgba(45,38,30,0.1)] ring-1 ring-stage-line backdrop-blur">
                <button
                  type="button"
                  onClick={() => resizePatch(-1)}
                  disabled={size === "small"}
                  className="min-h-11 min-w-11 rounded-full px-2 text-sm font-semibold disabled:opacity-40"
                  aria-label="Make patch smaller"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={resetTransform}
                  title="Center patch and reset placement"
                  className="min-h-11 rounded-full px-3 text-xs font-semibold"
                >
                  Reset
                </button>
                <button
                  type="button"
                  aria-pressed={guides}
                  onClick={() => setGuides(!guides)}
                  className="min-h-11 rounded-full px-2 text-xs font-semibold"
                >
                  Guides
                </button>
                <button
                  type="button"
                  disabled={!undo || undo.photoId !== calibration?.id}
                  onClick={() => {
                    if (undo && undo.photoId === calibration?.id) {
                      setLiveAnchor(undo.anchor);
                      draft.set("patchPosition", { version: 2, anchor: undo.anchor });
                      setUndo(null);
                    }
                  }}
                  className="min-h-11 rounded-full px-2 text-xs font-semibold disabled:opacity-40"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={() => resizePatch(1)}
                  disabled={size === "large"}
                  className="min-h-11 min-w-11 rounded-full px-2 text-sm font-semibold disabled:opacity-40"
                  aria-label="Make patch larger"
                >
                  +
                </button>
              </div>
            )}
            <p className="sr-only">
              {calibratedFront
                ? "Drag or use arrow keys to position the patch"
                : "Choose a front view to preview placement"}
            </p>
          </>
        )}
      </div>
      <div className="absolute bottom-3 left-3 z-30 flex flex-wrap gap-1.5">
        {available.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={cn(
              "min-h-11 rounded-full px-3 text-xs font-semibold capitalize shadow-[0_8px_22px_rgba(45,38,30,0.06)]",
              active === item
                ? "bg-primary text-primary-fg"
                : "bg-stage-photo/92 text-stage-ink ring-1 ring-stage-line",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setZoom((value) => !value)}
        disabled={Boolean(detailLimited)}
        title={
          detailLimited
            ? "This catalog photo has limited detail. A higher-resolution exact-model photo is needed for zoom."
            : undefined
        }
        className="absolute bottom-3 right-3 z-30 min-h-11 rounded-full bg-stage-photo/92 px-3 text-xs font-semibold text-stage-ink shadow-[0_8px_22px_rgba(45,38,30,0.06)] ring-1 ring-stage-line disabled:opacity-45"
      >
        {expanded ? "Fit" : "Zoom"}
      </button>
      {showCaption && (
        <p className="pointer-events-none absolute left-4 right-4 top-3 z-10 text-center text-sm leading-6 text-stage-muted">
          Customization preview. Final engraving and placement are confirmed in your digital proof.
        </p>
      )}
    </div>
  );
}

function PatchOverlay({
  leather,
  shape,
  size,
  placement,
  patchText,
  artworkUrl,
  interactive,
  calibration,
  imageRect,
  anchor,
  onAnchor,
  photoGeometry,
}: {
  leather: ReturnType<typeof getLeatherette>;
  shape: PatchShape;
  size: PatchSize;
  placement: Placement;
  patchText: string;
  artworkUrl?: string;
  interactive: boolean;
  calibration: Calibration;
  imageRect: Rect;
  anchor: Point;
  onAnchor: (anchor: Point, commit: boolean) => void;
  photoGeometry: PhotoGeometry;
}) {
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    anchor: Point;
    last: Point;
  } | null>(null);
  const cleanupDrag = useRef<(() => void) | null>(null);
  const latest = useRef({
    calibration,
    imageRect,
    photoGeometry,
    size,
    shape,
    placement,
    onAnchor,
  });
  latest.current = { calibration, imageRect, photoGeometry, size, shape, placement, onAnchor };
  const geometry = {
    ...crownToDisplay(anchor, photoGeometry.bounds, imageRect),
    ...physicalProjection(physicalPatch(shape, size), calibration, photoGeometry, imageRect),
  };
  function limitAnchor(wanted: Point, safe: Point) {
    const value = latest.current,
      g = value.photoGeometry;
    return constrainPatch(
      wanted,
      safe,
      physicalProjection(
        physicalPatch(value.shape, value.size),
        value.calibration,
        g,
        value.imageRect,
      ),
      {
        width: g.bounds.width * value.imageRect.width,
        height: g.bounds.height * value.imageRect.height,
      },
      g,
    );
  }
  useEffect(() => () => cleanupDrag.current?.(), []);
  // A pointer gesture cannot carry deltas into another model, photo or physical size.
  useEffect(() => {
    cleanupDrag.current?.();
    drag.current = null;
  }, [calibration.id, shape, size, placement]);
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupDrag.current?.();
    const parent = event.currentTarget.parentElement;
    if (!parent) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      anchor,
      last: anchor,
    };
    function cleanup() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      cleanupDrag.current = null;
    }
    function move(e: globalThis.PointerEvent) {
      const current = drag.current,
        value = latest.current;
      if (!current || e.pointerId !== current.pointerId) return;
      e.preventDefault();
      const rect = parent!.getBoundingClientRect(),
        width = parent!.clientWidth,
        height = parent!.clientHeight;
      if (!rect.width || !rect.height) return;
      const next = dragAnchor(
        current.anchor,
        {
          x: ((e.clientX - current.x) * width) / rect.width,
          y: ((e.clientY - current.y) * height) / rect.height,
        },
        { width, height },
        value.photoGeometry.bounds,
        value.imageRect,
        isFrontPlacement(value.placement) ? value.placement : "front-center",
      );
      current.last = limitAnchor(next, current.anchor);
      value.onAnchor(current.last, false);
    }
    function finish(e: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current || e.pointerId !== current.pointerId) return;
      e.preventDefault();
      drag.current = null;
      cleanup();
      latest.current.onAnchor(current.last, true);
    }
    cleanupDrag.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { passive: false });
    window.addEventListener("pointercancel", finish, { passive: false });
  }
  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();
    const amount = event.shiftKey ? 6 : 2;
    const delta = {
      x: event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0,
      y: event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0,
    };
    const parent = event.currentTarget.parentElement!;
    onAnchor(
      limitAnchor(
        dragAnchor(
          anchor,
          delta,
          { width: parent.clientWidth, height: parent.clientHeight },
          photoGeometry.bounds,
          imageRect,
          isFrontPlacement(placement) ? placement : "front-center",
        ),
        anchor,
      ),
      true,
    );
  }
  if (
    !patchFits(
      anchor,
      geometry,
      {
        width: photoGeometry.bounds.width * imageRect.width,
        height: photoGeometry.bounds.height * imageRect.height,
      },
      photoGeometry.polygon,
      photoGeometry.rotation,
      photoGeometry.skew,
      photoGeometry.compression,
    )
  )
    return (
      <p role="status" className="patch-fit-warning">
        This size does not fit the calibrated area. Choose a smaller patch or ask for a production
        proof.
      </p>
    );
  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2",
        interactive
          ? "z-30 cursor-grab touch-none select-none active:cursor-grabbing"
          : "z-10 pointer-events-none",
      )}
      style={{
        width: geometry.width,
        height: geometry.height,
        left: geometry.x,
        top: geometry.y,
        transition: "none",
        touchAction: interactive ? "none" : undefined,
      }}
      data-patch-overlay="true"
      data-patch-size={size}
      data-patch-anchor={JSON.stringify(anchor)}
      data-physical-inches={JSON.stringify(physicalPatch(shape, size))}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Position patch: drag or use arrow keys" : undefined}
      onPointerDown={startDrag}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={moveWithKeyboard}
    >
      <div
        className="physical-patch-mounted"
        style={{
          transform: `rotate(${photoGeometry.rotation}deg) skewX(${photoGeometry.skew}deg) scaleX(${photoGeometry.compression})`,
        }}
      >
        <PatchFace material={leather.id} shape={shape} text={patchText} artwork={artworkUrl} />
      </div>
    </div>
  );
}

export function PatchCard({
  leatherette,
  shape,
  size,
  patchText,
  artworkUrl,
  className,
}: {
  leatherette: LeatheretteId;
  shape: PatchShape;
  size: PatchSize;
  patchText: string;
  artworkUrl?: string;
  className?: string;
}) {
  const physical = physicalPatch(shape, size);
  const style: CSSProperties = {
    width: physical.width * 76,
    height: "auto",
    maxWidth: "82vw",
    aspectRatio: physical.width / physical.height,
  };
  return (
    <div className={cn("grid place-items-center", className)}>
      <div
        className="physical-patch-mounted"
        style={style}
        data-patch-card="true"
        data-physical-inches={JSON.stringify(physical)}
      >
        <PatchFace material={leatherette} shape={shape} text={patchText} artwork={artworkUrl} />
      </div>
    </div>
  );
}

export function ShapeMark({
  shape,
  className,
  texture,
}: {
  shape: PatchShape;
  className?: string;
  texture?: string;
}) {
  return (
    <span
      className={cn("block", texture ? "bg-stage-photo" : "bg-primary/80", className)}
      style={{
        clipPath: clipFor(shape),
        aspectRatio: shape === "Circle" ? "1" : shape === "Oval" ? "1.4 / 1" : "1.3 / 1",
        backgroundImage: texture ? `url(${texture})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}
