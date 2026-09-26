import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { HatPreview, ShapeMark } from "@/components/hat/hat-preview";
import { Button } from "@/components/ui/button";
import {
  ETSY_LISTING,
  FAMILIES,
  FAMILY_ORDER,
  LEATHERETTES,
  PATCH_SHAPES,
  PLACEMENTS,
  PRICING,
  colorsForFamily,
  estimateTotal,
  getLeatherette,
  type FamilyId,
  type PatchShape,
  type PatchSize,
  type Placement,
} from "@/lib/catalog";
import { resizeImage, useOrder } from "@/lib/order-store";
import { familyHero, stageThumb } from "@/lib/stage-photos";
import { MASTER } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

type StepId = "hat" | "color" | "material" | "shape" | "design" | "position" | "review";

const STEP_LABEL: Record<StepId, string> = {
  hat: "Hat",
  color: "Color",
  material: "Material",
  shape: "Shape",
  design: "Design",
  position: "Place",
  review: "Review",
};

function stepsFor(patchOnly: boolean): StepId[] {
  return patchOnly
    ? ["material", "shape", "design", "review"]
    : ["hat", "color", "material", "shape", "design", "position", "review"];
}

function isReadyFamily(id: FamilyId) {
  return MASTER.models.find((model) => model.id === id)?.bucket === "ready";
}

function tooLarge(size: PatchSize, placement: Placement) {
  return size === "large" && (placement === "side" || placement === "rear");
}

export function Builder({
  focus,
  initialOrderType,
  initialFamily,
  initialColor,
}: {
  focus?: StepId;
  initialOrderType?: "hat" | "patch";
  initialFamily?: FamilyId;
  initialColor?: string;
}) {
  const draft = useOrder();
  const [prefillPending, setPrefillPending] = useState(() => Boolean(initialOrderType || initialFamily || initialColor));
  const orderType = prefillPending && initialOrderType ? initialOrderType : draft.orderType;
  const familyId = prefillPending && initialFamily ? initialFamily : draft.family;
  const colorway = prefillPending
    ? initialColor !== undefined
      ? initialColor
      : initialFamily
        ? ""
        : draft.colorway
    : draft.colorway;
  const patchOnly = orderType === "patch";
  const steps = stepsFor(patchOnly);
  const [step, setStep] = useState<StepId>(focus ?? (patchOnly ? "material" : "hat"));
  const [warn, setWarn] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const active: StepId = steps.includes(step) ? step : (steps[0] ?? "hat");
  const index = steps.indexOf(active);
  const family = FAMILIES[familyId];
  const colors = colorsForFamily(familyId);
  const leather = getLeatherette(draft.leatherette);
  const qty = Math.max(1, Number(draft.quantity) || 1);
  const est = estimateTotal({
    orderType,
    tier: family.tier,
    quantity: qty,
    family: familyId,
    promo: draft.promo,
  });
  const shape: PatchShape = PATCH_SHAPES.includes(draft.patchShape as PatchShape) ? (draft.patchShape as PatchShape) : "Rounded Rectangle";

  useEffect(() => {
    if (initialFamily && draft.family !== initialFamily) draft.setFamily(initialFamily);
    if (initialOrderType && draft.orderType !== initialOrderType) draft.set("orderType", initialOrderType);
    if (initialColor !== undefined && draft.colorway !== initialColor) draft.set("colorway", initialColor);
    setPrefillPending(false);
  }, [initialColor, initialFamily, initialOrderType]);

  useEffect(() => {
    if (!PATCH_SHAPES.includes(draft.patchShape as PatchShape)) draft.set("patchShape", "Rounded Rectangle");
  }, [draft.patchShape, draft]);

  useEffect(() => {
    if (!patchOnly && !isReadyFamily(familyId)) draft.setFamily("112");
  }, [familyId, patchOnly]);

  useEffect(() => {
    if (focus) setStep(focus);
  }, [focus]);

  useEffect(() => {
    setStep((current) => (stepsFor(patchOnly).includes(current) ? current : stepsFor(patchOnly)[0]));
  }, [patchOnly]);

  useEffect(() => {
    if (active !== "color" || !colorway) return;
    document.getElementById(`swatch-${colorway}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active, colorway]);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.customerEmail.trim());
  const missingDesign = !draft.patchText.trim() && !draft.artworkDataUrl;
  const missingColor = !patchOnly && !colorway;
  const continueLabel =
    active === "review"
      ? missingColor
        ? "Choose a hat color"
        : !draft.customerName.trim()
          ? "Add your name"
        : !emailOk
          ? "Add your email"
          : missingDesign
            ? "Add a design"
            : "Continue on Etsy"
      : active === "hat"
        ? "Choose color"
        : active === "color" && !colorway
          ? "Choose color"
          : active === "design" && missingDesign
            ? "Add a design"
            : "Continue";

  const summary = useMemo(() => {
    return [
      "REC Mama Made custom order",
      `Name: ${draft.customerName || "(not provided)"}`,
      `Email: ${draft.customerEmail || "(not provided)"}`,
      `Type: ${patchOnly ? "Patch only" : "Custom patch hat"}`,
      patchOnly ? "" : `Hat: Richardson ${family.id} ${family.label}`,
      patchOnly ? "" : `Color: ${colorway || "(not selected)"}`,
      patchOnly ? "" : `Placement: ${PLACEMENTS.find((item) => item.id === draft.placement)?.label}`,
      `Material: ${leather.name} · ${leather.engrave}`,
      `Shape: ${shape}`,
      `Size: ${draft.patchSize}`,
      `Quantity: ${qty}`,
      `Design: ${draft.patchText || (draft.artworkDataUrl ? "Uploaded artwork" : "(none)")}`,
      `Notes: ${draft.notes || "(none)"}`,
      draft.promo ? `Promo: ${draft.promo}` : "",
      est.zaddy ? "Price: classic 112 at $25 with ZADDY." : "",
      "Proof included before production.",
    ]
      .filter(Boolean)
      .join("\n");
  }, [colorway, draft, family, leather, patchOnly, qty, shape]);

  function go(next: number) {
    const target = steps[Math.min(steps.length - 1, Math.max(0, next))];
    if (target) setStep(target);
    setDrawer(false);
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setWarn("Please choose a file smaller than 12 MB.");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "application/pdf"];
    if (file.type && !allowed.includes(file.type)) {
      setWarn("Use a PNG, JPG, SVG, or PDF.");
      return;
    }
    try {
      const result = await resizeImage(file);
      draft.set("artworkDataUrl", result.url);
      const longest = Math.max(result.width, result.height);
      setWarn(longest > 0 && longest < 600 ? "This image may be too small for clean engraving. We’ll review it before production." : "");
    } catch {
      setWarn("Could not read that file.");
    }
  }

  function choosePlacement(id: Placement) {
    if (tooLarge(draft.patchSize, id)) {
      setWarn("This patch size is too large for this position.");
      return;
    }
    setWarn("");
    draft.set("placement", id);
  }

  const next = steps[index + 1];
  const ready = !missingColor && Boolean(draft.customerName.trim()) && emailOk && !missingDesign;
  const canAdvance =
    !(active === "color" && !colorway) &&
    !(active === "design" && missingDesign);

  return (
    <div className="safe-grid lg:grid lg:min-h-[calc(100dvh-5.5rem)] lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <div className="relative min-h-[52vh] overflow-hidden bg-[radial-gradient(90%_70%_at_50%_32%,#fff_0%,#f6f1ea_58%,#e8e0d4_100%)] lg:sticky lg:top-[5.5rem] lg:h-[calc(100dvh-5.5rem)]">
        <p className="absolute left-5 top-4 z-20 text-[10px] font-semibold tracking-[0.15em] text-stage-muted uppercase sm:text-[11px]">Customization preview</p>
        <p className="absolute right-5 top-4 z-20 hidden max-w-[240px] text-right text-[11px] leading-snug text-stage-muted sm:block">
          Final engraving and placement are confirmed in your digital proof.
        </p>
        <div className="h-[52vh] min-h-[360px] sm:h-[58vh] lg:h-full lg:min-h-0">
          <HatPreview
            family={familyId}
            colorway={colorway}
            leatherette={draft.leatherette}
            shape={shape}
            size={draft.patchSize}
            placement={draft.placement}
            patchText={draft.patchText}
            artworkUrl={draft.artworkDataUrl || undefined}
            patchOnly={patchOnly}
            placementMode={active === "position"}
            onPlacement={choosePlacement}
          />
        </div>
      </div>

      <section className="flex min-w-0 flex-col border-t border-stage-line bg-white/92 pb-28 lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-hidden lg:border-l lg:border-t-0 lg:pb-0">
        <div className="sticky top-0 z-20 flex items-center gap-2 overflow-x-auto border-b border-stage-line bg-white/94 px-5 py-3 backdrop-blur-xl sm:px-6">
          <div className="flex shrink-0 rounded-full bg-stage p-1 ring-1 ring-stage-line">
            <button
              type="button"
              onClick={() => {
                draft.set("orderType", "hat");
                setStep("hat");
              }}
              className={cn("min-h-11 rounded-full px-3 text-sm font-semibold", !patchOnly ? "bg-primary text-primary-fg" : "text-stage-ink")}
            >
              Hat
            </button>
            <button
              type="button"
              onClick={() => {
                draft.set("orderType", "patch");
                setStep("material");
              }}
              className={cn("min-h-11 rounded-full px-3 text-sm font-semibold", patchOnly ? "bg-primary text-primary-fg" : "text-stage-ink")}
            >
              Patch only
            </button>
          </div>
          {steps.map((id, stepIndex) => (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold",
                id === active ? "bg-primary text-primary-fg" : "text-stage-muted",
              )}
            >
              {String(stepIndex + 1).padStart(2, "0")} {STEP_LABEL[id]}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
            <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-stage-ink">
              {patchOnly ? "Patch only" : `${family.id} ${family.label}${colorway ? ` · ${colorway}` : ""}`}
              {` · ${leather.name}`}
            </p>
            <p key={est.total} className="price-tick shrink-0 text-lg font-semibold tabular-nums">
              ${est.total.toFixed(2)}
            </p>
          </div>
          {patchOnly && (
            <p className="px-5 pt-1 text-xs leading-5 text-stage-muted sm:px-6">Patch only means a finished loose patch — no hat and no stitching/application.</p>
          )}

          {active === "hat" && (
            <div className="flex gap-3 overflow-x-auto px-5 py-4 sm:px-6">
              {FAMILY_ORDER.filter(isReadyFamily).map((id) => {
                const item = FAMILIES[id];
                const photo = familyHero(id);
                const count = colorsForFamily(id).length;
                const on = familyId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => draft.setFamily(id)}
                    className={cn(
                      "w-44 shrink-0 overflow-hidden rounded-2xl bg-white text-left shadow-[0_10px_28px_rgba(45,38,30,0.05)] ring-1 transition-transform duration-150",
                      on ? "ring-2 ring-primary" : "ring-stage-line hover:-translate-y-0.5",
                    )}
                  >
                    <span className="product-card-stage grid aspect-[4/3] place-items-center p-3">
                      {photo ? (
                        <img src={photo} alt="" className="h-auto max-h-[82%] w-auto max-w-[90%] object-contain" loading="lazy" decoding="async" />
                      ) : (
                        <span className="grid h-full place-items-center text-xs text-stage-muted">Photos coming</span>
                      )}
                    </span>
                    <span className="flex min-h-[74px] items-start justify-between gap-2 px-3 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-5">
                          {id} {item.label}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-stage-muted">
                          {count ? `${count} colors` : "Colors later"} · ${item.tier === "premium" ? PRICING.premium : PRICING.standard}
                        </span>
                      </span>
                      {on && <Check className="mt-0.5 size-4 shrink-0 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {active === "color" && (
            <div>
              <p className="px-5 pt-4 text-sm leading-6 text-stage-muted sm:px-6">
                {colors.length ? `${colors.length} colors` : "No colors listed yet"} · tap one and the hat changes
              </p>
              <div className="flex gap-3 overflow-x-auto px-5 py-4 sm:px-6">
                {colors.map((name) => {
                  const thumb = stageThumb(familyId, name);
                  const on = colorway === name;
                  return (
                    <button
                      key={name}
                      id={`swatch-${name}`}
                      type="button"
                      onClick={() => draft.set("colorway", name)}
                      className={cn(
                        "w-36 shrink-0 overflow-hidden rounded-2xl bg-white text-left shadow-[0_10px_28px_rgba(45,38,30,0.05)] ring-1",
                        on ? "ring-2 ring-primary" : "ring-stage-line",
                      )}
                    >
                      <span className="product-card-stage grid aspect-[4/3] place-items-center p-2.5">
                        {thumb ? (
                          <img src={thumb} alt="" className="h-auto max-h-[84%] w-auto max-w-[92%] object-contain" loading="lazy" decoding="async" />
                        ) : (
                          <span className="grid h-full place-items-center text-xs text-stage-muted">No photo yet</span>
                        )}
                      </span>
                      <span className="flex min-h-14 items-start justify-between gap-1 px-3 py-2.5 text-xs font-semibold leading-5">
                        <span>{name}</span>
                        {on && <Check className="size-3.5 shrink-0 text-primary" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {active === "material" && (
            <div className="flex gap-3 overflow-x-auto px-5 py-4 sm:px-6">
              {LEATHERETTES.map((item) => {
                const on = draft.leatherette === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (on) setMaterialOpen(true);
                      else draft.set("leatherette", item.id);
                    }}
                    className={cn(
                      "w-44 shrink-0 overflow-hidden rounded-2xl bg-white text-left shadow-[0_10px_28px_rgba(45,38,30,0.05)] ring-1 transition-transform duration-150",
                      on ? "ring-2 ring-primary" : "ring-stage-line hover:-translate-y-0.5",
                    )}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-stage">
                      <img src={item.texture} alt={`${item.name} material`} className="h-full w-full object-cover object-center" loading="lazy" decoding="async" />
                    </div>
                    <span className="flex min-h-[74px] items-start justify-between gap-2 px-3 py-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold leading-5">{item.name}</span>
                        <span className="mt-1 block text-xs leading-5 text-stage-muted">{on ? "Tap again to inspect" : item.engrave}</span>
                      </span>
                      {on && <Check className="size-4 shrink-0 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {active === "shape" && (
            <div className="px-5 py-4 sm:px-6">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {PATCH_SHAPES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => draft.set("patchShape", item)}
                    className={cn(
                      "w-28 shrink-0 rounded-2xl bg-stage px-2 py-3 text-center ring-1",
                      shape === item ? "ring-2 ring-primary" : "ring-stage-line",
                    )}
                  >
                    <ShapeMark shape={item} texture={leather.texture} className="mx-auto w-14" />
                    <span className="mt-2 block text-xs font-semibold leading-5">{item}</span>
                    {shape === item && <Check className="mx-auto mt-1 size-3.5 text-primary" />}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["small", "medium", "large"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      if (tooLarge(item, draft.placement)) {
                        setWarn("This patch size is too large for this position.");
                        return;
                      }
                      setWarn("");
                      draft.set("patchSize", item);
                    }}
                    className={cn(
                      "min-h-11 rounded-full px-4 text-sm font-semibold capitalize",
                      draft.patchSize === item ? "bg-primary text-primary-fg" : "bg-stage ring-1 ring-stage-line",
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {active === "design" && (
            <div className="grid gap-4 px-5 py-4 sm:px-6 md:grid-cols-2">
              <label className="block min-w-0">
                <span className="text-sm font-semibold">Text on the patch</span>
                <input
                  value={draft.patchText}
                  onChange={(event) => draft.set("patchText", event.target.value)}
                  placeholder="Type it. It shows on the hat."
                  className="mt-2 w-full rounded-xl bg-stage px-3 py-3 text-base ring-1 ring-stage-line"
                />
              </label>
              <label className="block min-w-0 rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line">
                <span className="text-sm font-semibold">Upload artwork</span>
                <span className="mt-1 block text-xs leading-5 text-stage-muted">PNG, JPG, WEBP, SVG, or PDF</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf"
                  className="mt-2 block w-full max-w-full text-sm"
                  onChange={(event) => void onUpload(event.target.files?.[0])}
                />
              </label>
              <p className="text-sm leading-6 text-stage-muted md:col-span-2">No REC Mama Made designs are in the library yet.</p>
            </div>
          )}

          {active === "position" && (
            <div className="px-5 py-5 sm:px-6">
              <p className="max-w-xl text-sm leading-6 text-stage-ink">
                Tap a spot on the hat. The patch moves there.
                {draft.placement ? ` Now: ${PLACEMENTS.find((item) => item.id === draft.placement)?.label}.` : ""}
              </p>
            </div>
          )}

          {active === "review" && (
            <div className="px-5 py-4 sm:px-6">
              <ul className="grid gap-2 text-sm md:grid-cols-2">
                <ReviewRow
                  label={patchOnly ? "Patch only" : `Richardson ${family.id}`}
                  value={patchOnly ? "Loose patch" : `${family.label}${colorway ? ` · ${colorway}` : ""}`}
                  onEdit={() => setStep(patchOnly ? "material" : "hat")}
                />
                <ReviewRow label="Material" value={`${leather.name} · ${leather.engrave}`} onEdit={() => setStep("material")} />
                <ReviewRow label="Shape" value={`${shape} · ${draft.patchSize}`} onEdit={() => setStep("shape")} />
                <ReviewRow
                  label="Design"
                  value={draft.patchText || (draft.artworkDataUrl ? "Uploaded artwork" : "Not added")}
                  onEdit={() => setStep("design")}
                />
                {!patchOnly && (
                  <ReviewRow
                    label="Position"
                    value={PLACEMENTS.find((item) => item.id === draft.placement)?.label ?? ""}
                    onEdit={() => setStep("position")}
                  />
                )}
              </ul>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
                <input
                  value={draft.customerName}
                  onChange={(event) => draft.set("customerName", event.target.value)}
                  placeholder="Name"
                  className="min-w-0 rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line"
                />
                <input
                  value={draft.customerEmail}
                  onChange={(event) => draft.set("customerEmail", event.target.value)}
                  placeholder="Email"
                  type="email"
                  className="min-w-0 rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line"
                />
                <input
                  type="number"
                  min={1}
                  aria-label="Quantity"
                  value={draft.quantity}
                  onChange={(event) => draft.set("quantity", Number(event.target.value) || 1)}
                  className="min-w-0 rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line"
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-stage-muted">
                {patchOnly ? "Patch only" : family.tier === "premium" ? "Premium hat + patch" : "Standard hat + patch"} · ${est.unit} each
                {est.bonus ? ` · ${est.bonus} bonus hat${est.bonus === 1 ? "" : "s"}` : ""} · Proof included before engraving.
              </p>
              <input
                value={draft.promo}
                onChange={(event) => draft.set("promo", event.target.value)}
                placeholder="Promo code"
                aria-label="Promo code"
                className="mt-3 w-full rounded-xl bg-stage px-3 py-3 text-sm ring-1 ring-stage-line"
              />
              {est.zaddy && <p className="mt-2 text-sm text-stage-ink">ZADDY applied. Classic 112 is $25.</p>}
              {draft.promo.trim().toUpperCase() === "ZADDY" && !est.zaddy && (
                <p className="mt-2 text-sm leading-6 text-stage-muted">ZADDY only prices the classic 112. Premium hats and patch only stay at full price.</p>
              )}
              <textarea
                value={draft.notes}
                onChange={(event) => draft.set("notes", event.target.value)}
                rows={3}
                placeholder="Notes for the proof"
                className="mt-3 w-full resize-y rounded-xl bg-stage px-3 py-3 text-sm ring-1 ring-stage-line"
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {ready ? (
                  <a href={ETSY_LISTING} target="_blank" rel="noreferrer">
                    <Button type="button">Continue on Etsy</Button>
                  </a>
                ) : (
                  <Button type="button" disabled>
                    {continueLabel}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(summary)}>
                  Copy build
                </Button>
                <a href={`mailto:?subject=${encodeURIComponent("REC Mama Made order")}&body=${encodeURIComponent(summary)}`}>
                  <Button type="button" variant="outline">
                    Email this build
                  </Button>
                </a>
              </div>
            </div>
          )}

          {warn && <p className="px-5 pb-3 text-sm leading-6 text-stage-ink sm:px-6">{warn}</p>}
        </div>

        <div className="hidden items-center justify-between gap-3 border-t border-stage-line bg-white px-5 py-4 sm:px-6 lg:flex">
          <p className="text-lg font-semibold tabular-nums">${est.total.toFixed(2)}</p>
          <Button
            type="button"
            disabled={next ? !canAdvance : !ready}
            onClick={() => {
              if (next && canAdvance) go(index + 1);
              else if (!next && ready) window.open(ETSY_LISTING, "_blank", "noopener");
            }}
          >
            {next && canAdvance ? `Continue · ${STEP_LABEL[next]}` : continueLabel}
          </Button>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stage-line bg-white/94 px-5 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-12px_34px_rgba(45,38,30,0.08)] backdrop-blur-xl lg:hidden">
        <button type="button" className="mb-1 min-h-6 text-xs font-semibold text-stage-muted" onClick={() => setDrawer((value) => !value)}>
          Your build
        </button>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-stage-photo ring-1 ring-stage-line">
            {patchOnly ? (
              <span className="grid h-full place-items-center text-[0.6rem]">Patch</span>
            ) : (
              <img src={stageThumb(familyId, colorway) ?? familyHero(familyId) ?? ""} alt="" className="h-auto max-h-[90%] w-auto max-w-[92%] object-contain" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">${est.total.toFixed(2)}</p>
            <p className="truncate text-xs text-stage-muted">
              {STEP_LABEL[active]} · {index + 1} of {steps.length}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={active === "review" ? !ready : !canAdvance}
            onClick={() => {
              if (active !== "review" && canAdvance) go(index + 1);
              else if (active === "review" && ready) window.open(ETSY_LISTING, "_blank", "noopener");
            }}
          >
            {continueLabel}
          </Button>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex items-end bg-bg/50 p-0 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="max-h-[82dvh] w-full overflow-auto rounded-t-3xl bg-white p-5 pb-24 text-stage-ink shadow-[0_-18px_50px_rgba(45,38,30,0.14)]" onClick={(event) => event.stopPropagation()}>
            <h2 className="font-display text-3xl">Your build</h2>
            <div className="mt-4 space-y-1 text-sm leading-6">
              <p>{patchOnly ? "Patch only" : `${family.id} ${family.label}`}</p>
              <p>{colorway || "Color not chosen"}</p>
              <p>{leather.name} · {leather.engrave}</p>
              <p>{shape} · {draft.patchSize}</p>
              {!patchOnly && <p>{PLACEMENTS.find((item) => item.id === draft.placement)?.label}</p>}
              <p>{draft.patchText || (draft.artworkDataUrl ? "Uploaded artwork" : "No design yet")}</p>
            </div>
            <p className="mt-3 text-lg font-semibold">${est.total.toFixed(2)}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {!patchOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => { setStep("color"); setDrawer(false); }}>
                  Edit color
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => { setStep("material"); setDrawer(false); }}>
                Edit material
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { setStep("design"); setDrawer(false); }}>
                Edit design
              </Button>
            </div>
          </div>
        </div>
      )}

      {materialOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90dvh] w-[min(560px,100%)] overflow-auto rounded-3xl bg-white text-stage-ink shadow-[0_24px_70px_rgba(45,38,30,0.18)]">
            <div className="aspect-[4/3] overflow-hidden bg-stage">
              <img src={leather.detail} alt={`${leather.name} material detail`} className="h-full w-full object-cover object-center" />
            </div>
            <div className="p-5 sm:p-6">
              <h2 className="font-display text-[clamp(2rem,8vw,3rem)] leading-tight">{leather.name}</h2>
              <p className="mt-2 text-sm leading-6">{leather.engrave}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" onClick={() => setMaterialOpen(false)}>
                  Use this material
                </Button>
                <Button type="button" variant="outline" onClick={() => setMaterialOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-stage px-3 py-3 ring-1 ring-stage-line/70">
      <span className="min-w-0">
        <span className="block text-xs text-stage-muted">{label}</span>
        <span className="mt-0.5 block break-words font-medium leading-5">{value}</span>
      </span>
      <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-primary" onClick={onEdit}>
        Edit
      </button>
    </li>
  );
}
