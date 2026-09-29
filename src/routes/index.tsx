import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Box, Layers3, ScanLine, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { FAMILIES, PRICING, type FamilyId } from "@/lib/catalog";
import { HAT_MODEL_LABELS, hatModelPath } from "@/lib/hat-models";
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
      <section className="home-reveal page-bottom-space">
        <div className="site-container relative z-10 pt-[clamp(3.25rem,8vw,7.5rem)]">
          <div className="mx-auto max-w-5xl text-center">
            <p className="home-reveal-eyebrow">REC Mama Made · Custom hats, reimagined</p>
            <h1 className="home-reveal-title mt-4 font-display font-bold">Make it yours.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-bark sm:text-xl sm:leading-8">
              Choose the hat. Shape the patch. Add your design. See the whole build come together before it goes to production.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
              <Link to="/order" search={{ type: "hat" }} onClick={() => useOrder.getState().set("orderType", "hat")} className={buttonVariants({ size: "lg" })}>
                Build your hat <ArrowRight className="size-4" />
              </Link>
              <Link to="/actual-work" className={buttonVariants({ variant: "outline", size: "lg" })}>
                See finished work
              </Link>
            </div>
          </div>

          <div className="home-reveal-stage mx-auto mt-10 max-w-5xl sm:mt-14">
            <div className="home-reveal-orbit home-reveal-orbit-one" />
            <div className="home-reveal-orbit home-reveal-orbit-two" />
            {current ? (
              <img key={current.item.id} src={drivePhoto(current.item.driveId, 1800) ?? ""} alt="Finished REC Mama Made custom hat" className="stage-in relative z-10 mx-auto h-auto max-h-[min(58vh,620px)] w-auto max-w-[92%] object-contain" decoding="async" />
            ) : (
              <p className="relative z-10 text-sm text-bark">Finished work is loading.</p>
            )}
            <div className="home-reveal-caption">
              <span>Designed by you.</span><span>Made by REC Mama Made.</span>
            </div>
          </div>
        </div>
      </section>

      <div className="site-container"><div className="metal-line" /></div>

      <section className="site-container section-space">
        <div className="safe-grid grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)] md:items-end">
          <div>
            <p className="tech-label">BUILD PROTOCOL / 02</p>
            <h2 className="mt-3 max-w-3xl font-display text-[clamp(2.35rem,7vw,4.8rem)] font-bold leading-[0.98] tracking-[-0.05em] text-ink">
              Your idea, translated into a production-ready build.
            </h2>
          </div>
          <p className="max-w-[48ch] text-sm leading-7 text-bark md:justify-self-end">
            Every decision stays visible as you move through the builder, with the final engraving and placement confirmed in your digital proof.
          </p>
        </div>

        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((step, index) => (
            <li key={step.label} className="hairline-card lift-card rounded-2xl p-5 sm:p-6">
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

      <section className="site-container section-space pt-0">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="tech-label">VERIFIED CATALOG / 03</p>
            <h2 className="mt-3 font-display text-[clamp(2.3rem,6vw,4rem)] font-bold leading-tight text-ink">Start with the right hat.</h2>
          </div>
          <Link to="/hats" className="flex min-h-11 items-center gap-2 self-start text-sm font-bold text-primary transition-colors hover:text-primary-2 sm:self-auto">
            Explore all ready models <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURED.map(({ id, kicker }) => {
            const photo = familyHero(id);
            return (
              <Link key={id} to={hatModelPath(id)} className="premium-card group overflow-hidden rounded-[1.6rem] bg-white">
                <div className="product-card-stage relative grid aspect-[4/3] min-h-56 place-items-center border-b border-border/80 p-5">
                  <div className="absolute left-4 top-4 z-20 rounded-full border border-border bg-white/88 px-2.5 py-1 text-[0.6rem] font-extrabold tracking-[0.11em] text-bark uppercase backdrop-blur-md">
                    Richardson {id}
                  </div>
                  {photo ? (
                    <img
                      src={photo}
                      alt={`${id} ${HAT_MODEL_LABELS[id]}`}
                      className="relative z-10 h-auto max-h-[78%] w-auto max-w-[86%] object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                    />
                  ) : (
                    <p className="text-sm text-bark">Verified photo unavailable</p>
                  )}
                </div>
                <div className="px-5 py-5">
                  <p className="tech-label">{kicker}</p>
                  <h3 className="mt-2 text-lg font-bold leading-snug text-ink">{id} {HAT_MODEL_LABELS[id]}</h3>
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
        <div className="safe-grid grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="tech-panel rounded-[1.8rem] p-6 sm:p-8">
            <div className="flex size-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07]">
              <Layers3 className="size-5 text-primary" />
            </div>
            <p className="mt-8 tech-label">REAL MATERIAL LIBRARY / 04</p>
            <h2 className="mt-3 font-display text-[clamp(2.15rem,5vw,3.4rem)] font-bold leading-[1.02] text-ink">Actual material samples. No fake swatches.</h2>
            <p className="mt-5 max-w-[58ch] text-sm leading-7 text-bark">
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
                  <h3 className="mt-7 text-lg font-bold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-bark">{copy}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.045] p-5">
              <div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" /><span className="text-xs font-extrabold tracking-[0.12em] uppercase">REC standard</span></div>
              <p className="mt-3 text-sm leading-6 text-bark">Real product photography stays the source of truth. Missing product angles are shown as unavailable instead of being generated or substituted.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="site-container section-space pt-0">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="tech-label">ACTUAL WORK / 05</p>
            <h2 className="mt-3 font-display text-[clamp(2.3rem,6vw,4rem)] font-bold leading-tight text-ink">Built in the real world.</h2>
          </div>
          <Link to="/actual-work" className="flex min-h-11 items-center gap-2 self-start text-sm font-bold text-primary hover:text-primary-2 sm:self-auto">
            Open full gallery <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {photos.slice(0, 4).map((entry, index) => (
            <Link key={entry.item.id} to="/actual-work" className="group relative overflow-hidden rounded-[24px] border border-border bg-white shadow-[0_14px_38px_rgba(45,38,30,0.07)]">
              <div className="aspect-[4/5] overflow-hidden bg-stage-photo">
                <img
                  src={drivePhoto(entry.item.driveId, 900) ?? ""}
                  alt="Finished REC Mama Made work"
                  className="h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.025]"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/78 via-black/22 to-transparent px-4 pb-4 pt-16">
                <span className="text-[0.62rem] font-extrabold tracking-[0.13em] text-white/85 uppercase">Build {String(index + 1).padStart(2, "0")}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="site-container page-bottom-space">
        <div className="tech-panel tech-grid rounded-[2rem] px-6 py-12 text-center sm:px-12 sm:py-16 lg:px-16 lg:py-20">
          <p className="tech-label">READY / 06</p>
          <h2 className="hero-title mx-auto mt-4 max-w-4xl font-display text-[clamp(2.7rem,8vw,5.8rem)] font-bold leading-[0.94] tracking-[-0.055em]">
            Build something worth wearing.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-bark sm:text-base">Start with a real hat, pick your actual material, add your design, and see the build take shape before it goes to production.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 min-[420px]:flex-row min-[420px]:flex-wrap">
            <Link to="/order" search={{ type: "hat" }} className={buttonVariants({ size: "lg" })}>Launch builder <ArrowRight className="size-4" /></Link>
            <Link to="/actual-work" className={buttonVariants({ variant: "outline", size: "lg" })}>See finished work</Link>
          </div>
        </div>
      </section>
    </>
  );
}
