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
    <section className="mx-auto w-[min(1220px,94vw)] py-14 pb-24">
      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <span className="kicker">{printedMode ? "Printed collections" : FAMILIES[family].short}</span>
          <h1 className="mt-5 font-display text-[clamp(3.4rem,6vw,6rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-stage-ink">{meta.label}</h1>
          <p className="mt-5 max-w-[58ch] text-base leading-7 text-bark">{meta.blurb}</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {printedMode || MASTER.models.find((item) => item.id === family)?.bucket === "ready" ? (
              <Link to="/order" search={{ type: "hat", family: printedMode ? undefined : family }} className={buttonVariants()}>
                Build this family <ArrowRight className="size-4" />
              </Link>
            ) : (
              <p className="text-sm text-bark">Assets incomplete. This model stays in the catalog and is not in the builder.</p>
            )}
            <Link to="/actual-work" className={buttonVariants({ variant: "outline" })}>
              See finished work
            </Link>
          </div>
          <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 text-sm">
            <div className="hairline-card rounded-2xl p-4">
              <p className="tech-label">SOURCE</p>
              <p className="mt-2 font-semibold text-ink">Verified product photography</p>
            </div>
            <div className="hairline-card rounded-2xl p-4">
              <p className="tech-label">DISPLAY</p>
              <p className="mt-2 font-semibold text-ink">Light neutral color stage</p>
            </div>
          </div>
        </div>

        {hero ? (
          <div className="product-card-stage relative grid min-h-[420px] place-items-center overflow-hidden rounded-[34px] border border-stage-line shadow-stage">
            <img
              src={hero}
              alt=""
              className="relative z-10 h-[82%] w-[86%] object-contain"
            />
          </div>
        ) : (
          <div className="product-card-stage grid min-h-[420px] place-items-center rounded-[34px] border border-stage-line text-sm text-stage-muted shadow-stage">
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
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="tech-label">RICHARDSON {model.code}</p>
                      <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-stage-ink">
                        {model.officialName}
                      </h2>
                    </div>
                    <p className="text-sm text-stage-muted">
                      {model.bucket === "ready"
                        ? `${names.length} supplied color photos`
                        : "Assets incomplete. Not a color library to sell."}
                    </p>
                  </div>
                  {names.length > 0 && (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
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
            <p className="mt-6 text-sm text-bark">No supplied color photos for this model. It is not offered in the builder.</p>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
