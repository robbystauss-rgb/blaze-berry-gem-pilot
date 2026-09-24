import { useEffect, useMemo, useState } from "react";
import records from "@/data/material-review.json";

type ReviewStatus = "needs-review" | "approve" | "needs-fix";
type Swatch = (typeof records)[number];

const SOURCE = "/materials/review/source.png";
const SOURCE_W = 1672;
const SOURCE_H = 941;
const STORAGE = "recmama-material-approval-v2";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "leatherette", label: "Leatherette" },
  { id: "camo", label: "Camo" },
  { id: "carbon", label: "Carbon fiber" },
  { id: "metallic", label: "Metallic" },
  { id: "topo", label: "Topo" },
  { id: "sport", label: "Sport textures" },
  { id: "acrylic", label: "Acrylic" },
  { id: "specialty", label: "Specialty" },
] as const;

export function MaterialApproval() {
  const [decision, setDecision] = useState<Record<string, ReviewStatus>>({});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setDecision(JSON.parse(raw) as Record<string, ReviewStatus>);
    } catch {
      /* keep defaults */
    }
  }, []);

  function setStatus(id: string, status: ReviewStatus) {
    setDecision((current) => {
      const next = { ...current, [id]: status };
      localStorage.setItem(STORAGE, JSON.stringify(next));
      return next;
    });
  }

  const visible = records.filter((item) => filter === "all" || item.category === filter);
  const counts = useMemo(() => {
    const approved = records.filter((item) => decision[item.id] === "approve").length;
    const fix = records.filter((item) => decision[item.id] === "needs-fix").length;
    return { approved, fix, waiting: records.length - approved - fix };
  }, [decision]);
  const opened = records.find((item) => item.id === open) ?? null;

  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.16em] text-stage-muted uppercase">Studio · Materials · Visual approval</p>
      <h2 className="mt-2 font-display text-4xl text-stage-ink">Your sheet, cropped. Not the builder.</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-stage-muted">
        Every swatch is a native crop from My leatherette options.PNG. No internet textures, no old shop swatches, and no enlargement. Names are the words printed on each card. Two cards have no printed name, so they are blank on purpose. Nothing here is on the customer picker.
      </p>
      <p className="mt-3 text-sm text-stage-ink">
        {records.length} materials · {counts.waiting} waiting · {counts.approved} approved · {counts.fix} need a fix
      </p>

      <figure className="mt-6 overflow-hidden rounded-3xl bg-white ring-1 ring-stage-line">
        <img src={SOURCE} alt="My leatherette options, the approved source sheet" className="w-full" />
        <figcaption className="px-4 py-3 text-sm text-stage-muted">
          Source file My leatherette options.PNG. Left of each card is that same file, cropped to the sample. Right is the texture only, with the name set in type underneath.
        </figcaption>
      </figure>

      <div className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === item.id ? "bg-primary text-primary-fg" : "bg-white text-stage-ink ring-1 ring-stage-line"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {visible.map((item) => (
          <MaterialCard
            key={item.id}
            item={item}
            status={decision[item.id] ?? "needs-review"}
            onStatus={setStatus}
            onOpen={setOpen}
          />
        ))}
      </div>

      {opened && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-4" role="dialog" aria-modal="true" aria-label="Material detail">
          <div className="max-h-[90dvh] w-[min(860px,100%)] overflow-auto rounded-3xl bg-white p-4 text-stage-ink shadow-stage">
            <div className="grid gap-4 sm:grid-cols-2">
              <figure>
                <CardCrop item={opened} />
                <figcaption className="mt-2 text-xs font-semibold tracking-wide text-stage-muted uppercase">Source card</figcaption>
              </figure>
              <figure>
                <img src={opened.detail} alt="" className="w-full rounded-2xl" />
                <figcaption className="mt-2 text-xs font-semibold tracking-wide text-stage-muted uppercase">Customer swatch</figcaption>
              </figure>
            </div>
            <p className="mt-4 font-display text-3xl">{opened.name || "Name not printed"}</p>
            <p className="text-sm text-stage-muted">{opened.engrave || "Engraving not printed"}</p>
            {opened.note && <p className="mt-2 text-sm leading-6 text-stage-muted">{opened.note}</p>}
            <button type="button" className="mt-4 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CardCrop({ item }: { item: Swatch }) {
  const [x0, y0, x1, y1] = item.card;
  const cw = x1 - x0;
  const ch = y1 - y0;
  return (
    <div className="relative aspect-[143/306] overflow-hidden rounded-2xl bg-[#f7f4ef]">
      <img
        src={SOURCE}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${(SOURCE_W / cw) * 100}%`,
          height: `${(SOURCE_H / ch) * 100}%`,
          left: `${(-x0 / cw) * 100}%`,
          top: `${(-y0 / ch) * 100}%`,
        }}
      />
    </div>
  );
}

function MaterialCard({
  item,
  status,
  onStatus,
  onOpen,
}: {
  item: Swatch;
  status: ReviewStatus;
  onStatus: (id: string, status: ReviewStatus) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <article className="rounded-3xl bg-white p-3 ring-1 ring-stage-line">
      <div className="grid grid-cols-2 gap-3">
        <figure>
          <CardCrop item={item} />
          <figcaption className="mt-2 text-xs font-semibold tracking-wide text-stage-muted uppercase">Source card</figcaption>
        </figure>
        <figure>
          <button type="button" onClick={() => onOpen(item.id)} className="block w-full text-left">
            <img src={item.swatch} alt="" className="aspect-[4/5] w-full rounded-2xl object-cover" />
          </button>
          <figcaption className="mt-2 text-xs font-semibold tracking-wide text-stage-muted uppercase">Customer swatch</figcaption>
          <p className="mt-2 text-sm font-semibold tracking-wide text-stage-ink uppercase">{item.name || "Name not printed"}</p>
          <p className="text-sm text-stage-muted">{item.engrave || "Engraving not printed"}</p>
        </figure>
      </div>
      {item.note && <p className="mt-3 text-sm leading-6 text-stage-muted">{item.note}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-stage-muted uppercase">{item.category}</p>
        <p className="text-xs font-semibold tracking-wide text-stage-muted uppercase">
          {status === "approve" ? "Approved" : status === "needs-fix" ? "Needs fix" : "Needs review"}
        </p>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onStatus(item.id, "approve")}
          className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${status === "approve" ? "bg-primary text-primary-fg" : "bg-stage text-stage-ink ring-1 ring-stage-line"}`}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => onStatus(item.id, "needs-fix")}
          className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${status === "needs-fix" ? "bg-primary text-primary-fg" : "bg-stage text-stage-ink ring-1 ring-stage-line"}`}
        >
          Needs fix
        </button>
      </div>
    </article>
  );
}
