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
          "Printed and camo styles we actually have photos for. A pattern Richardson sells is not automatically a color this shop offers.",
        short: "Printed collections",
      }
    : FAMILIES[family];

  const hero = printedMode ? familyHero("112P") : familyHero(family);

  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="safe-grid grid items-center gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14">
        <div className="min-w-0">
          <span className="kicker">{printedMode ? "Printed collections" : FAMILIES[family].short}</span>
          <h1 className="mt-5 max-w-[12ch] font-display text-[clamp(2.8rem,8vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-stage-ink sm:max-w-none">{meta.label}</h1>
          <p className="mt-5 max-w-[58ch] text-base leading-7 text-bark">{meta.blurb}</p>
          <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            {printedMode || MASTER.models.find((item) => item.id === family)?.bucket === "ready" ? (
              <Link to="/order" search={{ type: "hat", family: printedMode ? undefined : family }} className={buttonVariants()}>
                Build this family <ArrowRight className="size-4" />
              </Link>
            ) : (
              <p className="max-w-lg text-sm leading-6 text-bark">Assets incomplete. This model stays in the catalog and is not in the builder.</p>
            )}
            <Link to="/actual-work" className={buttonVariants({ variant: "outline" })}>
              See finished work
            </Link>
          </div>
          <div className="mt-8 grid max-w-xl gap-3 text-sm min-[430px]:grid-cols-2">
            <div className="hairline-card rounded-2xl p-4">
              <p className="tech-label">SOURCE</p>
              <p className="mt-2 font-semibold leading-6 text-ink">Verified product photography</p>
            </div>
            <div className="hairline-card rounded-2xl p-4">
              <p className="tech-label">DISPLAY</p>
              <p className="mt-2 font-semibold leading-6 text-ink">Light neutral color stage</p>
            </div>
          </div>
        </div>

        {hero ? (
          <div className="product-card-stage relative grid aspect-[4/3] w-full place-items-center rounded-[34px] border border-stage-line p-5 shadow-stage sm:p-6">
            <img
              src={hero}
              alt=""
              className="relative z-10 h-auto max-h-[82%] w-auto max-w-[86%] object-contain"
              decoding="async"
            />
          </div>
        ) : (
          <div className="product-card-stage grid aspect-[4/3] w-full place-items-center rounded-[34px] border border-stage-line p-5 text-center text-sm leading-6 text-stage-muted shadow-stage sm:p-6">
            Product photo assets incomplete
          </div>
        )}
      </div>

      <div className="metal-line mt-12" />

      {printedMode ? (
        <div className="mt-12 space-y-14">
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
                        {model.officialName}
                      </h2>
                    </div>
                    <p className="text-sm leading-6 text-stage-muted">
                      {model.bucket === "ready"
                        ? `${names.length} supplied color photos`
                        : "Assets incomplete. Not a color library to sell."}
                    </p>
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
            <p className="mt-6 max-w-xl text-sm leading-6 text-bark">No supplied color photos for this model. It is not offered in the builder.</p>
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
