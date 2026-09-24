import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { FAMILIES, PRICING, type FamilyId } from "@/lib/catalog";
import { familyHero, galleryWork } from "@/lib/stage-photos";
import { drivePhoto, useStudio } from "@/lib/studio-store";
import { useOrder } from "@/lib/order-store";

export const Route = createFileRoute("/")({ component: Home });

const FEATURED: { id: FamilyId; kicker: string }[] = [
  { id: "112", kicker: "Classic mesh-back" },
  { id: "112P", kicker: "Printed trucker" },
  { id: "256", kicker: "Five-panel rope" },
  { id: "112PFP", kicker: "Camo five-panel" },
];

const FLOW = ["Hat", "Material", "Shape", "Design", "Proof", "Made"];

function familyTo(id: FamilyId) {
  if (id === "112") return "/112" as const;
  if (id === "168") return "/168" as const;
  if (id === "256") return "/256" as const;
  return "/printed-camo" as const;
}

function Home() {
  const work = useStudio((state) => state.work);
  const photos = galleryWork(work);
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setFrame((value) => (value + 1) % Math.min(photos.length, 4)), 4800);
    return () => window.clearInterval(id);
  }, [photos.length]);
  const current = photos[frame] ?? photos[0];

  return (
    <>
      <section className="mx-auto grid w-[min(1240px,96vw)] items-center gap-6 py-6 lg:min-h-[calc(100dvh-8rem)] lg:grid-cols-[1fr_1.15fr] lg:py-8">
        <div className="px-2 lg:px-6">
          <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Custom product studio</p>
          <h1 className="mt-3 font-display text-[clamp(3.2rem,6vw,5.4rem)] leading-[0.95] font-medium text-ink">
            Custom hats.<br />Built your way.
          </h1>
          <p className="mt-4 max-w-md text-lg leading-7 text-bark">
            Choose the hat, material, shape and design. See your build come together before we make it.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to="/order"
              search={{ type: "hat" }}
              onClick={() => useOrder.getState().set("orderType", "hat")}
              className={buttonVariants({ size: "lg" })}
            >
              Build your hat
            </Link>
            <Link
              to="/order"
              search={{ type: "patch" }}
              onClick={() => useOrder.getState().set("orderType", "patch")}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              Patch only
            </Link>
          </div>
        </div>
        <div className="relative grid min-h-[420px] place-items-center overflow-hidden rounded-[28px] bg-[radial-gradient(120%_80%_at_50%_18%,#fff_0%,#f3eee6_55%,#e7dfd3_100%)] shadow-stage lg:min-h-[560px]">
          {current ? (
            <img
              key={current.item.id}
              src={drivePhoto(current.item.driveId, 1400) ?? ""}
              alt="Finished REC Mama Made hat"
              className="stage-in max-h-[78%] w-[86%] object-contain drop-shadow-[0_28px_40px_rgba(40,24,10,0.18)]"
            />
          ) : (
            <p className="text-bark">Work photos are loading.</p>
          )}
          <div className="absolute bottom-5 left-5 max-w-[220px] rounded-2xl bg-stage-photo/90 px-3 py-2 ring-1 ring-ink/10">
            <p className="text-sm font-semibold">Latest finished work</p>
            <p className="text-xs text-bark">Heat-adhesive patch. Proofed before it’s made.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] py-10">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">How it works</p>
        <h2 className="mt-2 font-display text-4xl text-ink">Build it your way</h2>
        <ol className="mt-5 flex gap-2 overflow-x-auto">
          {FLOW.map((step, index) => (
            <li key={step} className="min-w-28 rounded-2xl bg-stage-photo px-4 py-3 ring-1 ring-ink/10">
              <span className="text-[11px] tracking-[0.12em] text-bark">{String(index + 1).padStart(2, "0")}</span>
              <p className="font-semibold">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] pb-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Catalog</p>
            <h2 className="mt-2 font-display text-4xl text-ink">Choose your hat</h2>
          </div>
          <Link to="/hats" className="text-sm font-semibold">All families</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED.map(({ id, kicker }) => {
            const photo = familyHero(id);
            return (
              <Link key={id} to={familyTo(id)} className="overflow-hidden rounded-[18px] bg-stage-photo ring-1 ring-ink/10">
                <div className="grid h-52 place-items-center bg-[radial-gradient(100%_80%_at_50%_20%,#fff,#efe8dc)]">
                  {photo && <img src={photo} alt="" className="h-44 w-[86%] object-contain" />}
                </div>
                <div className="px-4 py-4">
                  <p className="text-[11px] tracking-[0.14em] text-bark uppercase">{kicker}</p>
                  <h3 className="text-lg font-semibold">{id} {FAMILIES[id].label}</h3>
                  <p className="text-sm text-bark">From ${FAMILIES[id].tier === "premium" ? PRICING.premium : PRICING.standard}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] pb-10">
        <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Library</p>
        <h2 className="mt-2 font-display text-4xl text-ink">Real materials</h2>
        <p className="mt-4 max-w-xl text-sm leading-6 text-bark">
          The material photos are in Studio for a visual check. They are not on the builder until you approve each one.
        </p>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] pb-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Portfolio</p>
            <h2 className="mt-2 font-display text-4xl text-ink">Latest builds</h2>
          </div>
          <Link to="/actual-work" className="text-sm font-semibold">Open the gallery</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {photos.slice(0, 4).map((entry) => (
            <Link key={entry.item.id} to="/actual-work" className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink/10">
              <img src={drivePhoto(entry.item.driveId, 800) ?? ""} alt="" className="aspect-[4/5] w-full object-cover" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-[min(900px,94vw)] py-12 pb-20 text-center">
        <h2 className="font-display text-5xl text-ink">Ready to build yours?</h2>
        <Link to="/order" search={{ type: "hat" }} className={`${buttonVariants({ size: "lg" })} mt-6`}>
          Start building
        </Link>
      </section>
    </>
  );
}
