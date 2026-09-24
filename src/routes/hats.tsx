import { createFileRoute, Link } from "@tanstack/react-router";
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
    <section className="mx-auto w-[min(1180px,94vw)] py-10">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Hat families</p>
      <h1 className="mt-2 font-display text-5xl font-semibold text-ink">Colorways stay with the right model.</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-bark">
        You cannot put a 256 color on a 112. Names below are the official model names. A photo in the library is not the same as a color the shop offers, and a Richardson listing is not automatically a REC Mama Made color.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {FAMILY_ORDER.map((id) => {
          const model = MASTER.models.find((item) => item.id === id);
          const photos = model?.colorways.filter((color) => color.views.front).length ?? 0;
          const incomplete = model?.bucket === "incomplete" || id === "112FP";
          const photo = familyHero(id);
          const search = id === "112FP" || id === "112FPR" ? { type: "hat" as const, family: id } : undefined;
          return (
            <Link key={id} to={familyTo(id)} search={search} className="grid grid-cols-[140px_1fr] overflow-hidden rounded-3xl bg-stage-photo shadow-stage ring-1 ring-ink/10 sm:grid-cols-[180px_1fr]">
              {photo ? (
                <img src={photo} alt="" className="h-full min-h-36 w-full bg-white object-contain" />
              ) : (
                <div className="grid min-h-36 place-items-center bg-white text-xs text-bark">No photo</div>
              )}
              <div className="p-4">
                <p className="text-xs font-semibold tracking-wide text-bark uppercase">Richardson {id}</p>
                <h2 className="font-display text-3xl text-ink">{FAMILIES[id].label}</h2>
                <p className="mt-1 text-sm leading-6 text-bark">{FAMILIES[id].blurb}</p>
                <p className="mt-2 text-sm text-ink">
                  {incomplete
                    ? "Assets incomplete. Kept in the catalog, not a color library to sell."
                    : `${photos} supplied color photos.`}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
