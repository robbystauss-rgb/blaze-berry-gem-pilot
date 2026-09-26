import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FAMILIES,
  MASTER,
  catalogIssues,
  customerColorways,
  displayName,
  drivePhoto,
  previewSummary,
  priceLabel,
  stockLabel,
  useStudio,
  type CatalogColorway,
  type CatalogModel,
  type ColorDecision,
} from "@/lib/studio-store";

type ViewName = "front" | "side" | "back";

export function StorePreview() {
  const modelStatus = useStudio((s) => s.modelStatus);
  const colors = useStudio((s) => s.colors);
  const activationOverride = useStudio((s) => s.activationOverride);
  const snapshot = useStudio((s) => s.snapshot);
  const saveSnapshot = useStudio((s) => s.saveSnapshot);
  const [result, setResult] = useState<string[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<ViewName>("front");
  const issues = catalogIssues({ modelStatus, colors, activationOverride });
  const summary = previewSummary({ modelStatus, colors });
  const state = { modelStatus, colors };

  return (
    <div className="space-y-9">
      <div className="rounded-3xl bg-white p-5 shadow-[0_14px_38px_rgba(45,38,30,0.06)] ring-1 ring-stage-line sm:p-6">
        <p className="tech-label">Preview only — not live</p>
        <h2 className="mt-2 font-display text-[clamp(2rem,6vw,3.3rem)] leading-tight text-stage-ink">Private store preview</h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-stage-ink">
          {summary.active} {summary.active === 1 ? "model" : "models"} active · {summary.offered} colorways offered · {summary.inStock} in stock · {summary.outStock} out of stock
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-stage-muted">
          This is the customer catalog from your current Studio selections: family, model, color, front / side / back, and price. It is private. The public builder is still the old catalog.
        </p>
        {issues.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm text-stage-ink">
            {issues.map((issue) => (
              <li key={issue} className="rounded-xl bg-primary/10 px-3 py-2 leading-6">
                {issue}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              const outcome = saveSnapshot();
              setResult(outcome.ok ? [] : outcome.issues);
            }}
          >
            Save catalog snapshot
          </Button>
          <Button type="button" variant="outline" className="text-stage-ink" disabled>
            Publish to live shop
          </Button>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stage-muted">
          Those are different actions. Save catalog snapshot keeps a private copy here. Publish to live shop is not connected, and it will not replace the current builder.
        </p>
        <p className="mt-2 text-sm leading-6 text-stage-muted">
          {snapshot ? `Last snapshot ${new Date(snapshot.at).toLocaleString()}.` : "No snapshot saved yet."}
        </p>
        {result && result.length === 0 && <p className="mt-3 text-sm leading-6 text-stage-ink">Snapshot saved in Studio only. The live shop was not changed.</p>}
        {result && result.length > 0 && <p className="mt-3 text-sm leading-6 text-stage-ink">Snapshot blocked until the issues above are fixed.</p>}
      </div>

      {FAMILIES.map((family) => {
        const models = family.modelIds
          .map((id) => MASTER.models.find((model) => model.id === id))
          .filter((model): model is CatalogModel => Boolean(model));
        return (
          <section key={family.id} className="space-y-4">
            <h3 className="font-display text-[clamp(1.9rem,5vw,2.8rem)] leading-tight text-stage-ink">{family.name}</h3>
            {models.map((model) => {
              const offered = customerColorways(model, state);
              return (
                <div key={model.id} className="rounded-3xl bg-white p-4 ring-1 ring-stage-line sm:p-5">
                  <p className="tech-label">Richardson {model.code}</p>
                  <h4 className="mt-1 font-display text-[clamp(1.8rem,5vw,3rem)] leading-tight text-stage-ink">{model.officialName}</h4>
                  {offered.length === 0 ? (
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-stage-muted">Nothing in this model would appear. It has to be Active, with at least one offered color and a front photo.</p>
                  ) : (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {offered.map(({ color, decision }) => (
                        <CustomerCard
                          key={color.id}
                          model={model}
                          color={color}
                          decision={decision}
                          open={openId === color.id}
                          view={openId === color.id ? view : "front"}
                          onOpen={() => {
                            setOpenId(color.id);
                            setView("front");
                          }}
                          onView={setView}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function CustomerCard({
  model,
  color,
  decision,
  open,
  view,
  onOpen,
  onView,
}: {
  model: CatalogModel;
  color: CatalogColorway;
  decision: ColorDecision;
  open: boolean;
  view: ViewName;
  onOpen: () => void;
  onView: (view: ViewName) => void;
}) {
  const current = open ? view : "front";
  const src = drivePhoto(color.views[current], 800);
  const name = displayName(color, decision);
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-[0_10px_28px_rgba(45,38,30,0.05)] ring-1 ring-stage-line">
      <button type="button" className="product-card-stage grid aspect-[4/3] w-full place-items-center p-3" onClick={onOpen}>
        {src ? (
          <img src={src} alt={`${name} ${current}`} className="h-auto max-h-[88%] w-auto max-w-[94%] object-contain" loading="lazy" decoding="async" />
        ) : (
          <span className="text-xs text-stage-muted">Photo unavailable</span>
        )}
      </button>
      <div className="border-t border-stage-line px-4 py-4">
        <h5 className="text-lg font-semibold leading-snug text-stage-ink">{name}</h5>
        <p className="mt-1 text-sm text-stage-ink">{priceLabel(model, decision)}</p>
        <p className="mt-1 text-sm text-stage-muted">{stockLabel(decision.stock)}</p>
        {open && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(["front", "side", "back"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={current === item ? "primary" : "outline"}
                className={current === item ? undefined : "text-stage-ink"}
                disabled={!color.views[item]}
                onClick={() => onView(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
