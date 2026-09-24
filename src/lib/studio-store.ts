import { create } from "zustand";
import { persist } from "zustand/middleware";
import catalogJson from "@/data/master-catalog.json";

export type RichardsonStatus = "current" | "legacy" | "unknown";
export type AssetStatus = "complete" | "partial" | "missing";
export type ModelBucket = "ready" | "incomplete";
export type ModelOfferStatus =
  | "not-offered"
  | "active"
  | "hidden"
  | "assets-incomplete"
  | "discontinued";
export type StockStatus = "unknown" | "in-stock" | "out-of-stock" | "low-stock";
export type ColorFilter =
  | "all"
  | "offered"
  | "not-offered"
  | "in-stock"
  | "out-of-stock"
  | "low-stock"
  | "featured"
  | "legacy"
  | "current"
  | "needs-review";

export type CatalogViews = { front?: string; side?: string; back?: string };

export type CatalogColorway = {
  id: string;
  officialName: string;
  richardsonStatus: RichardsonStatus;
  assetStatus: AssetStatus;
  views: CatalogViews;
  notes: string;
};

export type CatalogModel = {
  id: string;
  code: string;
  officialName: string;
  bucket: ModelBucket;
  defaultPrice: number;
  suppliedCount: number;
  richardsonListed: number | null;
  note: string;
  heroDriveId: string | null;
  colorways: CatalogColorway[];
};

export type CatalogWork = { id: string; fileName: string; driveId: string };

export type MasterCatalog = {
  version: number;
  source: string;
  angleMap: { scope: string; front: string; side: string; back: string; note: string };
  models: CatalogModel[];
  work: CatalogWork[];
};

export const MASTER = catalogJson as MasterCatalog;

export const FAMILIES: { id: string; name: string; modelIds: string[] }[] = [
  { id: "112", name: "Richardson 112", modelIds: ["112", "112FP", "112FPR", "112P", "112PFP", "112PM"] },
  { id: "168", name: "Richardson 168", modelIds: ["168", "168P"] },
  { id: "256", name: "Umpqua Gramps", modelIds: ["256", "256P"] },
];

export type ColorDecision = {
  offered: boolean;
  hidden: boolean;
  stock: StockStatus;
  priceAdjust: number;
  displayName: string;
  featured: boolean;
  sortOrder: number | null;
};

export type WorkDecision = {
  title: string;
  modelId: string;
  colorId: string;
  material: string;
  shape: string;
  featured: boolean;
  recent: boolean;
  public: boolean;
  hidden: boolean;
};

export type HistoryEntry = { id: string; text: string; at: string };

export type Snapshot = {
  at: string;
  fingerprint: string;
  offeredIds: string[];
};

type Slice = {
  modelStatus: Record<string, ModelOfferStatus>;
  colors: Record<string, ColorDecision>;
  work: Record<string, WorkDecision>;
  activationOverride: Record<string, boolean>;
};

type UndoFrame = { slice: Slice; historyIds: string[] };

type StudioState = Slice & {
  selected: Record<string, boolean>;
  snapshot: Snapshot | null;
  history: HistoryEntry[];
  undoStack: UndoFrame[];
  setModelStatus: (id: string, status: ModelOfferStatus) => { ok: boolean; reason: string };
  setActivationOverride: (id: string, on: boolean) => void;
  patchColor: (id: string, patch: Partial<ColorDecision>) => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[], on: boolean) => void;
  replaceSelection: (ids: string[]) => void;
  applySelected: (ids: string[], patch: Partial<ColorDecision>) => void;
  patchWork: (id: string, patch: Partial<WorkDecision>) => void;
  undo: () => void;
  saveSnapshot: () => { ok: boolean; issues: string[] };
};

const EMPTY_COLOR: ColorDecision = {
  offered: false,
  hidden: false,
  stock: "unknown",
  priceAdjust: 0,
  displayName: "",
  featured: false,
  sortOrder: null,
};

const EMPTY_WORK: WorkDecision = {
  title: "",
  modelId: "",
  colorId: "",
  material: "",
  shape: "",
  featured: false,
  recent: false,
  public: false,
  hidden: false,
};

const STATUS_LABEL: Record<ModelOfferStatus, string> = {
  "not-offered": "Not offered",
  active: "Active",
  hidden: "Hidden",
  "assets-incomplete": "Assets incomplete",
  discontinued: "Discontinued",
};

function initialModelStatus(): Record<string, ModelOfferStatus> {
  const out: Record<string, ModelOfferStatus> = {};
  for (const model of MASTER.models) {
    out[model.id] = model.bucket === "incomplete" ? "assets-incomplete" : "not-offered";
  }
  return out;
}

function baselineSlice(): Slice {
  return {
    modelStatus: initialModelStatus(),
    colors: {},
    work: {},
    activationOverride: {},
  };
}

let seq = 0;
function uid() {
  seq += 1;
  return `${Date.now().toString(36)}-${seq}`;
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = stable(source[key]);
    }
    return out;
  }
  return value;
}

export function catalogFingerprint(slice: Slice) {
  return JSON.stringify(stable(slice));
}

function sliceOf(state: Slice): Slice {
  return {
    modelStatus: state.modelStatus,
    colors: state.colors,
    work: state.work,
    activationOverride: state.activationOverride,
  };
}

export function isDirty(state: Slice & { snapshot: Snapshot | null }) {
  const current = catalogFingerprint(sliceOf(state));
  if (!state.snapshot) return current !== catalogFingerprint(baselineSlice());
  return current !== state.snapshot.fingerprint;
}

export function colorDecision(state: { colors: Record<string, ColorDecision> }, id: string): ColorDecision {
  return { ...EMPTY_COLOR, ...state.colors[id] };
}

export function workDecision(state: { work: Record<string, WorkDecision> }, id: string): WorkDecision {
  return { ...EMPTY_WORK, ...state.work[id] };
}

export function findColor(id: string) {
  for (const model of MASTER.models) {
    const color = model.colorways.find((item) => item.id === id);
    if (color) return { model, color };
  }
  return null;
}

export function drivePhoto(id: string | undefined, size = 640) {
  if (!id) return null;
  return `https://lh3.googleusercontent.com/d/${id}=w${size}`;
}

export function displayName(color: CatalogColorway, decision: ColorDecision) {
  const custom = decision.displayName.trim();
  return custom || color.officialName;
}

export function unitPrice(model: CatalogModel, decision: ColorDecision) {
  return model.defaultPrice + decision.priceAdjust;
}

export function priceLabel(model: CatalogModel, decision: ColorDecision) {
  const unit = unitPrice(model, decision);
  if (!decision.priceAdjust) return `$${unit}`;
  const sign = decision.priceAdjust > 0 ? "+" : "−";
  return `$${unit} · ${sign}$${Math.abs(decision.priceAdjust)} upcharge`;
}

export function stockLabel(stock: StockStatus) {
  if (stock === "in-stock") return "In stock";
  if (stock === "out-of-stock") return "Out of stock";
  if (stock === "low-stock") return "Low stock";
  return "Stock unknown";
}

export function richardsonLabel(status: RichardsonStatus) {
  if (status === "current") return "Current";
  if (status === "legacy") return "Legacy";
  return "Needs review";
}

export function offeredLabel(decision: ColorDecision) {
  if (decision.hidden) return "Hidden";
  if (decision.offered) return "Offered";
  return "Not offered";
}

export function priceBroken(model: CatalogModel, decision: ColorDecision) {
  if (typeof decision.priceAdjust !== "number" || !Number.isFinite(decision.priceAdjust)) return true;
  return unitPrice(model, decision) < 0;
}

export function modelCounts(model: CatalogModel, colors: Record<string, ColorDecision>) {
  let offered = 0;
  let inStock = 0;
  for (const color of model.colorways) {
    const decision = colorDecision({ colors }, color.id);
    if (decision.offered && !decision.hidden) offered += 1;
    if (decision.stock === "in-stock") inStock += 1;
  }
  return { offered, inStock };
}

export function previewSummary(state: { modelStatus: Record<string, ModelOfferStatus>; colors: Record<string, ColorDecision> }) {
  let active = 0;
  let offered = 0;
  let inStock = 0;
  let outStock = 0;
  let lowStock = 0;
  for (const model of MASTER.models) {
    if (state.modelStatus[model.id] === "active") active += 1;
    for (const color of model.colorways) {
      const decision = colorDecision(state, color.id);
      if (!decision.offered || decision.hidden) continue;
      offered += 1;
      if (decision.stock === "in-stock") inStock += 1;
      if (decision.stock === "out-of-stock") outStock += 1;
      if (decision.stock === "low-stock") lowStock += 1;
    }
  }
  return { active, offered, inStock, outStock, lowStock };
}

export function customerColorways(
  model: CatalogModel,
  state: { colors: Record<string, ColorDecision>; modelStatus: Record<string, ModelOfferStatus> },
) {
  if (state.modelStatus[model.id] !== "active") return [];
  return model.colorways
    .map((color) => ({ color, decision: colorDecision(state, color.id) }))
    .filter(({ decision, color }) => decision.offered && !decision.hidden && Boolean(color.views.front))
    .sort((a, b) => {
      const left = a.decision.sortOrder;
      const right = b.decision.sortOrder;
      if (left == null && right == null) return a.color.officialName.localeCompare(b.color.officialName);
      if (left == null) return 1;
      if (right == null) return -1;
      return left - right;
    });
}

export function matchesFilter(color: CatalogColorway, decision: ColorDecision, filter: ColorFilter) {
  if (filter === "all") return true;
  if (filter === "offered") return decision.offered && !decision.hidden;
  if (filter === "not-offered") return !decision.offered || decision.hidden;
  if (filter === "in-stock") return decision.stock === "in-stock";
  if (filter === "out-of-stock") return decision.stock === "out-of-stock";
  if (filter === "low-stock") return decision.stock === "low-stock";
  if (filter === "featured") return decision.featured;
  if (filter === "legacy") return color.richardsonStatus === "legacy";
  if (filter === "current") return color.richardsonStatus === "current";
  return color.richardsonStatus === "unknown" || color.assetStatus !== "complete";
}

export function matchesQuery(
  model: CatalogModel,
  color: CatalogColorway,
  decision: ColorDecision,
  modelStatus: ModelOfferStatus,
  needle: string,
) {
  if (!needle) return true;
  const code = model.code.toLowerCase();
  const codeHit = code === needle || (needle.length > 3 && code.startsWith(needle));
  if (codeHit || model.officialName.toLowerCase().includes(needle)) return true;
  const hay = [
    color.officialName,
    decision.displayName,
    richardsonLabel(color.richardsonStatus),
    offeredLabel(decision),
    stockLabel(decision.stock),
    STATUS_LABEL[modelStatus],
    decision.featured ? "featured" : "",
    color.assetStatus === "complete" ? "" : "needs review partial",
    color.notes,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function catalogIssues(state: {
  modelStatus: Record<string, ModelOfferStatus>;
  colors: Record<string, ColorDecision>;
  activationOverride: Record<string, boolean>;
}): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const model of MASTER.models) {
    if (!model.officialName.trim()) issues.push(`${model.code} has a blank model name.`);
    const status = state.modelStatus[model.id] ?? "not-offered";
    const offered = model.colorways.filter((color) => colorDecision(state, color.id).offered && !colorDecision(state, color.id).hidden);
    if (model.bucket === "incomplete" && status === "active" && !state.activationOverride[model.id]) {
      issues.push(`${model.code} — ${model.officialName} is incomplete. Customer activation stays blocked until you override it.`);
    }
    if (status === "active" && offered.length === 0) {
      issues.push(`${model.code} — ${model.officialName} is Active but has zero offered colors.`);
    }
    if (status === "hidden" && offered.length > 0) {
      issues.push(
        `${model.code} — ${model.officialName} is Hidden, but ${offered.length} color${offered.length === 1 ? "" : "s"} ${offered.length === 1 ? "is" : "are"} still marked offered.`,
      );
    }
    for (const color of model.colorways) {
      const key = `${model.id}:${color.officialName.trim().toLowerCase()}`;
      if (!color.officialName.trim()) {
        issues.push(`${model.code} has a colorway with a blank official name.`);
      } else if (seen.has(key)) {
        issues.push(`${model.code} has a duplicate color: ${color.officialName}.`);
      } else {
        seen.add(key);
      }
      const decision = colorDecision(state, color.id);
      if (decision.offered && !decision.hidden && !color.views.front) {
        issues.push(`${model.code} ${color.officialName} is offered but has no front image.`);
      }
      if (decision.offered && !decision.hidden && priceBroken(model, decision)) {
        issues.push(`${model.code} ${color.officialName} has an invalid price. Base $${model.defaultPrice} plus upcharge $${decision.priceAdjust} is not a usable price.`);
      }
    }
  }
  return issues;
}

function describePatch(name: string, patch: Partial<ColorDecision>) {
  if (patch.hidden && patch.offered === false) return `${name} — Hidden`;
  if (patch.offered === true) return `${name} — Offered enabled`;
  if (patch.offered === false) return `${name} — Offered turned off`;
  if (patch.stock) return `${name} — Stock changed to ${stockLabel(patch.stock)}`;
  if (typeof patch.priceAdjust === "number") return `${name} — Upcharge set to $${patch.priceAdjust}`;
  if (typeof patch.featured === "boolean") return `${name} — ${patch.featured ? "Marked featured" : "Featured cleared"}`;
  if (typeof patch.displayName === "string") return `${name} — Display name updated`;
  if ("sortOrder" in patch) return `${name} — Sort updated`;
  return `${name} — Updated`;
}

function workLabel(id: string) {
  const index = MASTER.work.findIndex((item) => item.id === id);
  return index >= 0 ? `Work photo ${index + 1}` : "Work photo";
}

function describeWork(id: string, patch: Partial<WorkDecision>) {
  const name = workLabel(id);
  if (typeof patch.featured === "boolean") return `${name} — ${patch.featured ? "Featured on" : "Featured off"}`;
  if (typeof patch.recent === "boolean") return `${name} — ${patch.recent ? "Marked recent" : "Recent cleared"}`;
  if (typeof patch.public === "boolean") return `${name} — ${patch.public ? "Marked public" : "Public cleared"}`;
  if (typeof patch.hidden === "boolean") return `${name} — ${patch.hidden ? "Hidden" : "Hidden cleared"}`;
  if (typeof patch.title === "string") return `${name} — Title updated`;
  if (typeof patch.modelId === "string") return `${name} — Hat model updated`;
  if (typeof patch.colorId === "string") return `${name} — Hat color updated`;
  if (typeof patch.material === "string") return `${name} — Material updated`;
  if (typeof patch.shape === "string") return `${name} — Shape updated`;
  return `${name} — Updated`;
}

function pushChange(
  get: () => StudioState,
  set: (partial: Partial<StudioState>) => void,
  partial: Partial<StudioState>,
  texts: string[],
) {
  const entries = texts.map((text) => ({ id: uid(), text, at: new Date().toISOString() }));
  const frame: UndoFrame = { slice: sliceOf(get()), historyIds: entries.map((entry) => entry.id) };
  set({
    ...partial,
    undoStack: [frame, ...get().undoStack].slice(0, 25),
    history: [...entries, ...get().history].slice(0, 100),
  });
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      ...baselineSlice(),
      selected: {},
      snapshot: null,
      history: [],
      undoStack: [],
      setModelStatus: (id, status) => {
        const model = MASTER.models.find((item) => item.id === id);
        if (!model) return { ok: false, reason: "That model is not in the catalog." };
        if (model.bucket === "incomplete" && status === "active" && !get().activationOverride[id]) {
          return {
            ok: false,
            reason: `${model.code} is incomplete. Customer activation stays blocked until you turn on the override.`,
          };
        }
        if (get().modelStatus[id] === status) return { ok: true, reason: "" };
        pushChange(
          get,
          set,
          { modelStatus: { ...get().modelStatus, [id]: status } },
          [`${model.code} — ${model.officialName} set to ${STATUS_LABEL[status]}`],
        );
        return { ok: true, reason: "" };
      },
      setActivationOverride: (id, on) => {
        const model = MASTER.models.find((item) => item.id === id);
        if (!model) return;
        const modelStatus = { ...get().modelStatus };
        const texts = [`${model.code} — Customer activation override ${on ? "on" : "off"}`];
        if (!on && modelStatus[id] === "active") {
          modelStatus[id] = "assets-incomplete";
          texts.push(`${model.code} — Returned to Assets incomplete`);
        }
        pushChange(
          get,
          set,
          { activationOverride: { ...get().activationOverride, [id]: on }, modelStatus },
          texts,
        );
      },
      patchColor: (id, patch) => {
        const found = findColor(id);
        if (!found) return;
        const next = { ...colorDecision(get(), id), ...patch };
        pushChange(get, set, { colors: { ...get().colors, [id]: next } }, [describePatch(found.color.officialName, patch)]);
      },
      toggleSelected: (id) => set((s) => ({ selected: { ...s.selected, [id]: !s.selected[id] } })),
      setSelected: (ids, on) =>
        set((s) => {
          const selected = { ...s.selected };
          for (const id of ids) selected[id] = on;
          return { selected };
        }),
      replaceSelection: (ids) => {
        const selected: Record<string, boolean> = {};
        for (const id of ids) selected[id] = true;
        set({ selected });
      },
      applySelected: (ids, patch) => {
        const colors = { ...get().colors };
        const texts: string[] = [];
        for (const id of ids) {
          const found = findColor(id);
          if (!found) continue;
          colors[id] = { ...colorDecision(get(), id), ...patch };
          texts.push(describePatch(found.color.officialName, patch));
        }
        if (!texts.length) return;
        pushChange(get, set, { colors }, texts);
      },
      patchWork: (id, patch) => {
        const next = { ...workDecision(get(), id), ...patch };
        pushChange(get, set, { work: { ...get().work, [id]: next } }, [describeWork(id, patch)]);
      },
      undo: () => {
        const [frame, ...rest] = get().undoStack;
        if (!frame) return;
        const drop = new Set(frame.historyIds);
        set({
          ...frame.slice,
          undoStack: rest,
          history: get().history.filter((entry) => !drop.has(entry.id)),
        });
      },
      saveSnapshot: () => {
        const issues = catalogIssues(get());
        if (issues.length) return { ok: false, issues };
        const slice = sliceOf(get());
        const offeredIds = MASTER.models.flatMap((model) => customerColorways(model, get()).map(({ color }) => color.id));
        const entry = { id: uid(), text: "Catalog snapshot saved", at: new Date().toISOString() };
        set({
          snapshot: { at: entry.at, fingerprint: catalogFingerprint(slice), offeredIds },
          history: [entry, ...get().history].slice(0, 100),
        });
        return { ok: true, issues: [] };
      },
    }),
    {
      name: "recmama-studio-v1",
      skipHydration: true,
      partialize: (state) => ({
        modelStatus: state.modelStatus,
        colors: state.colors,
        selected: state.selected,
        work: state.work,
        activationOverride: state.activationOverride,
        snapshot: state.snapshot,
        history: state.history,
      }),
    },
  ),
);
