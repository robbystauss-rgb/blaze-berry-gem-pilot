import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Box, Layers3, ScanLine, Sparkles } from "lucide-react";
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
  { id: "256", kicker: "Umpqua Gramps Cap" },
  { id: "112PFP", kicker: "Printed five-panel" },
];

const FLOW = [
  { label: "Hat", detail: "Choose a verified model and color" },
  { label: "Material", detail: "Pick from real REC material samples" },
  { label: "Shape", detail: "Set the patch silhouette and size" },
  { label: "Design", detail: "Add text or upload your artwork" },
  { label: "Proof", detail: "Confirm placement before production" },
  { label: "Made", detail: "Your approved build goes to production" },
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

  return (
    <>
      <section className="mx-auto grid w-[min(1260px,94vw)] items-center gap-8 pb-16 pt-12 lg:min-h-[calc(100dvh-8rem)] lg:grid-cols-[0.92fr_1.08fr] lg:pb-20 lg:pt-14">
        <div className="relative z-10">
          <div className="kicker"><span className="status-dot" /> REC CUSTOM SYSTEM / 01</div>
          <h1 className="hero-title mt-6 font-display text-[clamp(3.7rem,7vw,7rem)] leading-[0.88] font-bold tracking-[-0.065em]">
            Design it.<br />See it.<br />Make it yours.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-bark sm:text-lg sm:leading-8">
            A modern custom-build experience for Richardson hats and loose leatherette patches—using real product photography, real REC material samples, and a live preview before production.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/order"
              search={{ type: "hat" }}
              onClick={() => useOrder.getState().set("orderType", "hat")}
              className={buttonVariants({ size: "lg" })}
            >
              Launch hat builder <ArrowRight className="size-4" />
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

          <div className="mt-9 grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              ["VERIFIED", "Richardson product photos"],
              ["REAL", "31 named material swatches"],
              ["PROOFED", "Before production"],
            ].map(([top, bottom]) => (
              <div key={top} className="metric-card rounded-2xl px-4 py-3">
                <p className="text-[0.65rem] font-extrabold tracking-[0.16em] text-accent uppercase">{top}</p>
                <p className="mt-1 text-sm font-semibold text-ink">{bottom}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="tech-panel product-stage min-h-[520px] rounded-[2rem] lg:min-h-[650px]">
          <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <div>
              <p className="tech-label">REC / ACTUAL WORK</p>
              <p className="mt-1 text-xs text-bark">Live showcase from your real work library</p>
            </div>
            <div className="flex items-center gap-2 text-[0.65rem] font-bold tracking-[0.12em] text-bark uppercase">
              <ScanLine className="size-4 text-accent" /> Live view
            </div>
          </div>

          <div className="relative grid min-h-[520px] place-items-center px-5 pb-24 pt-20 lg:min-h-[650px]">
            <div className="absolute inset-[11%] rounded-full border border-white/[0.05]" />
            <div className="absolute inset-[19%] rounded-full border border-white/[0.035]" />
            {current ? (
              <img
                key={current.item.id}
                src={drivePhoto(current.item.driveId, 1500) ?? ""}
                alt="Finished REC Mama Made hat"
                className="stage-in relative z-10 max-h-[72%] w-[88%] object-contain drop-shadow-[0_40px_70px_rgba(0,0,0,0.48)]"
              />
            ) : (
              <p className="relative z-10 text-bark">Work photos are loading.</p>
            )}
          </div>

          <div className="absolute inset-x-4 bottom-4 z-20 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 backdrop-blur-xl">
              <p className="tech-label">SOURCE</p>
              <p className="mt-1 text-xs font-semibold text-ink">REC finished work</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 backdrop-blur-xl">
              <p className="tech-label">PROCESS</p>
              <p className="mt-1 text-xs font-semibold text-ink">Preview → proof → make</p>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/35 px-4 py-3 backdrop-blur-xl">
              <p className="tech-label">PRODUCT</p>
              <p className="mt-1 text-xs font-semibold text-ink">Custom patch hat</p>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto w-[min(1180px,94vw)]"><div className="metal-line" /></div>

      <section className="section mx-auto w-[min(1180px,94vw)]">
        <div className="grid items-end gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="tech-label">BUILD PROTOCOL / 02</p>
            <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.7rem,5vw,4.8rem)] font-bold leading-[0.95] tracking-[-0.055em] text-ink">
              Your idea, translated into a production-ready build.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-bark">
            Every decision stays visible as you move through the builder, with the final engraving and placement confirmed in your digital proof.
          </p>
        </div>

        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((step, index) => (
            <li key={step.label} className="hairline-card lift-card rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl font-semibold text-primary/80">{String(index + 1).padStart(2, "0")}</span>
                {index < FLOW.length - 1 ? <ArrowRight className="size-4 text-subtle" /> : <BadgeCheck className="size-4 text-accent" />}
              </div>
              <h3 className="mt-6 text-xl font-bold text-ink">{step.label}</h3>
              <p className="mt-2 text-sm leading-6 text-bark">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] pb-20">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="tech-label">VERIFIED CATALOG / 03</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-ink sm:text-5xl">Start with the right hat.</h2>
          </div>
          <Link to="/hats" className="flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-2">
            Explore all ready models <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURED.map(({ id, kicker }) => {
            const photo = familyHero(id);
            return (
              <Link key={id} to={familyTo(id)} className="tech-panel lift-card group rounded-[1.6rem]">
                <div className="product-stage relative grid h-56 place-items-center overflow-hidden border-b border-white/[0.07]">
                  <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[0.6rem] font-extrabold tracking-[0.12em] text-bark uppercase backdrop-blur-md">
                    Richardson {id}
                  </div>
                  {photo && <img src={photo} alt="" className="relative z-10 h-44 w-[86%] object-contain transition-transform duration-500 group-hover:scale-[1.04]" />}
                </div>
                <div className="px-5 py-5">
                  <p className="tech-label">{kicker}</p>
                  <h3 className="mt-2 text-lg font-bold text-ink">{id} {FAMILIES[id].label}</h3>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-sm text-bark">From ${FAMILIES[id].tier === "premium" ? PRICING.premium : PRICING.standard}</p>
                    <ArrowRight className="size-4 text-primary transition-transform duration-200 group-hover:translate-x-1" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto grid w-[min(1180px,94vw)] gap-4 pb-20 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="tech-panel rounded-[1.8rem] p-6 sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07]">
            <Layers3 className="size-5 text-primary" />
          </div>
          <p className="mt-8 tech-label">REAL MATERIAL LIBRARY / 04</p>
          <h2 className="mt-3 font-display text-4xl font-bold leading-[0.98] text-ink">Actual material samples. No fake swatches.</h2>
          <p className="mt-5 text-sm leading-6 text-bark">
            The staging builder uses the 31 named swatches taken from your real “My leatherette options.PNG” source sheet. The two unnamed cards remain excluded until they can be identified.
          </p>
          <Link to="/order" search={{ type: "hat" }} className={`${buttonVariants({ variant: "outline" })} mt-7`}>
            Open material builder <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="tech-panel rounded-[1.8rem] p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: ScanLine, title: "Live preview", copy: "See the selected hat, material, shape, artwork, and placement update as you build." },
              { icon: BadgeCheck, title: "Digital proof", copy: "Final engraving and placement are confirmed before production begins." },
              { icon: Box, title: "Two product paths", copy: "Build a complete custom hat or order the finished patch by itself." },
            ].map(({ icon: Icon, title, copy }) => (
              <div key={title} className="hairline-card rounded-2xl p-5">
                <Icon className="size-5 text-accent" />
                <h3 className="mt-8 text-lg font-bold text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-bark">{copy}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.045] p-5">
            <div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" /><span className="text-xs font-extrabold tracking-[0.12em] uppercase">REC standard</span></div>
            <p className="mt-3 text-sm leading-6 text-bark">Real product photography stays the source of truth. Missing product angles are shown as unavailable instead of being generated or substituted.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] pb-20">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="tech-label">ACTUAL WORK / 05</p>
            <h2 className="mt-3 font-display text-4xl font-bold text-ink sm:text-5xl">Built in the real world.</h2>
          </div>
          <Link to="/actual-work" className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary-2">
            Open full gallery <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {photos.slice(0, 4).map((entry, index) => (
            <Link key={entry.item.id} to="/actual-work" className="tech-panel lift-card group relative overflow-hidden rounded-2xl">
              <img src={drivePhoto(entry.item.driveId, 900) ?? ""} alt="Finished REC Mama Made work" className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]" />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-4 pb-4 pt-16">
                <span className="text-[0.62rem] font-extrabold tracking-[0.14em] text-white/60 uppercase">Build {String(index + 1).padStart(2, "0")}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto w-[min(1180px,94vw)] pb-24">
        <div className="tech-panel tech-grid rounded-[2rem] px-6 py-12 text-center sm:px-12 sm:py-16">
          <p className="tech-label">READY / 06</p>
          <h2 className="hero-title mx-auto mt-4 max-w-4xl font-display text-[clamp(3rem,6vw,6rem)] font-bold leading-[0.9] tracking-[-0.065em]">
            Build something worth wearing.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-bark sm:text-base">Start with a real hat, pick your actual material, add your design, and see the build take shape before it goes to production.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/order" search={{ type: "hat" }} className={buttonVariants({ size: "lg" })}>Launch builder <ArrowRight className="size-4" /></Link>
            <Link to="/actual-work" className={buttonVariants({ variant: "outline", size: "lg" })}>See finished work</Link>
          </div>
        </div>
      </section>
    </>
  );
}
