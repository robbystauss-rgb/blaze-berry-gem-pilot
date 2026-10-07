import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { FamilyId, LeatheretteId, PatchShape, PatchSize, Placement } from "@/lib/catalog";
import { FAMILIES, getLeatherette } from "@/lib/catalog";
import { useOrder } from "@/lib/order-store";
import { familyHero, familyHeroCalibration, stageFrontCalibration, stageViews } from "@/lib/stage-photos";
import {
  DEFAULT_ANCHORS, crownToDisplay, dragAnchor, fittedImageRect,
  isCrownPosition, isFrontPlacement, legacyToCrown, patchAspectRatio, patchDimensions,
  type Calibration, type Point, type Rect,
} from "@/lib/crown-geometry";
import { cn } from "@/lib/utils";

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
  onPlacement?: (placement: Placement) => void;
};

// Side/rear photography and patch-only cards retain their existing behavior.
const LEGACY_VIEW_SIZE_PCT: Record<PatchSize, number> = { small: 22, medium: 30, large: 38 };

const PLACE: Record<Placement, { left: number; top: number }> = {
  "front-center": { left: 50, top: 44 },
  "left-front": { left: 37, top: 46 },
  "right-front": { left: 63, top: 46 },
  side: { left: 62, top: 44 },
  rear: { left: 50, top: 40 },
};

const HOT: Record<Placement, { left: string; top: string; label: string }> = {
  "front-center": { left: "50%", top: "13%", label: "Center" },
  "left-front": { left: "16%", top: "42%", label: "Left" },
  "right-front": { left: "84%", top: "42%", label: "Right" },
  side: { left: "84%", top: "68%", label: "Side" },
  rear: { left: "16%", top: "68%", label: "Rear" },
};

const OFFSET_X_LIMIT = 18;
const OFFSET_Y_LIMIT = 14;
const SCALE_MIN = 0.75;
const SCALE_MAX = 1.25;
const SCALE_STEP = 0.1;

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
  onPlacement,
}: Props) {
  const leather = getLeatherette(leatherette);
  const draft = useOrder();
  const named = colorway.trim();
  const matched = stageViews(family, named || "none");
  const hero = !named && !patchOnly ? (familyHeroCalibration(family)?.imageUrl ?? familyHero(family)) : null;
  const shots = hero ? { front: hero, side: null, back: null } : matched;
  const available = (["front", "side", "back"] as const).filter((view) => shots[view]);
  const [view, setView] = useState<ViewName>("front");
  const [zoom, setZoom] = useState(false);
  const drag = useRef<{ x: number } | null>(null);
  const active = available.includes(view) ? view : available[0] ?? "front";
  const src = shots[active];
  const calibration = active === "front" ? (hero ? familyHeroCalibration(family) : stageFrontCalibration(family, named)) : null;
  const calibratedFront = active === "front" && isFrontPlacement(placement);
  const imageRef = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [loadedImage, setLoadedImage] = useState<{ src: string; width: number; height: number } | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [imageBox, setImageBox] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const sourceReady = loadedImage?.src === src && calibration?.imageUrl === src &&
    loadedImage.width === calibration.sourceWidth && loadedImage.height === calibration.sourceHeight;
  const imageRect = sourceReady && loadedImage ? fittedImageRect(loadedImage, imageBox) : null;
  const showPatch = patchOnly || !src || patchOnView(placement, active);
  const usesDraftTransform = !patchOnly && family === draft.family && colorway === draft.colorway && placement === draft.placement;
  const invalidPosition = usesDraftTransform && draft.patchPosition !== undefined && !isCrownPosition(draft.patchPosition);
  const storedTransform = cleanTransform({
    x: usesDraftTransform ? Number(draft.patchOffsetX) || 0 : 0,
    y: usesDraftTransform ? Number(draft.patchOffsetY) || 0 : 0,
    scale: usesDraftTransform ? Number(draft.patchScale) || 1 : 1,
  });
  const [liveTransform, setLiveTransform] = useState<PlacementTransform>(storedTransform);
  const [liveAnchor, setLiveAnchor] = useState<Point | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setImageBox({ x: 0, y: 0, width: frame.clientWidth, height: frame.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // SSR/cached images can finish before React attaches onLoad during hydration.
    const image = imageRef.current;
    if (src && image?.complete && image.getAttribute("src") === src) {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        setFailedImage(null);
        setLoadedImage({ src, width: image.naturalWidth, height: image.naturalHeight });
      } else {
        // An early failure can also precede React's onError attachment.
        setLoadedImage(null);
        setFailedImage(src);
      }
    }
  }, [src]);

  useEffect(() => {
    if (!calibratedFront || !isFrontPlacement(placement)) { setLiveAnchor(null); return; }
    if (invalidPosition) { setLiveAnchor(null); return; }
    if (usesDraftTransform && isCrownPosition(draft.patchPosition)) {
      setLiveAnchor(draft.patchPosition.anchor);
      return;
    }
    if (!imageRect || !calibration) { setLiveAnchor(null); return; }
    // Old offsets are percentage points of the old container, never crown units.
    const position = usesDraftTransform && (storedTransform.x !== 0 || storedTransform.y !== 0)
      ? legacyToCrown({ x: storedTransform.x, y: storedTransform.y }, placement, imageBox, calibration.bounds, imageRect)
      : { version: 2 as const, anchor: DEFAULT_ANCHORS[placement] };
    setLiveAnchor(position.anchor);
    if (usesDraftTransform) draft.set("patchPosition", position);
  }, [calibratedFront, placement, usesDraftTransform, invalidPosition, draft.patchPosition, src, sourceReady, imageBox.width, imageBox.height]);

  const viewKey = `${placement}|${shots.front ?? ""}|${shots.side ?? ""}|${shots.back ?? ""}`;
  useEffect(() => {
    if (placement === "side" && shots.side) setView("side");
    else if (placement === "rear" && shots.back) setView("back");
    else if (shots.front) setView("front");
  }, [viewKey, placement, shots.front, shots.side, shots.back]);

  useEffect(() => {
    setLiveTransform(storedTransform);
  }, [draft.patchOffsetX, draft.patchOffsetY, draft.patchScale, usesDraftTransform, family, colorway, placement]);

  function saveTransform(next: PlacementTransform) {
    const clean = cleanTransform(next);
    setLiveTransform(clean);
    if (usesDraftTransform) {
      draft.patch({ patchOffsetX: clean.x, patchOffsetY: clean.y, patchScale: clean.scale });
    }
  }

  function updateDrag(x: number, y: number, commit: boolean) {
    const clean = cleanTransform({ x, y, scale: liveTransform.scale });
    setLiveTransform(clean);
    if (commit && usesDraftTransform) {
      draft.patch({ patchOffsetX: clean.x, patchOffsetY: clean.y });
    }
  }

  function resetTransform() {
    saveTransform({ x: 0, y: 0, scale: 1 });
    if (isFrontPlacement(placement)) saveAnchor(DEFAULT_ANCHORS[placement], true);
  }

  function saveAnchor(anchor: Point, commit: boolean) {
    setLiveAnchor(anchor);
    if (commit && usesDraftTransform) draft.set("patchPosition", { version: 2, anchor });
  }

  function resizePatch(delta: number) {
    saveTransform({ ...liveTransform, scale: liveTransform.scale + delta });
  }

  function choosePlacement(id: Placement, blocked: boolean) {
    if (blocked || !onPlacement) return;
    onPlacement(id);
    setLiveTransform({ x: 0, y: 0, scale: 1 });
    if (family === draft.family && colorway === draft.colorway) {
      draft.patch({ patchOffsetX: 0, patchOffsetY: 0, patchScale: 1 });
      if (isFrontPlacement(id)) draft.set("patchPosition", { version: 2, anchor: DEFAULT_ANCHORS[id] });
    }
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
          data-crown-bounds={calibration ? JSON.stringify(calibration.bounds) : undefined}
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{ transform: zoom ? "scale(1.35)" : "scale(1)" }}
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
                  <p className="mt-1 text-sm leading-6 text-stage-muted">We do not substitute a different hat or generate a missing angle.</p>
                </div>
              )}
            </div>
          ) : (
            <img
              ref={imageRef}
              key={src}
              src={src}
              alt={`${FAMILIES[family].label} ${named || "model"} ${active}`}
              className="stage-in h-full w-full object-contain object-center"
              decoding="async"
              onLoad={(event) => { setFailedImage(null); setLoadedImage({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }}
              onError={() => { setLoadedImage(null); setFailedImage(src); }}
            />
          )}
          {!patchOnly && showPatch && (!calibratedFront || (!invalidPosition && calibration && imageRect && liveAnchor)) && (
            <PatchOverlay
              leather={leather}
              shape={shape}
              size={size}
              placement={placement}
              patchText={patchText}
              artworkUrl={artworkUrl}
              transform={liveTransform}
              interactive={Boolean(placementMode && usesDraftTransform)}
              onMove={updateDrag}
              calibration={calibratedFront ? calibration ?? undefined : undefined}
              imageRect={calibratedFront ? imageRect ?? undefined : undefined}
              anchor={calibratedFront ? liveAnchor ?? undefined : undefined}
              onAnchor={saveAnchor}
            />
          )}
          {!patchOnly && calibratedFront && src && !calibration && (
            <p role="status" className="absolute bottom-16 left-4 right-4 rounded-2xl bg-stage-photo/94 p-3 text-center text-sm text-stage-ink">Patch preview calibration unavailable for this photograph.</p>
          )}
          {!patchOnly && calibratedFront && calibration && src && (failedImage === src || (loadedImage?.src === src && !sourceReady)) && (
            <p role="status" className="absolute bottom-16 left-4 right-4 rounded-2xl bg-stage-photo/94 p-3 text-center text-sm text-stage-ink">Calibrated product photo unavailable. Patch preview will return when the verified photograph loads.</p>
          )}
          {!patchOnly && calibratedFront && invalidPosition && (
            <p role="status" className="absolute bottom-16 left-4 right-4 rounded-2xl bg-stage-photo/94 p-3 text-center text-sm text-stage-ink">Saved placement format unavailable. Use Reset in Place to choose a new position.</p>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-[14%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse,rgba(44,33,30,0.14),transparent_70%)]" />
        {placementMode && onPlacement && !patchOnly && (
          <>
            <div className="pointer-events-none absolute inset-0 z-20">
              {(Object.keys(HOT) as Placement[]).map((id) => {
                const blocked = size === "large" && (id === "side" || id === "rear");
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => choosePlacement(id, blocked)}
                    disabled={blocked}
                    className={cn(
                      "pointer-events-auto absolute min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 text-xs font-semibold shadow-[0_8px_22px_rgba(45,38,30,0.08)]",
                      placement === id && !blocked ? "bg-primary text-primary-fg" : "bg-stage-photo/95 text-stage-ink ring-1 ring-stage-line",
                      blocked && "cursor-not-allowed opacity-50",
                    )}
                    style={{ left: HOT[id].left, top: HOT[id].top }}
                  >
                    {HOT[id].label}
                  </button>
                );
              })}
            </div>
            {showPatch && usesDraftTransform && (
              <div className="absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-stage-photo/94 p-1.5 shadow-[0_8px_24px_rgba(45,38,30,0.1)] ring-1 ring-stage-line backdrop-blur">
                <button
                  type="button"
                  onClick={() => resizePatch(-SCALE_STEP)}
                  disabled={liveTransform.scale <= SCALE_MIN}
                  className="min-h-10 min-w-10 rounded-full px-2 text-sm font-semibold disabled:opacity-40"
                  aria-label="Make patch smaller"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={resetTransform}
                  className="min-h-10 rounded-full px-3 text-xs font-semibold"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => resizePatch(SCALE_STEP)}
                  disabled={liveTransform.scale >= SCALE_MAX}
                  className="min-h-10 min-w-10 rounded-full px-2 text-sm font-semibold disabled:opacity-40"
                  aria-label="Make patch larger"
                >
                  +
                </button>
              </div>
            )}
            <p className="pointer-events-none absolute left-1/2 top-[6.6rem] z-30 -translate-x-1/2 rounded-full bg-stage-photo/88 px-3 py-1.5 text-center text-[11px] font-semibold text-stage-ink shadow-sm ring-1 ring-stage-line/80 backdrop-blur">
              Drag the patch to place it
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
              active === item ? "bg-primary text-primary-fg" : "bg-stage-photo/92 text-stage-ink ring-1 ring-stage-line",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setZoom((value) => !value)}
        className="absolute bottom-3 right-3 z-30 min-h-11 rounded-full bg-stage-photo/92 px-3 text-xs font-semibold text-stage-ink shadow-[0_8px_22px_rgba(45,38,30,0.06)] ring-1 ring-stage-line"
      >
        {zoom ? "Fit" : "Zoom"}
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
  transform,
  interactive,
  onMove,
  calibration,
  imageRect,
  anchor,
  onAnchor,
}: {
  leather: ReturnType<typeof getLeatherette>;
  shape: PatchShape;
  size: PatchSize;
  placement: Placement;
  patchText: string;
  artworkUrl?: string;
  transform: PlacementTransform;
  interactive: boolean;
  onMove: (x: number, y: number, commit: boolean) => void;
  calibration?: Calibration;
  imageRect?: Rect;
  anchor?: Point;
  onAnchor: (anchor: Point, commit: boolean) => void;
}) {
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    width: number;
    height: number;
    bounds: Rect;
    anchor?: Point;
    lastAnchor?: Point;
  } | null>(null);
  const cleanupDrag = useRef<(() => void) | null>(null);
  const latestGeometry = useRef({ calibration, imageRect, placement });
  latestGeometry.current = { calibration, imageRect, placement };
  const pct = LEGACY_VIEW_SIZE_PCT[size] * transform.scale;
  const pos = PLACE[placement];
  const geometry = calibration && imageRect && anchor ? {
    ...crownToDisplay(anchor, calibration.bounds, imageRect),
    ...patchDimensions(size, patchAspectRatio(shape), calibration.bounds, imageRect, transform.scale),
  } : null;
  const frame: CSSProperties = {
    width: geometry ? geometry.width : `${pct}%`,
    height: geometry?.height,
    aspectRatio: patchAspectRatio(shape),
    left: geometry ? geometry.x : `${pos.left + transform.x}%`,
    top: geometry ? geometry.y : `${pos.top + transform.y}%`,
    // Coordinate changes apply atomically; interpolation can briefly lose ratio on resize.
    transition: geometry || drag.current ? "none" : "left 180ms ease, top 180ms ease, width 180ms ease",
    touchAction: interactive ? "none" : undefined,
  };
  const face: CSSProperties = {
    clipPath: clipFor(shape),
    backgroundColor: leather.hex,
    backgroundImage: leather.texture ? `url(${leather.texture})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: leather.ink,
    boxShadow: "0 10px 18px rgba(44,33,30,0.30), 0 2px 5px rgba(44,33,30,0.20), inset 0 1px 0 rgba(255,255,255,0.36)",
    transition: "clip-path 220ms ease",
  };

  useEffect(() => {
    return () => cleanupDrag.current?.();
  }, []);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!interactive) return;
    event.preventDefault();
    event.stopPropagation();
    cleanupDrag.current?.();
    const parent = event.currentTarget.parentElement;
    const bounds = parent?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return;

    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: transform.x,
      offsetY: transform.y,
      lastX: transform.x,
      lastY: transform.y,
      width: bounds.width,
      height: bounds.height,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      anchor,
      lastAnchor: anchor,
    };

    function cleanup() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      cleanupDrag.current = null;
    }

    function move(pointerEvent: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current || current.pointerId !== pointerEvent.pointerId) return;
      pointerEvent.preventDefault();
      const latest = latestGeometry.current;
      if (current.anchor && latest.calibration && latest.imageRect && isFrontPlacement(latest.placement)) {
        const rect = parent?.getBoundingClientRect();
        if (!rect) return;
        // Map viewport pointer delta through current zoom and current fitted geometry.
        const width = parent?.clientWidth ?? 0;
        const height = parent?.clientHeight ?? 0;
        const next = dragAnchor(current.anchor, {
          x: (pointerEvent.clientX - current.startX) * width / rect.width,
          y: (pointerEvent.clientY - current.startY) * height / rect.height,
        }, { width, height }, latest.calibration.bounds, latest.imageRect, latest.placement);
        current.lastAnchor = next;
        onAnchor(next, false);
        return;
      }
      const x = clamp(current.offsetX + ((pointerEvent.clientX - current.startX) / current.width) * 100, -OFFSET_X_LIMIT, OFFSET_X_LIMIT);
      const y = clamp(current.offsetY + ((pointerEvent.clientY - current.startY) / current.height) * 100, -OFFSET_Y_LIMIT, OFFSET_Y_LIMIT);
      current.lastX = x;
      current.lastY = y;
      onMove(x, y, false);
    }

    function finish(pointerEvent: globalThis.PointerEvent) {
      const current = drag.current;
      if (!current || current.pointerId !== pointerEvent.pointerId) return;
      pointerEvent.preventDefault();
      drag.current = null;
      cleanup();
      if (current.lastAnchor) onAnchor(current.lastAnchor, true);
      else onMove(current.lastX, current.lastY, true);
    }

    cleanupDrag.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { passive: false });
    window.addEventListener("pointercancel", finish, { passive: false });
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive) return;
    const amount = event.shiftKey ? 3 : 1;
    let x = transform.x;
    let y = transform.y;
    if (event.key === "ArrowLeft") x -= amount;
    else if (event.key === "ArrowRight") x += amount;
    else if (event.key === "ArrowUp") y -= amount;
    else if (event.key === "ArrowDown") y += amount;
    else return;
    event.preventDefault();
    event.stopPropagation();
    if (anchor && calibration && imageRect && isFrontPlacement(placement)) {
      const width = event.currentTarget.parentElement?.clientWidth ?? 0;
      const height = event.currentTarget.parentElement?.clientHeight ?? 0;
      onAnchor(dragAnchor(anchor, { x: (x - transform.x) * width / 100, y: (y - transform.y) * height / 100 }, { width, height }, calibration.bounds, imageRect, placement), true);
    } else onMove(x, y, true);
  }

  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2",
        interactive ? "z-30 cursor-grab touch-none select-none active:cursor-grabbing" : "z-10 pointer-events-none",
      )}
      style={frame}
      data-patch-overlay="true"
      data-patch-size={size}
      data-patch-anchor={anchor ? JSON.stringify(anchor) : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? "Drag patch to position it on the hat" : undefined}
      onPointerDown={startDrag}
      onDragStart={(event) => event.preventDefault()}
      onKeyDown={moveWithKeyboard}
    >
      <div
        key={`${leather.id}-${shape}-${size}`}
        className="patch-pop flex h-full w-full items-center justify-center overflow-hidden px-1.5 text-center"
        style={face}
      >
        {artworkUrl && !artworkUrl.startsWith("data:application/pdf") ? (
          <img
            src={artworkUrl}
            alt=""
            draggable={false}
            className="relative z-10 max-h-[82%] max-w-[82%] select-none object-contain"
            style={{ filter: "grayscale(1) contrast(1.4)", mixBlendMode: "multiply" }}
          />
        ) : (
          <span className="relative z-10 line-clamp-3 px-1 font-display text-[clamp(0.7rem,1.5vw,1.15rem)] leading-tight font-semibold tracking-wide">
            {artworkUrl ? "PDF" : patchText.trim() || "Your patch"}
          </span>
        )}
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
  const leather = getLeatherette(leatherette);
  const safe = shape;
  const style: CSSProperties = {
    clipPath: clipFor(safe),
    backgroundColor: leather.hex,
    backgroundImage: leather.texture ? `url(${leather.texture})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: leather.ink,
    width: size === "small" ? 168 : size === "large" ? 300 : 230,
    maxWidth: "82vw",
    aspectRatio: safe === "Oval" ? "1.45 / 1" : safe === "Circle" ? "1" : "1.35 / 1",
    boxShadow: "0 16px 30px rgba(44,33,30,0.16)",
  };
  return (
    <div className={cn("grid place-items-center", className)}>
      <div className="flex items-center justify-center px-3 text-center" style={style}>
        {artworkUrl && !artworkUrl.startsWith("data:application/pdf") ? (
          <img src={artworkUrl} alt="" className="max-h-[78%] max-w-[78%] object-contain" style={{ filter: "grayscale(1) contrast(1.35)", mixBlendMode: "multiply" }} />
        ) : (
          <span className="font-display text-lg leading-tight font-semibold">{artworkUrl ? "PDF artwork" : patchText.trim() || "Your patch"}</span>
        )}
      </div>
    </div>
  );
}

export function ShapeMark({ shape, className, texture }: { shape: PatchShape; className?: string; texture?: string }) {
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
