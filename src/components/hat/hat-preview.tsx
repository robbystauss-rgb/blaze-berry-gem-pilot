import type { CSSProperties, PointerEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { FamilyId, LeatheretteId, PatchShape, PatchSize, Placement } from "@/lib/catalog";
import { FAMILIES, getLeatherette } from "@/lib/catalog";
import { parseColorway } from "@/lib/colorways";
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

const SIZE_PCT: Record<PatchSize, number> = { small: 22, medium: 30, large: 38 };

const PLACE: Record<Placement, { left: string; top: string }> = {
  "front-center": { left: "50%", top: "44%" },
  "left-front": { left: "37%", top: "46%" },
  "right-front": { left: "63%", top: "46%" },
  side: { left: "62%", top: "44%" },
  rear: { left: "50%", top: "40%" },
};

const HOT: Record<Placement, { left: string; top: string; label: string }> = {
  "front-center": { left: "50%", top: "10%", label: "Center" },
  "left-front": { left: "10%", top: "42%", label: "Left" },
  "right-front": { left: "90%", top: "42%", label: "Right" },
  side: { left: "90%", top: "68%", label: "Side" },
  rear: { left: "10%", top: "68%", label: "Rear" },
};

type ViewName = "front" | "side" | "back";

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
  const colors = parseColorway(colorway || "Black");
  const leather = getLeatherette(leatherette);
  const named = colorway.trim();
  const matched = stageViews(family, named || "none");
  const hero = !named && !patchOnly ? familyHero(family) : null;
  const shots = hero ? { front: hero, side: null, back: null } : matched;
  const available = (["front", "side", "back"] as const).filter((view) => shots[view]);
  const [view, setView] = useState<ViewName>("front");
  const [zoom, setZoom] = useState(false);
  const drag = useRef<{ x: number } | null>(null);
  const uid = useId().replace(/:/g, "");
  const active = available.includes(view) ? view : available[0] ?? "front";
  const src = shots[active];
  const showPatch = patchOnly || !src || patchOnView(placement, active);

  const viewKey = `${placement}|${shots.front ?? ""}|${shots.side ?? ""}|${shots.back ?? ""}`;
  useEffect(() => {
    if (placement === "side" && shots.side) setView("side");
    else if (placement === "rear" && shots.back) setView("back");
    else if (shots.front) setView("front");
  }, [viewKey, placement, shots.front, shots.side, shots.back]);

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
    <div className={cn("relative h-full min-h-[46vh] lg:min-h-0", className)}>
      <div
        className="relative h-full min-h-[46vh] touch-pan-y lg:min-h-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{ transform: zoom ? "scale(1.35)" : "scale(1)" }}
        >
          {patchOnly || !src ? (
            <div className="grid h-full place-items-center">
              {patchOnly ? (
                <PatchCard
                  key={`${leatherette}-${shape}-${size}`}
                  leatherette={leatherette}
                  shape={shape === "Louisiana" ? "Rounded Rectangle" : shape}
                  size={size}
                  patchText={patchText}
                  artworkUrl={artworkUrl}
                />
              ) : (
                <HatSvg uid={uid} silhouette={FAMILIES[family].silhouette} colors={colors} />
              )}
            </div>
          ) : (
            <img
              key={src}
              src={src}
              alt={`${FAMILIES[family].label} ${named || "model"} ${active}`}
              className="stage-in h-full w-full object-contain"
            />
          )}
          {!patchOnly && showPatch && (
            <PatchOverlay
              leather={leather}
              shape={shape === "Louisiana" ? "Rounded Rectangle" : shape}
              size={size}
              placement={placement}
              patchText={patchText}
              artworkUrl={artworkUrl}
            />
          )}
        </div>
        <div className="pointer-events-none absolute bottom-[14%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse,rgba(44,33,30,0.16),transparent_70%)]" />
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
                    "absolute min-h-11 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 text-xs font-semibold",
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
      <div className="absolute bottom-2 left-2 z-30 flex gap-1">
        {available.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={cn(
              "min-h-11 rounded-full px-3 text-xs font-semibold capitalize",
              active === item ? "bg-primary text-primary-fg" : "bg-stage-photo/90 text-stage-ink",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setZoom((value) => !value)}
        className="absolute right-2 bottom-2 z-30 min-h-11 rounded-full bg-stage-photo/90 px-3 text-xs font-semibold text-stage-ink"
      >
        {zoom ? "Fit" : "Zoom"}
      </button>
      {showCaption && (
        <p className="pointer-events-none absolute top-3 right-4 left-4 z-10 text-center text-sm text-stage-muted">
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
}: {
  leather: ReturnType<typeof getLeatherette>;
  shape: PatchShape;
  size: PatchSize;
  placement: Placement;
  patchText: string;
  artworkUrl?: string;
}) {
  const pct = SIZE_PCT[size];
  const pos = PLACE[placement];
  const frame: CSSProperties = {
    width: `${pct}%`,
    aspectRatio: shape === "Oval" ? "1.45 / 1" : shape === "Circle" ? "1 / 1" : "1.35 / 1",
    left: pos.left,
    top: pos.top,
    transition: "left 220ms ease, top 220ms ease, width 220ms ease",
  };
  const face: CSSProperties = {
    clipPath: clipFor(shape),
    backgroundColor: leather.hex,
    backgroundImage: leather.texture
      ? `linear-gradient(160deg, ${leather.hi} 0%, transparent 46%), url(${leather.texture})`
      : `linear-gradient(160deg, ${leather.hi} 0%, ${leather.hex} 55%, ${leather.lo} 100%)`,
    backgroundSize: "cover",
    color: leather.ink,
    boxShadow: "0 12px 22px rgba(44,33,30,0.32), inset 0 1px 0 rgba(255,255,255,0.4)",
    transition: "clip-path 220ms ease",
  };

  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={frame}
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
  );
}

export function MiniHat({
  family,
  colorway,
  className,
}: {
  family: FamilyId;
  colorway: string;
  className?: string;
}) {
  const colors = parseColorway(colorway);
  const uid = useId().replace(/:/g, "");
  return (
    <div className={cn("overflow-hidden bg-stage-photo", className)}>
      <HatSvg uid={uid} silhouette={FAMILIES[family].silhouette} colors={colors} />
    </div>
  );
}

function HatSvg({
  uid,
  silhouette,
  colors,
}: {
  uid: string;
  silhouette: "trucker" | "seven" | "gramps";
  colors: ReturnType<typeof parseColorway>;
}) {
  const mesh = silhouette === "trucker";
  const rope = silhouette === "gramps";
  const seams = silhouette === "seven" ? 6 : silhouette === "gramps" ? 4 : 3;

  return (
    <svg viewBox="0 0 320 240" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`crown-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.front} />
          <stop offset="100%" stopColor={colors.front} stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`visor-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.visor} />
          <stop offset="100%" stopColor={colors.visor} stopOpacity="0.75" />
        </linearGradient>
        <pattern id={`mesh-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="3.5" cy="3.5" r="1.55" fill={colors.mesh} opacity="0.55" />
        </pattern>
      </defs>
      <ellipse cx="160" cy="214" rx="92" ry="10" fill="rgba(44,33,30,0.12)" />
      <path d="M58 168 C70 118, 100 72, 160 68 C220 72, 250 118, 262 168 C240 176, 80 176, 58 168 Z" fill={mesh ? colors.mesh : `url(#crown-${uid})`} />
      {mesh && <path d="M168 76 C230 82, 252 130, 258 166 C200 174, 176 150, 168 76 Z" fill={`url(#mesh-${uid})`} />}
      <path d="M62 166 C78 108, 112 78, 160 74 C152 118, 120 150, 78 166 Z" fill={`url(#crown-${uid})`} />
      <path d="M160 74 C208 78, 242 108, 258 166 C216 150, 176 118, 160 74 Z" fill={colors.front} opacity="0.92" />
      {Array.from({ length: seams }).map((_, i) => {
        const t = (i + 1) / (seams + 1);
        return (
          <path key={i} d={`M160 76 Q ${70 + t * 180} 120 ${58 + t * 204} 166`} fill="none" stroke="rgba(44,33,30,0.18)" strokeWidth="1" />
        );
      })}
      {rope && <path d="M78 158 C120 148, 200 148, 242 158" fill="none" stroke={colors.rope} strokeWidth="4" strokeLinecap="round" />}
      <ellipse cx="160" cy="74" rx="9" ry="5" fill={colors.visor} />
      <path d="M52 168 C90 186, 230 186, 268 168 C250 198, 70 198, 52 168 Z" fill={`url(#visor-${uid})`} />
    </svg>
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
  const safe = shape === "Louisiana" ? "Rounded Rectangle" : shape;
  const style: CSSProperties = {
    clipPath: clipFor(safe),
    backgroundColor: leather.hex,
    backgroundImage: leather.texture
      ? `linear-gradient(160deg, ${leather.hi}, transparent 50%), url(${leather.texture})`
      : `linear-gradient(160deg, ${leather.hi}, ${leather.hex} 55%, ${leather.lo})`,
    backgroundSize: "cover",
    color: leather.ink,
    width: size === "small" ? 168 : size === "large" ? 300 : 230,
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
        clipPath: clipFor(shape === "Louisiana" ? "Rounded Rectangle" : shape),
        aspectRatio: shape === "Circle" ? "1" : shape === "Oval" ? "1.4 / 1" : "1.3 / 1",
        backgroundImage: texture ? `url(${texture})` : undefined,
        backgroundSize: "cover",
      }}
    />
  );
}
