import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MASTER, drivePhoto, useStudio, workDecision } from "@/lib/studio-store";

const MATERIALS = [
  { id: "", label: "Not set" },
  { id: "tan", label: "Tan" },
  { id: "cognac", label: "Cognac" },
  { id: "dark-brown", label: "Dark brown" },
  { id: "black", label: "Black" },
  { id: "cream", label: "Cream" },
  { id: "rose-gold", label: "Rose gold" },
];

const SHAPES = ["", "Rectangle", "Rounded Rectangle", "Circle", "Oval", "Hexagon", "Shield", "Custom Die-Cut"];

export function WorkLibrary() {
  const work = useStudio((s) => s.work);
  const patchWork = useStudio((s) => s.patchWork);
  const [active, setActive] = useState(MASTER.work[0]?.id ?? "");
  const photo = MASTER.work.find((item) => item.id === active) ?? MASTER.work[0];
  const decision = photo ? workDecision({ work }, photo.id) : null;
  const colors = MASTER.models.find((model) => model.id === decision?.modelId)?.colorways ?? [];

  if (!photo || !decision) return null;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="font-display text-[clamp(2rem,6vw,3rem)] leading-tight text-stage-ink">Work library</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-stage-muted">
          {MASTER.work.length} real finished hats. No titles were invented. Featured, recent, public, and hidden can be marked before any other field is filled in. The public gallery is unchanged.
        </p>
      </div>
      <div className="product-card-stage grid aspect-[4/3] max-h-[720px] min-h-[300px] place-items-center rounded-3xl p-5 shadow-stage ring-1 ring-stage-line sm:aspect-[16/10] sm:p-7">
        <img
          src={drivePhoto(photo.driveId, 1400) ?? ""}
          alt={decision.title || "Untitled finished work"}
          className="h-auto max-h-[92%] w-auto max-w-[94%] object-contain"
          decoding="async"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Toggle on={decision.featured} label="Featured" onClick={() => patchWork(photo.id, { featured: !decision.featured })} />
        <Toggle on={decision.recent} label="Recent" onClick={() => patchWork(photo.id, { recent: !decision.recent })} />
        <Toggle on={decision.public} label="Public" onClick={() => patchWork(photo.id, { public: !decision.public })} />
        <Toggle on={decision.hidden} label="Hidden" onClick={() => patchWork(photo.id, { hidden: !decision.hidden })} />
      </div>
      <p className="text-sm leading-6 text-stage-muted">
        {decision.title ? decision.title : "Needs metadata"}. Public and hidden stay in Studio. They do not change the live gallery.
      </p>
      <details className="rounded-2xl bg-white p-4 ring-1 ring-stage-line sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold text-stage-ink">Assign metadata later</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              defaultValue={decision.title}
              key={`${photo.id}-${decision.title}`}
              placeholder="Leave blank until you name it"
              onBlur={(event) => {
                if (event.target.value !== decision.title) patchWork(photo.id, { title: event.target.value });
              }}
              className={fieldClass}
            />
          </Field>
          <Field label="Hat model">
            <select
              value={decision.modelId}
              onChange={(event) => patchWork(photo.id, { modelId: event.target.value, colorId: "" })}
              className={fieldClass}
            >
              <option value="">Not set</option>
              {MASTER.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.code} — {model.officialName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hat color">
            <select value={decision.colorId} onChange={(event) => patchWork(photo.id, { colorId: event.target.value })} className={fieldClass}>
              <option value="">Not set</option>
              {colors.map((color) => (
                <option key={color.id} value={color.id}>
                  {color.officialName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Patch material">
            <select value={decision.material} onChange={(event) => patchWork(photo.id, { material: event.target.value })} className={fieldClass}>
              {MATERIALS.map((item) => (
                <option key={item.id || "blank"} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shape">
            <select value={decision.shape} onChange={(event) => patchWork(photo.id, { shape: event.target.value })} className={fieldClass}>
              {SHAPES.map((shape) => (
                <option key={shape || "blank"} value={shape}>
                  {shape || "Not set"}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-3 break-all text-xs leading-5 text-stage-muted">File name, not a caption: {photo.fileName}</p>
      </details>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MASTER.work.map((item, index) => {
          const meta = workDecision({ work }, item.id);
          const src = drivePhoto(item.driveId, 480);
          const on = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item.id)}
              className={`overflow-hidden rounded-2xl bg-white text-left shadow-[0_10px_28px_rgba(45,38,30,0.05)] ring-2 ${on ? "ring-primary" : "ring-transparent"}`}
            >
              <span className="product-card-stage grid aspect-[4/3] place-items-center p-2">
                {src && <img src={src} alt="" loading="lazy" decoding="async" className="h-auto max-h-[90%] w-auto max-w-[94%] object-contain" />}
              </span>
              <span className="block px-3 py-2 text-sm leading-5 text-stage-ink">{meta.title || `Needs metadata · ${index + 1}`}</span>
              <span className="block px-3 pb-3 text-xs leading-5 text-stage-muted">
                {[meta.featured && "Featured", meta.recent && "Recent", meta.public && "Public", meta.hidden && "Hidden"].filter(Boolean).join(" · ") || "Unmarked"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const fieldClass = "mt-1 min-h-11 w-full rounded-xl bg-stage-photo px-3 py-2 text-sm text-stage-ink ring-1 ring-stage-line";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="min-w-0 text-xs font-semibold tracking-wide text-stage-muted uppercase">
      {label}
      {children}
    </label>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant={on ? "primary" : "outline"} className={on ? undefined : "text-stage-ink"} onClick={onClick}>
      {label}
    </Button>
  );
}
