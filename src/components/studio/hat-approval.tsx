import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MASTER,
  type CatalogColorway,
  type CatalogModel,
  type ColorFilter,
  type ModelOfferStatus,
  type StockStatus,
  colorDecision,
  displayName,
  drivePhoto,
  matchesFilter,
  matchesQuery,
  modelCounts,
  offeredLabel,
  priceLabel,
  richardsonLabel,
  stockLabel,
  unitPrice,
  useStudio,
} from "@/lib/studio-store";

const FILTERS: { id: ColorFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "offered", label: "Offered" },
  { id: "not-offered", label: "Not offered" },
  { id: "in-stock", label: "In stock" },
  { id: "out-of-stock", label: "Out of stock" },
  { id: "low-stock", label: "Low stock" },
  { id: "featured", label: "Featured" },
  { id: "legacy", label: "Legacy" },
  { id: "current", label: "Current" },
  { id: "needs-review", label: "Needs review" },
];

const MODEL_STATUSES: { id: ModelOfferStatus; label: string }[] = [
  { id: "not-offered", label: "Not offered" },
  { id: "active", label: "Active" },
  { id: "hidden", label: "Hidden" },
  { id: "assets-incomplete", label: "Assets incomplete" },
  { id: "discontinued", label: "Discontinued" },
];

const STOCKS: { id: StockStatus; label: string }[] = [
  { id: "unknown", label: "Stock unknown" },
  { id: "in-stock", label: "In stock" },
  { id: "low-stock", label: "Low stock" },
  { id: "out-of-stock", label: "Out of stock" },
];

type ViewName = "front" | "side" | "back";

export function HatApproval() {
  const [open, setOpen] = useState<Record<string, boolean>>({ "112": true });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ColorFilter>("all");
  const [viewer, setViewer] = useState<{ modelId: string; colorId: string; view: ViewName } | null>(null);
  const [stockDraft, setStockDraft] = useState<StockStatus>("in-stock");
  const [priceDraft, setPriceDraft] = useState("0");
  const [statusNote, setStatusNote] = useState("");
  const modelStatus = useStudio((s) => s.modelStatus);
  const colors = useStudio((s) => s.colors);
  const selected = useStudio((s) => s.selected);
  const history = useStudio((s) => s.history);
  const undoStack = useStudio((s) => s.undoStack);
  const setModelStatus = useStudio((s) => s.setModelStatus);
  const setActivationOverride = useStudio((s) => s.setActivationOverride);
  const activationOverride = useStudio((s) => s.activationOverride);
  const patchColor = useStudio((s) => s.patchColor);
  const toggleSelected = useStudio((s) => s.toggleSelected);
  const setSelected = useStudio((s) => s.setSelected);
  const replaceSelection = useStudio((s) => s.replaceSelection);
  const applySelected = useStudio((s) => s.applySelected);
  const undo = useStudio((s) => s.undo);

  const needle = query.trim().toLowerCase();
  const filtering = needle.length > 0 || filter !== "all";
  const ready = MASTER.models.filter((model) => model.bucket === "ready");
  const incomplete = MASTER.models.filter((model) => model.bucket === "incomplete");

  const visibleByModel = useMemo(() => {
    const map = new Map<string, CatalogColorway[]>();
    for (const model of MASTER.models) {
      const status = modelStatus[model.id] ?? "not-offered";
      map.set(
        model.id,
        model.colorways.filter((color) => {
          const decision = colorDecision({ colors }, color.id);
          return matchesFilter(color, decision, filter) && matchesQuery(model, color, decision, status, needle);
        }),
      );
    }
    return map;
  }, [colors, filter, modelStatus, needle]);

  const shownIds = useMemo(() => {
    return MASTER.models.flatMap((model) => {
      const list = visibleByModel.get(model.id) ?? [];
      const shown = filtering ? list.length > 0 : (open[model.id] ?? false);
      return shown ? list.map((color) => color.id) : [];
    });
  }, [filtering, open, visibleByModel]);
  const totalColors = MASTER.models.reduce((sum, model) => sum + model.colorways.length, 0);
  const selectedIds = Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => id);
  const selectedHidden = selectedIds.filter((id) => !shownIds.includes(id)).length;

  function selectModelVisible(modelId: string) {
    const model = MASTER.models.find((item) => item.id === modelId);
    if (!model) return;
    const visible = new Set((visibleByModel.get(modelId) ?? []).map((color) => color.id));
    const off = model.colorways.map((color) => color.id).filter((id) => !visible.has(id));
    setSelected(off, false);
    setSelected([...visible], true);
  }

  const viewerModel = MASTER.models.find((model) => model.id === viewer?.modelId) ?? null;
  const viewerList = viewerModel ? (visibleByModel.get(viewerModel.id) ?? []) : [];
  const viewerColor = viewerList.find((color) => color.id === viewer?.colorId) ?? viewerModel?.colorways.find((color) => color.id === viewer?.colorId) ?? null;

  function selectVisible() {
    replaceSelection(shownIds);
  }

  return (
    <div className={selectedIds.length ? "space-y-6 pb-28" : "space-y-6"}>
      <div className="sticky top-16 z-20 -mx-1 space-y-3 bg-stage/95 px-1 py-3 backdrop-blur-md">
        <label className="block">
          <span className="sr-only">Search colors</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search color, display name, model, or status"
            className="w-full rounded-2xl bg-stage-photo px-4 py-3 text-sm text-stage-ink shadow-stage ring-1 ring-stage-line"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Color filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold ${filter === item.id ? "bg-primary text-primary-fg" : "bg-stage-photo text-stage-ink ring-1 ring-stage-line"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="text-stage-ink" onClick={selectVisible}>
            Select visible ({shownIds.length})
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-stage-ink" disabled={!undoStack.length} onClick={undo}>
            Undo
          </Button>
          <p className="text-sm text-stage-muted">
            {filtering
              ? `${shownIds.length} match. ${totalColors - shownIds.length} supplied colors are outside this filter and are not selected.`
              : `Select visible uses open models only. Closed models are not selected.`}
          </p>
        </div>
        {statusNote ? <p className="text-sm text-stage-ink">{statusNote}</p> : null}
        <details className="text-sm text-stage-muted">
          <summary className="cursor-pointer font-semibold text-stage-ink">Session changes ({history.length})</summary>
          {history.length === 0 ? (
            <p className="mt-2">No catalog changes yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {history.slice(0, 12).map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
              {history.length > 12 ? <li>And {history.length - 12} earlier changes.</li> : null}
            </ul>
          )}
        </details>
      </div>

      <section className="space-y-4">
        <h2 className="font-display text-3xl text-stage-ink">Ready for visual approval</h2>
        <p className="max-w-3xl text-sm leading-6 text-stage-muted">
          Real front photos only. Nothing is offered until you say so. Richardson listing a color is not the same as REC Mama Made offering it.
        </p>
        {ready.map((model) => (
          <ModelBlock
            key={model.id}
            model={model}
            open={open[model.id] ?? false}
            filtering={filtering}
            visible={visibleByModel.get(model.id) ?? []}
            status={modelStatus[model.id] ?? "not-offered"}
            override={Boolean(activationOverride[model.id])}
            colors={colors}
            selected={selected}
            onToggle={() => setOpen((current) => ({ ...current, [model.id]: !current[model.id] }))}
            onStatus={(status) => {
              const result = setModelStatus(model.id, status);
              setStatusNote(result.ok ? "" : result.reason);
            }}
            onOverride={(on) => setActivationOverride(model.id, on)}
            onToggleSelected={toggleSelected}
            onSelectVisible={() => selectModelVisible(model.id)}
            onSelectRest={(ids) => setSelected(ids, true)}
            onClearModel={(ids) => setSelected(ids, false)}
            onPatchColor={patchColor}
            onOpen={(colorId) => setViewer({ modelId: model.id, colorId, view: "front" })}
          />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl text-stage-ink">Assets incomplete</h2>
        <p className="max-w-3xl text-sm leading-6 text-stage-muted">
          Kept separate from the approval grid. Not customer-selectable unless you explicitly override that block. Nothing here is deleted.
        </p>
        {incomplete.map((model) => (
          <ModelBlock
            key={model.id}
            model={model}
            open={open[model.id] ?? false}
            filtering={filtering}
            visible={visibleByModel.get(model.id) ?? []}
            status={modelStatus[model.id] ?? "assets-incomplete"}
            override={Boolean(activationOverride[model.id])}
            colors={colors}
            selected={selected}
            onToggle={() => setOpen((current) => ({ ...current, [model.id]: !current[model.id] }))}
            onStatus={(status) => {
              const result = setModelStatus(model.id, status);
              setStatusNote(result.ok ? "" : result.reason);
            }}
            onOverride={(on) => setActivationOverride(model.id, on)}
            onToggleSelected={toggleSelected}
            onSelectVisible={() => selectModelVisible(model.id)}
            onSelectRest={(ids) => setSelected(ids, true)}
            onClearModel={(ids) => setSelected(ids, false)}
            onPatchColor={patchColor}
            onOpen={(colorId) => setViewer({ modelId: model.id, colorId, view: "front" })}
          />
        ))}
      </section>

      {selectedIds.length > 0 && (
        <ActionBar
          count={selectedIds.length}
          hiddenCount={selectedHidden}
          stockDraft={stockDraft}
          priceDraft={priceDraft}
          onStockDraft={setStockDraft}
          onPriceDraft={setPriceDraft}
          onOffer={() => applySelected(selectedIds, { offered: true, hidden: false })}
          onHide={() => applySelected(selectedIds, { offered: false, hidden: true })}
          onStock={() => applySelected(selectedIds, { stock: stockDraft })}
          onPrice={() => {
            const amount = Number(priceDraft);
            if (!Number.isFinite(amount)) return;
            applySelected(selectedIds, { priceAdjust: amount });
          }}
          onFeature={() => applySelected(selectedIds, { featured: true })}
          onClear={() => replaceSelection([])}
        />
      )}

      {viewer && viewerModel && viewerColor && (
        <Viewer
          model={viewerModel}
          color={viewerColor}
          list={viewerList.length ? viewerList : [viewerColor]}
          view={viewer.view}
          onView={(view) => setViewer({ ...viewer, view })}
          onColor={(colorId) => setViewer({ ...viewer, colorId, view: "front" })}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function ModelBlock({
  model,
  open,
  filtering,
  visible,
  status,
  override,
  colors,
  selected,
  onToggle,
  onStatus,
  onOverride,
  onToggleSelected,
  onSelectVisible,
  onSelectRest,
  onClearModel,
  onPatchColor,
  onOpen,
}: {
  model: CatalogModel;
  open: boolean;
  filtering: boolean;
  visible: CatalogColorway[];
  status: ModelOfferStatus;
  override: boolean;
  colors: Record<string, ReturnType<typeof colorDecision>>;
  selected: Record<string, boolean>;
  onToggle: () => void;
  onStatus: (status: ModelOfferStatus) => void;
  onOverride: (on: boolean) => void;
  onToggleSelected: (id: string) => void;
  onSelectVisible: () => void;
  onSelectRest: (ids: string[]) => void;
  onClearModel: (ids: string[]) => void;
  onPatchColor: (id: string, patch: Partial<ReturnType<typeof colorDecision>>) => void;
  onOpen: (colorId: string) => void;
}) {
  const shown = filtering ? visible.length > 0 : open;
  const counts = modelCounts(model, colors);
  const hiddenCount = model.colorways.length - visible.length;
  const blocked = model.bucket === "incomplete" && !override;
  const richardson =
    model.richardsonListed != null ? `${model.richardsonListed} Richardson current` : "Richardson count not checked";

  return (
    <article className="rounded-3xl bg-stage ring-1 ring-stage-line">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 md:p-5">
        <button type="button" className="min-w-0 text-left" onClick={onToggle}>
          <h3 className="font-display text-3xl text-stage-ink">
            Richardson {model.code} — {model.officialName}
          </h3>
          <p className="mt-1 text-sm text-stage-muted">
            {model.suppliedCount} supplied · {richardson} · {counts.offered} offered · {counts.inStock} in stock
            {filtering && visible.length === 0 ? " · No match" : ""}
          </p>
        </button>
        <label className="text-xs font-semibold tracking-wide text-stage-muted uppercase">
          Model status
          <select
            value={status}
            onChange={(event) => onStatus(event.target.value as ModelOfferStatus)}
            className="mt-2 block min-h-11 rounded-full bg-stage-photo px-3 text-sm font-medium tracking-normal text-stage-ink normal-case ring-1 ring-stage-line"
          >
            {MODEL_STATUSES.map((item) => (
              <option key={item.id} value={item.id} disabled={item.id === "active" && blocked}>
                {item.label}
              </option>
            ))}
          </select>
          {blocked ? <span className="mt-2 block max-w-xs text-sm font-medium tracking-normal text-stage-ink normal-case">Active is locked until the missing photos are added, or you open this model and override it.</span> : null}
        </label>
      </div>
      {shown && (
        <div className="border-t border-stage-line px-4 py-4 md:px-5">
          <p className="max-w-3xl text-sm leading-6 text-stage-muted">{model.note}</p>
          {blocked && (
            <p className="mt-2 text-sm text-stage-ink">
              Customer activation is blocked. Fronts can be reviewed here. Active stays unavailable until the missing photos exist, or you override that rule.
            </p>
          )}
          {model.bucket === "incomplete" && (
            <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-stage-ink">
              <input type="checkbox" checked={override} onChange={(event) => onOverride(event.target.checked)} />
              Override and allow Active anyway
            </label>
          )}
          {visible.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="text-stage-ink" onClick={onSelectVisible}>
                Select visible ({visible.length})
              </Button>
              {filtering && hiddenCount > 0 && (
                <Button type="button" variant="outline" size="sm" className="text-stage-ink" onClick={() => onSelectRest(model.colorways.map((color) => color.id))}>
                  Select entire model ({model.colorways.length}), including {hiddenCount} hidden by this filter
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" className="text-stage-ink" onClick={() => onClearModel(model.colorways.map((color) => color.id))}>
                Clear this model
              </Button>
            </div>
          )}
          {visible.length === 0 ? (
            model.heroDriveId && model.colorways.length === 0 ? (
              <div className="mt-4 max-w-sm">
                <img
                  src={drivePhoto(model.heroDriveId, 640) ?? ""}
                  alt={`${model.code} product photo`}
                  className="h-64 w-full rounded-2xl bg-stage-photo object-contain shadow-stage"
                />
                <p className="mt-2 text-sm text-stage-muted">One product photo. No color library, so nothing here can be offered.</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-stage-muted">
                {filtering ? "No supplied color matches this filter." : "No supplied color photos for this model."}
              </p>
            )
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((color) => (
                <ColorCard
                  key={color.id}
                  model={model}
                  color={color}
                  decision={colorDecision({ colors }, color.id)}
                  picked={Boolean(selected[color.id])}
                  onToggleSelected={() => onToggleSelected(color.id)}
                  onPatch={(patch) => onPatchColor(color.id, patch)}
                  onOpen={() => onOpen(color.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ColorCard({
  model,
  color,
  decision,
  picked,
  onToggleSelected,
  onPatch,
  onOpen,
}: {
  model: CatalogModel;
  color: CatalogColorway;
  decision: ReturnType<typeof colorDecision>;
  picked: boolean;
  onToggleSelected: () => void;
  onPatch: (patch: Partial<ReturnType<typeof colorDecision>>) => void;
  onOpen: () => void;
}) {
  const src = drivePhoto(color.views.front, 640);
  const partial = !color.views.side || !color.views.back;
  return (
    <article className={`flex flex-col rounded-2xl bg-stage-photo p-3 shadow-stage ring-1 ${picked ? "ring-primary" : "ring-stage-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-stage-ink">
          <input type="checkbox" className="size-5" checked={picked} onChange={onToggleSelected} />
          Select
        </label>
        {decision.featured ? <span className="text-xs font-semibold text-primary">Featured</span> : null}
      </div>
      <button type="button" className="mt-1 overflow-hidden rounded-xl bg-stage-photo" onClick={onOpen}>
        {src ? (
          <img src={src} alt={`${color.officialName} front`} loading="lazy" className="h-72 w-full object-contain" />
        ) : (
          <span className="grid h-72 place-items-center text-sm text-stage-muted">No front photo</span>
        )}
      </button>
      <h4 className="mt-3 text-lg font-semibold text-stage-ink">{color.officialName}</h4>
      {color.notes ? <p className="mt-1 text-sm leading-5 text-stage-muted">{color.notes}</p> : null}
      <dl className="mt-2 space-y-1 text-sm text-stage-ink">
        <div className="flex justify-between gap-3">
          <dt className="text-stage-muted">Richardson</dt>
          <dd>{richardsonLabel(color.richardsonStatus)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stage-muted">REC Mama Made</dt>
          <dd>{offeredLabel(decision)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stage-muted">Stock</dt>
          <dd>{stockLabel(decision.stock)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-stage-muted">Price</dt>
          <dd>{priceLabel(model, decision)}</dd>
        </div>
      </dl>
      <p className="mt-2 flex flex-wrap gap-2 text-xs text-stage-muted">
        <ViewMark ok={Boolean(color.views.front)} label="Front" />
        <ViewMark ok={Boolean(color.views.side)} label="Side" />
        <ViewMark ok={Boolean(color.views.back)} label="Back" />
        {partial ? <span>Front only</span> : null}
      </p>
      <Button
        type="button"
        size="sm"
        variant={decision.offered && !decision.hidden ? "outline" : "primary"}
        className={`mt-3 ${decision.offered && !decision.hidden ? "text-stage-ink" : ""}`}
        onClick={() => onPatch(decision.offered && !decision.hidden ? { offered: false } : { offered: true, hidden: false })}
      >
        {decision.offered && !decision.hidden ? "Offered" : "Offer in store"}
      </Button>
      <details className="mt-3 text-sm text-stage-muted">
        <summary className="cursor-pointer font-semibold text-stage-ink">Details</summary>
        <div className="mt-3 grid gap-3">
          <label>
            Store display name
            <input
              defaultValue={decision.displayName}
              key={decision.displayName}
              placeholder={color.officialName}
              onBlur={(event) => {
                if (event.target.value !== decision.displayName) onPatch({ displayName: event.target.value });
              }}
              className="mt-1 w-full rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line"
            />
          </label>
          <p>Customers see {displayName(color, decision)} unless you type a shorter name.</p>
          <label>
            Stock
            <select
              value={decision.stock}
              onChange={(event) => onPatch({ stock: event.target.value as StockStatus })}
              className="mt-1 block min-h-11 w-full rounded-xl bg-stage-photo px-3 text-sm text-stage-ink ring-1 ring-stage-line"
            >
              {STOCKS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Upcharge $
            <input
              defaultValue={String(decision.priceAdjust)}
              key={decision.priceAdjust}
              inputMode="decimal"
              onBlur={(event) => {
                const amount = Number(event.target.value);
                if (Number.isFinite(amount) && amount !== decision.priceAdjust) onPatch({ priceAdjust: amount });
              }}
              className="mt-1 w-full rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-stage-ink">
            <input type="checkbox" checked={decision.featured} onChange={(event) => onPatch({ featured: event.target.checked })} />
            Featured
          </label>
          <label>
            Sort
            <input
              defaultValue={decision.sortOrder ?? ""}
              key={decision.sortOrder ?? "none"}
              inputMode="numeric"
              onBlur={(event) => {
                const raw = event.target.value.trim();
                const next = raw === "" ? null : Number(raw);
                if (next !== null && !Number.isFinite(next)) return;
                if (next !== decision.sortOrder) onPatch({ sortOrder: next });
              }}
              className="mt-1 w-24 rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line"
            />
          </label>
          <p>{color.assetStatus === "complete" ? "Complete photo set." : color.assetStatus === "partial" ? "Partial photo set." : "No photos."} Base ${model.defaultPrice}. Unit ${unitPrice(model, decision)}.</p>
        </div>
      </details>
    </article>
  );
}

function ViewMark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ok ? <Check className="size-3.5 text-primary" /> : <ImageOff className="size-3.5" />}
      {label}
    </span>
  );
}

function ActionBar({
  count,
  hiddenCount,
  stockDraft,
  priceDraft,
  onStockDraft,
  onPriceDraft,
  onOffer,
  onHide,
  onStock,
  onPrice,
  onFeature,
  onClear,
}: {
  count: number;
  hiddenCount: number;
  stockDraft: StockStatus;
  priceDraft: string;
  onStockDraft: (status: StockStatus) => void;
  onPriceDraft: (value: string) => void;
  onOffer: () => void;
  onHide: () => void;
  onStock: () => void;
  onPrice: () => void;
  onFeature: () => void;
  onClear: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stage-line bg-stage/95 px-4 py-3 backdrop-blur-md">
      <div className="mx-auto flex w-[min(1180px,100%)] flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-stage-ink">
          {count} selected
          {hiddenCount > 0 ? ` · ${hiddenCount} not in the current filter` : ""}
        </p>
        <Button type="button" size="sm" onClick={onOffer}>
          Offer selected
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-stage-ink" onClick={onHide}>
          Hide selected
        </Button>
        <select
          value={stockDraft}
          onChange={(event) => onStockDraft(event.target.value as StockStatus)}
          aria-label="Stock for selected hats"
          className="min-h-11 rounded-full bg-stage-photo px-3 text-sm text-stage-ink ring-1 ring-stage-line"
        >
          {STOCKS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" variant="outline" className="text-stage-ink" onClick={onStock}>
          Set stock
        </Button>
        <input
          value={priceDraft}
          onChange={(event) => onPriceDraft(event.target.value)}
          inputMode="decimal"
          aria-label="Upcharge for selected hats"
          className="min-h-11 w-20 rounded-full bg-stage-photo px-3 text-sm text-stage-ink ring-1 ring-stage-line"
        />
        <Button type="button" size="sm" variant="outline" className="text-stage-ink" onClick={onPrice}>
          Set price
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-stage-ink" onClick={onFeature}>
          Set featured
        </Button>
        <Button type="button" size="sm" variant="outline" className="text-stage-ink" onClick={onClear}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}

function Viewer({
  model,
  color,
  list,
  view,
  onView,
  onColor,
  onClose,
}: {
  model: CatalogModel;
  color: CatalogColorway;
  list: CatalogColorway[];
  view: ViewName;
  onView: (view: ViewName) => void;
  onColor: (colorId: string) => void;
  onClose: () => void;
}) {
  const index = Math.max(0, list.findIndex((item) => item.id === color.id));
  const src = drivePhoto(color.views[view], 1200);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < list.length - 1) onColor(list[index + 1].id);
      if (event.key === "ArrowLeft" && index > 0) onColor(list[index - 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, list, onClose, onColor]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-3" role="dialog" aria-modal="true" aria-label={`${color.officialName} photos`}>
      <div className="max-h-[94dvh] w-[min(980px,100%)] overflow-auto rounded-3xl bg-stage p-4 text-stage-ink">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Richardson {model.code} — {model.officialName}
            </p>
            <h3 className="font-display text-4xl">{color.officialName}</h3>
            <p className="text-sm text-stage-muted">
              {index + 1} of {list.length}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="text-stage-ink" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_9rem]">
          <div className="rounded-2xl bg-stage-photo shadow-stage">
            {src ? (
              <img src={src} alt={`${color.officialName} ${view}`} className="max-h-[62dvh] w-full object-contain" />
            ) : (
              <p className="grid h-64 place-items-center text-sm text-stage-muted">No {view} photo supplied.</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
            {(["front", "side", "back"] as const).map((item) => {
              const thumb = drivePhoto(color.views[item], 320);
              return (
                <button
                  key={item}
                  type="button"
                  disabled={!color.views[item]}
                  onClick={() => onView(item)}
                  className={`overflow-hidden rounded-xl bg-stage-photo ring-2 ${view === item ? "ring-primary" : "ring-stage-line"}`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" className="h-24 w-full object-contain" />
                  ) : (
                    <span className="grid h-24 place-items-center text-xs text-stage-muted">No {item}</span>
                  )}
                  <span className="block pb-1 text-xs font-semibold capitalize">{item}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" className="text-stage-ink" disabled={index <= 0} onClick={() => onColor(list[index - 1].id)}>
            <ChevronLeft className="size-4" /> Previous color
          </Button>
          <Button type="button" variant="outline" className="text-stage-ink" disabled={index >= list.length - 1} onClick={() => onColor(list[index + 1].id)}>
            Next color <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
