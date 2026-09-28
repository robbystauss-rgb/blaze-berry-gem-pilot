import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Layers3, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { FAMILIES, PRICING, type FamilyId } from "@/lib/catalog";
import { familyHero, galleryWork } from "@/lib/stage-photos";
import { drivePhoto, useStudio } from "@/lib/studio-store";
import { useOrder } from "@/lib/order-store";

export const Route = createFileRoute("/")({ component: Home });

const FEATURED: { id: FamilyId; kicker: string }[] = [
  { id: "112", kicker: "The everyday classic" },
  { id: "112P", kicker: "Printed trucker" },
  { id: "256", kicker: "Low-profile favorite" },
  { id: "112PFP", kicker: "Printed five-panel" },
];

const FLOW = [
  { label: "Choose the hat", detail: "Start with a real Richardson model and verified color." },
  { label: "Make it yours", detail: "Pick the material, shape, size, design, and placement." },
  { label: "Approve the proof", detail: "You see the final layout before anything goes to production." },
];

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
    const id = window.setInterval(() => setFrame((value) => (value + 1) % Math.min(photos.length, 4)), 5200);
    return () => window.clearInterval(id);
  }, [photos.length]);

  const current = photos[frame] ?? photos[0];
  const heroSrc = current ? drivePhoto(current.item.driveId, 1800) : familyHero("112");

  return (
    <>
      <section className="site-container page-top-space pb-8 sm:pb-12 lg:pb-16">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/75 px-4 py-2 text-[0.68rem] font-extrabold tracking-[0.14em] text-bark uppercase shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-accent" /> Custom leather patch hats
          </div>
          <h1 className="hero-title mx-auto mt-6 max-w-[10ch] font-display text-[clamp(4rem,14vw,8.6rem)] font-bold leading-[0.82] tracking-[-0.075em] sm:max-w-none">
            Made to be yours.
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-bark sm:text-lg sm:leading-8">
            Choose the hat. Choose the material. Add your design. See it come together before we make it.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Link
              to="/order"
              search={{ type: "hat" }}
              onClick={() => useOrder.getState().set("orderType", "hat")}
              className={`${buttonVariants({ size: "lg" })} min-w-[180px]`}
            >
              Build your hat <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/order"
              search={{ type: "patch" }}
              onClick={() => useOrder.getState().set("orderType", "patch")}
              className={`${buttonVariants({ variant: "outline", size: "lg" })} min-w-[150px]`}
            >
              Patch only
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-10 min-h-[430px] max-w-6xl overflow-hidden rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_50%_28%,rgba(199,160,93,0.16),transparent_33%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,244,237,0.98))] shadow-[0_30px_90px_rgba(45,38,30,0.10)] sm:min-h-[560px] sm:rounded-[2.75rem] lg:min-h-[680px]">
          <div className="pointer-events-none absolute left-1/2 top-[45%] h-[56%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/45" />
          <div className="pointer-events-none absolute left-1/2 top-[45%] h-[40%] w-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/30" />
          <div className="absolute inset-0 grid place-items-center px-5 pb-16 pt-8 sm:px-10 sm:pb-20 sm:pt-12">
            {heroSrc ? (
              <img
                key={current?.item.id ?? heroSrc}
                src={heroSrc}
                alt="Custom REC Mama Made leather patch hat"
                className="stage-in relative z-10 h-auto max-h-[78%] w-auto max-w-[92%] object-contain drop-shadow-[0_34px_44px_rgba(45,38,30,0.18)] sm:max-w-[84%]"
                decoding="async"
              />
            ) : (
              <p className="text-bark">Finished work is loading.</p>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-border/60 bg-white/70 px-5 py-4 backdrop-blur-md sm:px-8">
            <div>
              <p className="text-[0.62rem] font-extrabold tracking-[0.13em] text-bark uppercase">Real REC work</p>
              <p className="mt-1 text-sm font-semibold text-ink">Your design, previewed before production</p>
            </div>
            <Link to="/actual-work" className="hidden min-h-11 items-center gap-2 text-sm font-bold text-primary sm:flex">
              See the gallery <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="site-container section-space">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">Simple by design</p>
          <h2 className="mt-4 font-display text-[clamp(2.7rem,7vw,5.4rem)] font-bold leading-[0.92] tracking-[-0.055em] text-ink">
            From idea to finished hat.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-bark sm:text-base">
            The builder keeps every decision clear, visual, and easy to change. No shop jargon. No guessing what you ordered.
          </p>
        </div>

        <ol className="mx-auto mt-10 grid max-w-6xl gap-4 md:grid-cols-3">
          {FLOW.map((step, index) => (
            <li key={step.label} className="rounded-[1.75rem] border border-border/80 bg-white/75 p-6 shadow-[0_16px_45px_rgba(45,38,30,0.055)] sm:p-8">
              <div className="flex items-center justify-between">
                <span className="font-display text-3xl font-semibold tracking-[-0.05em] text-primary/75">0{index + 1}</span>
                {index === FLOW.length - 1 ? <BadgeCheck className="size-5 text-accent" /> : <ArrowRight className="size-4 text-subtle" />}
              </div>
              <h3 className="mt-10 text-xl font-bold text-ink sm:text-2xl">{step.label}</h3>
              <p className="mt-3 text-sm leading-7 text-bark">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="site-container section-space pt-0">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">Choose your starting point</p>
            <h2 className="mt-3 font-display text-[clamp(2.5rem,6vw,4.6rem)] font-bold leading-[0.96] tracking-[-0.05em] text-ink">
              The hat matters.
            </h2>
          </div>
          <Link to="/hats" className="flex min-h-11 items-center gap-2 self-start text-sm font-bold text-primary transition-colors hover:text-primary-2 sm:self-auto">
            Explore every model <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURED.map(({ id, kicker }) => {
            const photo = familyHero(id);
            return (
              <Link key={id} to={familyTo(id)} className="group overflow-hidden rounded-[1.8rem] border border-border/80 bg-white shadow-[0_14px_38px_rgba(45,38,30,0.06)] transition-transform duration-300 hover:-translate-y-1">
                <div className="relative grid aspect-[4/3] min-h-56 place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(199,160,93,0.12),transparent_36%),#f7f4ed] p-5">
                  {photo ? (
                    <img
                      src={photo}
                      alt={`${id} ${FAMILIES[id].label}`}
                      className="relative z-10 h-auto max-h-[78%] w-auto max-w-[88%] object-contain transition-transform duration-500 group-hover:scale-[1.035]"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <p className="text-sm text-bark">Verified photo unavailable</p>
                  )}
                </div>
                <div className="border-t border-border/70 px-5 py-5">
                  <p className="text-[0.64rem] font-extrabold tracking-[0.12em] text-bark uppercase">{kicker}</p>
                  <h3 className="mt-2 text-lg font-bold leading-snug text-ink">Richardson {id}</h3>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-bark">From ${FAMILIES[id].tier === "premium" ? PRICING.premium : PRICING.standard}</p>
                    <ArrowRight className="size-4 shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="site-container section-space pt-0">
        <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(247,244,237,0.96))] px-6 py-10 shadow-[0_20px_60px_rgba(45,38,30,0.06)] sm:px-10 sm:py-14 lg:px-14">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/[0.07]">
                <Layers3 className="size-5 text-primary" />
              </div>
              <p className="mt-7 text-xs font-extrabold tracking-[0.14em] text-accent uppercase">Built around the real materials</p>
              <h2 className="mt-3 max-w-xl font-display text-[clamp(2.5rem,6vw,4.8rem)] font-bold leading-[0.95] tracking-[-0.05em] text-ink">
                What you choose is what we make.
              </h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-bark sm:text-base">
                Real hat photography and real REC leatherette samples stay at the center of the experience, with the final engraving and placement confirmed in your digital proof.
              </p>
              <Link to="/order" search={{ type: "hat" }} className={`${buttonVariants({ variant: "outline" })} mt-7`}>
                Start customizing <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Live preview", "Watch the hat, material, shape, artwork, and placement update as you build."],
                ["Real samples", "Choose from the actual named leatherette options used in production."],
                ["Proof before production", "Final engraving and placement are confirmed before your order is made."],
                ["Hat or patch only", "Build the complete hat or order the finished custom patch by itself."],
              ].map(([title, copy]) => (
                <div key={title} className="rounded-2xl border border-border/80 bg-white/80 p-5 sm:p-6">
                  <BadgeCheck className="size-4 text-accent" />
                  <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-bark">{copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="site-container section-space pt-0">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">Made for real people</p>
            <h2 className="mt-3 font-display text-[clamp(2.5rem,6vw,4.6rem)] font-bold leading-[0.96] tracking-[-0.05em] text-ink">
              See what we’ve made.
            </h2>
          </div>
          <Link to="/actual-work" className="flex min-h-11 items-center gap-2 self-start text-sm font-bold text-primary hover:text-primary-2 sm:self-auto">
            View the full gallery <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {photos.slice(0, 4).map((entry) => (
            <Link key={entry.item.id} to="/actual-work" className="group relative overflow-hidden rounded-[1.75rem] border border-border bg-white shadow-[0_14px_38px_rgba(45,38,30,0.07)]">
              <div className="aspect-[4/5] overflow-hidden bg-stage-photo">
                <img
                  src={drivePhoto(entry.item.driveId, 1000) ?? ""}
                  alt="Finished REC Mama Made custom work"
                  className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.035]"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-container page-bottom-space">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-border/70 bg-[radial-gradient(circle_at_50%_0%,rgba(199,160,93,0.18),transparent_32%),#fff] px-6 py-14 text-center shadow-[0_26px_75px_rgba(45,38,30,0.08)] sm:px-12 sm:py-20 lg:px-16 lg:py-24">
          <p className="text-xs font-extrabold tracking-[0.14em] text-accent uppercase">Make the next one yours</p>
          <h2 className="hero-title mx-auto mt-4 max-w-4xl font-display text-[clamp(3rem,9vw,6.6rem)] font-bold leading-[0.88] tracking-[-0.065em]">
            Start with an idea.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-bark sm:text-base">
            Pick the hat, add the design, move the patch where you want it, and approve the final proof before production.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Link to="/order" search={{ type: "hat" }} className={buttonVariants({ size: "lg" })}>
              Build your hat <ArrowRight className="size-4" />
            </Link>
            <Link to="/actual-work" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See finished work
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
