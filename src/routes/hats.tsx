import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { FamilyId } from "@/lib/catalog";
import { HAT_COLLECTIONS, HAT_MODEL_BLURBS, HAT_MODEL_LABELS, hatCatalogHero, hatModelPath } from "@/lib/hat-models";
import { familyHero } from "@/lib/stage-photos";
import { MASTER } from "@/lib/studio-store";

export const Route = createFileRoute("/hats")({ component: HatsPage });

function modelState(id: FamilyId) {
  const model = MASTER.models.find((item) => item.id === id);
  const photos = model?.colorways.filter((color) => color.views.front).length ?? 0;
  return { model, photos, incomplete: !model || model.bucket !== "ready" };
}

function HatsPage() {
  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="safe-grid grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.46fr)] lg:items-end">
        <div>
          <p className="tech-label">HAT CATALOG / 01</p>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(2.75rem,8vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-ink">
            Choose the family. Then the exact model.
          </h1>
        </div>
        <p className="max-w-[56ch] text-sm leading-7 text-bark lg:justify-self-end">
          Each Richardson model keeps its own photos and colorways. Printed, rope, five-panel, seven-panel, and Gramps variants are never mixed into another model.
        </p>
      </div>

      <div className="metal-line mt-10" />

      <div className="mt-12 space-y-16">
        {HAT_COLLECTIONS.map((collection) => (
          <section key={collection.id} aria-labelledby={`hat-family-${collection.id}`}>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="tech-label">HAT FAMILY</p>
                <h2 id={`hat-family-${collection.id}`} className="mt-2 font-display text-[clamp(2rem,5vw,3.2rem)] font-semibold leading-tight tracking-[-0.04em] text-ink">
                  {collection.label}
                </h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-bark">{collection.description}</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              {collection.modelIds.map((id) => {
                const { photos, incomplete } = modelState(id);
                const photo = familyHero(id) ?? hatCatalogHero(id);
                return (
                  <Link key={id} to={hatModelPath(id)} className="premium-card group overflow-hidden rounded-[30px] bg-white">
                    <div className="safe-grid grid sm:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
                      <div className="product-card-stage relative grid aspect-[4/3] w-full place-items-center p-5 sm:aspect-auto sm:min-h-[340px] sm:p-6">
                        <div className="absolute left-5 top-5 z-20 rounded-full border border-border bg-white/88 px-3 py-1.5 text-[0.62rem] font-extrabold tracking-[0.13em] text-bark uppercase backdrop-blur-md">
                          Richardson {id}
                        </div>
                        {photo ? (
                          <img
                            src={photo}
                            alt={`${id} ${HAT_MODEL_LABELS[id]}`}
                            className="relative z-10 h-auto max-h-[78%] w-auto max-w-[86%] object-contain transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="grid min-h-56 place-items-center px-6 text-center text-xs leading-5 text-bark">Verified product photo unavailable</div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col justify-between p-5 sm:p-7">
                        <div>
                          <p className="tech-label">{incomplete ? "ASSETS INCOMPLETE" : "MODEL READY"}</p>
                          <h3 className="mt-3 font-display text-[clamp(1.8rem,5vw,2.5rem)] font-semibold leading-tight tracking-[-0.04em] text-ink">{HAT_MODEL_LABELS[id]}</h3>
                          <p className="mt-3 text-sm leading-6 text-bark">{HAT_MODEL_BLURBS[id]}</p>
                        </div>
                        <div className="mt-7 flex items-end justify-between gap-4 border-t border-border pt-4">
                          <p className="min-w-0 text-sm leading-6 text-ink">
                            {incomplete ? "Not available in the builder until its verified product assets are complete." : `${photos} supplied color photo${photos === 1 ? "" : "s"}.`}
                          </p>
                          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary transition-transform duration-200 group-hover:translate-x-0.5">
                            <ArrowRight className="size-4" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
