import type { CSSProperties, PointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { FamilyId, LeatheretteId, PatchShape, PatchSize, Placement } from "@/lib/catalog";
import { FAMILIES, getLeatherette } from "@/lib/catalog";
import { familyHero, stageViews } from "@/lib/stage-photos";
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

type ViewName = "front" | "side" | "back";
type ImageBox = { left: number; top: number; width: number; height: number };
type Surface = {
  anchorX: number;
  anchorY: number;
  spreadX: number;
  sizeScale: number;
  maxWidth: number;
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  skewX: number;
  skewY: number;
  scaleX: number;
};

const SIZE_PCT: Record<PatchSize, number> = { small: 18, medium: 24, large: 30 };

const DEFAULT_SURFACE: Record<ViewName, Surface> = {
  front: {
    anchorX: 50,
    anchorY: 44,
    spreadX: 12.5,
    sizeScale: 1,
    maxWidth: 31,
    rotateX: -2.4,
    rotateY: 0,
    rotateZ: 0,
    skewX: 0,
    skewY: 0,
    scaleX: 0.985,
  },
  side: {
    anchorX: 62,
    anchorY: 44,
    spreadX: 0,
    sizeScale: 0.84,
    maxWidth: 24,
    rotateX: -1,
    rotateY: -8,
    rotateZ: 1.2,
    skewX: -1.4,
    skewY: 0,
    scaleX: 0.96,
  },
  back: {
    anchorX: 50,
    anchorY: 40,
    spreadX: 0,
    sizeScale: 0.82,
    maxWidth: 23,
    rotateX: -2,
    rotateY: 0,
    rotateZ: 0,
    skewX: 0,
    skewY: 0,
    scaleX: 0.98,
  },
};

const FAMILY_SURFACE: Partial<Record<FamilyId, Partial<Record<ViewName, Partial<Surface>>>>> = {
  "112": { front: { anchorY: 43.5, spreadX: 12, maxWidth: 31 } },
  "112FP": { front: { anchorY: 44.5, spreadX: 11, sizeScale: 1.02, rotateX: -3 } },
  "112FPR": { front: { anchorY: 44.5, spreadX: 11, sizeScale: 1.02, rotateX: -3 } },
  "112P": { front: { anchorY: 43.5, spreadX: 12, maxWidth: 31 } },
  "112PFP": { front: { anchorY: 44.5, spreadX: 11, sizeScale: 1.02, rotateX: -3 } },
  "112PM": { front: { anchorY: 43.5, spreadX: 12, maxWidth: 31 } },
  "168": { front: { anchorY: 44.2, spreadX: 11.5, sizeScale: 0.95, maxWidth: 29 } },
  "168P": { front: { anchorY: 44.2, spreadX: 11.5, sizeScale: 0.95, maxWidth: 29 } },
  "256": { front: { anchorY: 47, spreadX: 10.5, sizeScale: 0.88, maxWidth: 27, rotateX: -1.2 } },
  "256P": { front: { anchorY: 47, spreadX: 10.5, sizeScale: 0.88, maxWidth: 27, rotateX: -1.2 } },
};

const HOT: Record<Placement, { left: string; top: string; label: string }> = {
  "front-center": { left: "50%", top: "13%", label: "Center" },
  "left-front": { left: "16%", top: "42%", label: "Left" },
  "right-front": { left: "84%", top: "42%", label: "Right" },
  side: { left: "84%", top: "68%", label: "Side" },
  rear: { left: "16%", top: "68%", label: "Rear" },
};

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

function aspectFor(shape: PatchShape) {
  if (shape === "Oval") return "1.45 / 1";
  if (shape === "Circle") return "1 / 1";
  return "1.35 / 1";
}

function patchOnView(placement: Placement, view: ViewName) {
  if (view === "side") return placement === "side";
  if (view === "back") return placement === "rear";
  return placement === "front-center" || placement === "left-front" || placement === "right-front";
}

function surfaceFor(family: FamilyId, view: ViewName, placement: Placement) {
  const base = DEFAULT_SURFACE[view];
  const override = FAMILY_SURFACE[family]?.[view];
  const surface = { ...base, ...override };
  let anchorX = surface.anchorX;
  let anchorY = surface.anchorY;
  let rotateY = surface.rotateY;
  let rotateZ = surface.rotateZ;

  if (view === "front" && placement === "left-front") {
    anchorX -= surface.spreadX;
    anchorY += 1.2;
    rotateY += 3.2;
    rotateZ -= 1.2;
  } else if (view === "front" && placement === "right-front") {
    anchorX += surface.spreadX;
    anchorY += 1.2;
    rotateY -= 3.2;
    rotateZ += 1.2;
  }

  return { ...surface, anchorX, anchorY, rotateY, rotateZ };
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
  const named = colorway.trim();
  const matched = stageViews(family, named || "none");
  const hero = !named && !patchOnly ? familyHero(family) : null;
  const shots = hero ? { front: hero, side: null, back: null } : matched;
  const available = (["front", "side", "back"] as const).filter((view) => shots[view]);
  const [view, setView] = useState<ViewName>("front");
  const [zoom, setZoom] = useState(false);
  const [imageBox, setImageBox] = useState<ImageBox | null>(null);
  const drag = useRef<{ x: number } | null>(null);
  const imageStage = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const active = available.includes(view) ? view : available[0] ?? "front";
  const src = shots[active];
  const showPatch = patchOnly || !src || patchOnView(placement, active);

  const viewKey = `${placement}|${shots.front ?? ""}|${shots.side ?? ""}|${shots.back ?? ""}`;
  useEffect(() => {
    if (placement === "side" && shots.side) setView("side");
    else if (placement === "rear" && shots.back) setView("back");
    else if (shots.front) setView("front");
  }, [viewKey, placement, shots.front, shots.side, shots.back]);

  useEffect(() => {
    const stage = imageStage.current;
    const image = imageRef.current;
    if (!src || !stage || !image) {
      setImageBox(null);
      return;
    }

    const measure = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
      const renderedWidth = image.naturalWidth * scale;
      const renderedHeight = image.naturalHeight * scale;
      setImageBox({
        left: (width - renderedWidth) / 2,
        top: (height - renderedHeight) / 2,
        width: renderedWidth,
        height: renderedHeight,
      });
    };

    measure();
    image.addEventListener("load", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => {
      image.removeEventListener("load", measure);
      observer.disconnect();
    };
  }, [src]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    drag.current = { x: event.clientX };
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
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
          ref={imageStage}
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
            />
          )}
          {!patchOnly && showPatch && imageBox && (
            <div
              className="pointer-events-none absolute z-10"
              style={{ left: imageBox.left, top: imageBox.top, width: imageBox.width, height: imageBox.height }}
            >
              <PatchOverlay
                family={family}
                view={active}
                leather={leather}
                shape={shape}
                size={size}
                placement={placement}
                patchText={patchText}
                artworkUrl={artworkUrl}
              />
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-[14%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse,rgba(44,33,30,0.14),transparent_70%)]" />
        {placementMode && onPlacement && !patchOnly && (
          <div className="absolute inset-0 z-20">
            {(Object.keys(HOT) as Placement[]).map((id) => {
              const blocked = size === "large" && (id === "side" || id === "rear");
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onPlacement(id)}
                  className={cn(
                    "absolute min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 text-xs font-semibold shadow-[0_8px_22px_rgba(45,38,30,0.08)]",
                    placement === id && !blocked ? "bg-primary text-primary-fg" : "bg-stage-photo/95 text-stage-ink ring-1 ring-stage-line",
                    blocked && "opacity-50",
                  )}
                  style={{ left: HOT[id].left, top: HOT[id].top }}
                >
                  {HOT[id].label}
                </button>
              );
            })}
          </div>
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
  family,
  view,
  leather,
  shape,
  size,
  placement,
  patchText,
  artworkUrl,
}: {
  family: FamilyId;
  view: ViewName;
  leather: ReturnType<typeof getLeatherette>;
  shape: PatchShape;
  size: PatchSize;
  placement: Placement;
  patchText: string;
  artworkUrl?: string;
}) {
  const surface = surfaceFor(family, view, placement);
  const pct = Math.min(SIZE_PCT[size] * surface.sizeScale, surface.maxWidth);
  const frame: CSSProperties = {
    width: `${pct}%`,
    aspectRatio: aspectFor(shape),
    left: `${surface.anchorX}%`,
    top: `${surface.anchorY}%`,
    transition: "left 220ms ease, top 220ms ease, width 220ms ease",
  };
  const mount: CSSProperties = {
    transform: `perspective(760px) rotateX(${surface.rotateX}deg) rotateY(${surface.rotateY}deg) rotateZ(${surface.rotateZ}deg) skewX(${surface.skewX}deg) skewY(${surface.skewY}deg) scaleX(${surface.scaleX})`,
    transformOrigin: "50% 58%",
    filter: "drop-shadow(0 2px 2px rgba(44,33,30,0.18)) drop-shadow(0 5px 7px rgba(44,33,30,0.08))",
  };
  const face: CSSProperties = {
    clipPath: clipFor(shape),
    backgroundColor: leather.hex,
    backgroundImage: leather.texture ? `url(${leather.texture})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: leather.ink,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(44,33,30,0.12)",
    transition: "clip-path 220ms ease",
  };

  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={frame}
    >
      <div className="h-full w-full" style={mount}>
        <div
          key={`${leather.id}-${shape}-${size}`}
          className="patch-pop flex h-full w-full items-center justify-center overflow-hidden px-1.5 text-center"
          style={face}
        >
          {artworkUrl && !artworkUrl.startsWith("data:application/pdf") ? (
            <img
              src={artworkUrl}
              alt=""
              className="relative z-10 max-h-[82%] max-w-[82%] object-contain"
              style={{ filter: "grayscale(1) contrast(1.4)", mixBlendMode: "multiply" }}
            />
          ) : (
            <span className="relative z-10 line-clamp-3 px-1 font-display text-[clamp(0.7rem,1.5vw,1.15rem)] leading-tight font-semibold tracking-wide">
              {artworkUrl ? "PDF" : patchText.trim() || "Your patch"}
            </span>
          )}
        </div>
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
    aspectRatio: aspectFor(safe),
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
