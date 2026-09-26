import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { FAMILIES, FAMILY_ORDER, type FamilyId } from "@/lib/catalog";
import { familyHero } from "@/lib/stage-photos";
import { MASTER } from "@/lib/studio-store";

export const Route = createFileRoute("/hats")({ component: HatsPage });

function familyTo(id: FamilyId): "/112" | "/168" | "/256" | "/printed-camo" | "/order" {
  if (id === "112") return "/112";
  if (id === "168") return "/168";
  if (id === "256") return "/256";
  if (id === "112FP" || id === "112FPR") return "/order";
  return "/printed-camo";
}

function HatsPage() {
  return (
    <section className="mx-auto w-[min(1220px,94vw)] py-14 pb-24">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="tech-label">VERIFIED HAT CATALOG / 01</p>
          <h1 className="mt-4 max-w-4xl font-display text-[clamp(3.2rem,6vw,6rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-ink">
            Colorways stay with the right model.
          </h1>
        </div>
        <p className="max-w-md text-sm leading-6 text-bark md:text-right">
          You cannot put a 256 color on a 112. Names below are the official model names. A photo in the library is not the same as a color the shop offers, and a Richardson listing is not automatically a REC Mama Made color.
        </p>
      </div>

      <div className="metal-line mt-10" />

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {FAMILY_ORDER.map((id) => {
          const model = MASTER.models.find((item) => item.id === id);
          const photos = model?.colorways.filter((color) => color.views.front).length ?? 0;
          const incomplete = model?.bucket === "incomplete";
          const photo = familyHero(id);
          const search = id === "112FP" || id === "112FPR" ? { type: "hat" as const, family: id } : undefined;
          return (
            <Link
              key={id}
              to={familyTo(id)}
              search={search}
              className="premium-card group overflow-hidden rounded-[30px] bg-white"
            >
              <div className="grid min-h-[360px] sm:grid-cols-[1.08fr_0.92fr]">
                <div className="product-card-stage relative grid min-h-64 place-items-center overflow-hidden sm:min-h-full">
                  <div className="absolute left-5 top-5 z-20 rounded-full border border-border bg-white/85 px-3 py-1.5 text-[0.62rem] font-extrabold tracking-[0.14em] text-bark uppercase backdrop-blur-md">
                    Richardson {id}
                  </div>
                  {photo ? (
                    <img
                      src={photo}
                      alt=""
                      className="relative z-10 h-[78%] w-[86%] object-contain transition-transform duration-300 ease-out group-hover:scale-[1.035]"
                    />
                  ) : (
                    <div className="grid min-h-56 place-items-center px-6 text-center text-xs text-bark">No photo</div>
                  )}
                </div>
                <div className="flex flex-col justify-between p-6 sm:p-7">
                  <div>
                    <p className="tech-label">{incomplete ? "ASSET STATUS / INCOMPLETE" : "REAL PRODUCT DATA"}</p>
                    <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.04em] text-ink">{FAMILIES[id].label}</h2>
                    <p className="mt-3 text-sm leading-6 text-bark">{FAMILIES[id].blurb}</p>
                  </div>
                  <div className="mt-8 flex items-end justify-between gap-4 border-t border-border pt-4">
                    <p className="text-sm text-ink">
                      {incomplete
                        ? "Assets incomplete. Kept in the catalog, not a color library to sell."
                        : `${photos} supplied color photos.`}
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
  );
}
