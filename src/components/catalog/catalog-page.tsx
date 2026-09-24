import { Link } from "@tanstack/react-router";
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

  return (
    <section className="mx-auto w-[min(1180px,92vw)] py-10">
      <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <span className="kicker">{printedMode ? "Printed collections" : FAMILIES[family].short}</span>
          <h1 className="mt-3 font-display text-4xl text-stage-ink md:text-5xl">{meta.label}</h1>
          <p className="mt-3 max-w-[60ch] text-base leading-7 text-stage-ink">{meta.blurb}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {printedMode || MASTER.models.find((item) => item.id === family)?.bucket === "ready" ? (
              <Link to="/order" search={{ type: "hat", family: printedMode ? undefined : family }} className={buttonVariants()}>
                Build this family
              </Link>
            ) : (
              <p className="text-sm text-bark">Assets incomplete. This model stays in the catalog and is not in the builder.</p>
            )}
            <Link to="/actual-work" className={buttonVariants({ variant: "secondary" })}>
              See finished work
            </Link>
          </div>
        </div>
        <img
          src={(printedMode ? familyHero("112P") : familyHero(family)) ?? "/products/hat-112-black.jpg"}
          alt=""
          className="w-full rounded-[28px] bg-stage-photo object-contain shadow-stage ring-1 ring-stage-line"
        />
      </div>

      {printedMode ? (
        <div className="mt-10 space-y-10">
          {MASTER.models
            .filter((model) => model.id in FAMILIES && FAMILIES[model.id as FamilyId].kind === "printed")
            .map((model) => {
              const fid = model.id as FamilyId;
              const names = model.bucket === "ready" ? colorwaysForFamily(fid) : [];
              return (
                <div key={model.id}>
                  <h2 className="font-display text-2xl text-stage-ink">
                    {model.code} {model.officialName}
                  </h2>
                  <p className="mt-1 text-sm text-stage-muted">
                    {model.bucket === "ready"
                      ? `${names.length} supplied color photos`
                      : "Assets incomplete. Not a color library to sell."}
                  </p>
                  {names.length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="mt-10">
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${meta.label} colorways`}
              aria-label="Search colorways"
            />
            <p className="mt-3 text-sm text-stage-muted">{list.length} colorways shown</p>
          </div>
          {list.length === 0 ? (
            <p className="mt-6 text-sm text-bark">No supplied color photos for this model. It is not offered in the builder.</p>
          ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
