import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { ColorCard } from "@/components/hat/color-card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import {
  FAMILIES,
  colorwaysForFamily,
  type FamilyId,
} from "@/lib/catalog";
import { HAT_MODEL_BLURBS, HAT_MODEL_LABELS, hatModelPath } from "@/lib/hat-models";
import { familyHero } from "@/lib/stage-photos";
import { MASTER } from "@/lib/studio-store";

export function CatalogPage({ family }: { family: FamilyId | "printed" }) {
  const [q, setQ] = useState("");
  const printedMode = family === "printed";

  const list = useMemo(() => {
    if (printedMode) return [];
    const items = colorwaysForFamily(family);
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query),
    );
  }, [family, printedMode, q]);

  const meta = printedMode
    ? {
        label: "Printed / Camo",
        blurb:
          "Browse the printed Richardson models separately. Every model keeps its own photos and color library, so a 112P color never gets attached to a 112PFP, 168P, or 256P.",
        short: "Printed collections",
      }
    : {
        label: HAT_MODEL_LABELS[family],
        blurb: HAT_MODEL_BLURBS[family],
        short: FAMILIES[family].short,
      };

  const hero = printedMode ? familyHero("112P") : familyHero(family);
  const ready = printedMode ? false : MASTER.models.find((item) => item.id === family)?.bucket === "ready";

  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="safe-grid grid items-center gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14">
        <div className="min-w-0">
          <span className="kicker">{meta.short}</span>
          <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.8rem,8vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-stage-ink sm:max-w-none">{meta.label}</h1>
          <p className="mt-5 max-w-[58ch] text-base leading-7 text-bark">{meta.blurb}</p>
          <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            {printedMode ? (
              <a href="#printed-models" className={buttonVariants()}>
                Choose a printed model <ArrowRight className="size-4" />
              </a>
            ) : ready ? (
              <Link to="/order" search={{ type: "hat", family }} className={buttonVariants()}>
                Build this model <ArrowRight className="size-4" />
              </Link>
            ) : (
              <p className="max-w-lg text-sm leading-6 text-bark">Assets incomplete. This model stays visible in the catalog but is not available in the builder.</p>
            )}
            <Link to="/hats" className={buttonVariants({ variant: "outline" })}>
              Back to hats
            </Link>
          </div>
          <div className="mt-8 grid max-w-xl gap-3 text-sm min-[430px]:grid-cols-2">
            <div className="hairline-card rounded-2xl p-4">
              <p className="tech-label">MODEL</p>
              <p className="mt-2 font-semibold leading-6 text-ink">{printedMode ? "Exact model selection required" : FAMILIES[family].short}</p>
            </div>
            <div className="hairline-card rounded-2xl p-4">
              <p className="tech-label">PHOTOS</p>
              <p className="mt-2 font-semibold leading-6 text-ink">Never borrowed from another model</p>
            </div>
          </div>
        </div>

        {hero ? (
          <div className="product-card-stage relative grid aspect-[4/3] w-full place-items-center rounded-[34px] border border-stage-line p-5 shadow-stage sm:p-6">
            <img
              src={hero}
              alt={printedMode ? "Printed Richardson hat" : `${FAMILIES[family].short} ${HAT_MODEL_LABELS[family]}`}
              className="relative z-10 h-auto max-h-[82%] w-auto max-w-[86%] object-contain"
              decoding="async"
            />
          </div>
        ) : (
          <div className="product-card-stage grid aspect-[4/3] w-full place-items-center rounded-[34px] border border-stage-line p-5 text-center text-sm leading-6 text-stage-muted shadow-stage sm:p-6">
            Verified product photo unavailable
          </div>
        )}
      </div>

      <div className="metal-line mt-12" />

      {printedMode ? (
        <div id="printed-models" className="mt-12 space-y-14">
          {MASTER.models
            .filter((model) => model.id in FAMILIES && FAMILIES[model.id as FamilyId].kind === "printed")
            .map((model) => {
              const fid = model.id as FamilyId;
              const names = model.bucket === "ready" ? colorwaysForFamily(fid) : [];
              return (
                <div key={model.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="tech-label">RICHARDSON {model.code}</p>
                      <h2 className="mt-2 font-display text-[clamp(2rem,5vw,2.8rem)] font-semibold leading-tight tracking-[-0.04em] text-stage-ink">
                        {HAT_MODEL_LABELS[fid]}
                      </h2>
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <p className="text-sm leading-6 text-stage-muted">
                        {model.bucket === "ready"
                          ? `${names.length} supplied color photo${names.length === 1 ? "" : "s"}`
                          : "Verified model assets incomplete"}
                      </p>
                      <Link to={hatModelPath(fid)} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary hover:text-primary-2">
                        View {model.code} <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                  {names.length > 0 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {names.map((color) => (
                        <ColorCard key={color.name} family={fid} name={color.name} category={color.category} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ) : (
        <>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-lg">
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${meta.label} colorways`}
                aria-label="Search colorways"
              />
            </div>
            <p className="text-sm text-stage-muted">{list.length} colorways shown</p>
          </div>
          {list.length === 0 ? (
            <p className="mt-6 max-w-xl text-sm leading-6 text-bark">No verified customer color library is available for this model yet.</p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((c) => (
                <ColorCard key={c.name} family={family} name={c.name} category={c.category} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
