import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { FAMILIES, type FamilyId } from "@/lib/catalog";
import { useOrder } from "@/lib/order-store";
import { galleryWork } from "@/lib/stage-photos";
import { MASTER, drivePhoto, useStudio } from "@/lib/studio-store";

export const Route = createFileRoute("/actual-work")({ component: WorkPage });

function isFamily(value: string): value is FamilyId {
  return value in FAMILIES;
}

function WorkPage() {
  const work = useStudio((state) => state.work);
  const photos = galleryWork(work);
  const [open, setOpen] = useState(0);
  const current = photos[open] ?? photos[0];
  const tagged = current?.decision.modelId && isFamily(current.decision.modelId) ? current.decision.modelId : null;
  const taggedColor = tagged
    ? MASTER.models.find((model) => model.id === tagged)?.colorways.find((color) => color.id === current?.decision.colorId)?.officialName
    : undefined;

  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="safe-grid grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="tech-label">ACTUAL REC WORK / PORTFOLIO</p>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,8vw,5.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-ink">Actual work</h1>
          <p className="mt-4 max-w-[62ch] text-base leading-7 text-bark">
            Real finished REC Mama Made work presented as a portfolio, using the original photography without artificial product substitutions.
          </p>
        </div>
        <Link to="/order" className={buttonVariants()}>
          Build your hat <ArrowRight className="size-4" />
        </Link>
      </div>

      {current && (
        <figure className="editorial-stage mt-10 overflow-hidden rounded-[30px] sm:rounded-[34px]">
          <div className="relative grid aspect-[4/3] w-full place-items-center bg-[radial-gradient(circle_at_50%_35%,#fff_0%,#f5f3ef_58%,#e9e5de_100%)] p-5 sm:aspect-[16/10] sm:p-8 lg:aspect-[16/9]">
            <div className="pointer-events-none absolute inset-[10%] rounded-full border border-border/55" />
            <img
              src={drivePhoto(current.item.driveId, 1600) ?? ""}
              alt={current.decision.title || "Finished REC Mama Made hat"}
              className="relative z-10 h-auto max-h-[90%] w-auto max-w-[94%] object-contain drop-shadow-[0_28px_28px_rgba(45,38,30,0.14)]"
              decoding="async"
            />
          </div>
          <figcaption className="safe-grid grid gap-4 border-t border-border bg-white/90 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="tech-label">FINISHED BUILD / {String(open + 1).padStart(2, "0")}</p>
              <p className="mt-2 text-sm leading-6 text-stage-muted">{current.decision.title || "Finished build"}</p>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                type="button"
                className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-white px-3 text-sm font-semibold text-ink shadow-[0_8px_22px_rgba(45,38,30,0.05)]"
                aria-label="Previous finished work"
                onClick={() => setOpen((value) => (value - 1 + photos.length) % photos.length)}
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                className="grid min-h-11 min-w-11 place-items-center rounded-full border border-border bg-white px-3 text-sm font-semibold text-ink shadow-[0_8px_22px_rgba(45,38,30,0.05)]"
                aria-label="Next finished work"
                onClick={() => setOpen((value) => (value + 1 + photos.length) % photos.length)}
              >
                <ArrowRight className="size-4" />
              </button>
              <Link
                to="/order"
                search={tagged ? { family: tagged, color: taggedColor } : {}}
                onClick={() => {
                  if (tagged) useOrder.getState().setFamily(tagged);
                  if (taggedColor) useOrder.getState().set("colorway", taggedColor);
                  useOrder.getState().set("orderType", "hat");
                }}
                className={buttonVariants({ size: "sm" })}
              >
                Build something like this
              </Link>
            </div>
          </figcaption>
        </figure>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 min-[430px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {photos.map((entry, index) => (
          <button
            key={entry.item.id}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={`View finished work ${index + 1}`}
            className={`group overflow-hidden rounded-[18px] bg-stage-photo ring-1 transition-[transform,box-shadow,ring-color] duration-200 ${index === open ? "ring-2 ring-primary shadow-[0_12px_30px_rgba(45,38,30,0.10)]" : "ring-border hover:-translate-y-0.5 hover:ring-primary/35"}`}
          >
            <img
              src={drivePhoto(entry.item.driveId, 320) ?? ""}
              alt=""
              className="aspect-[4/5] w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
          </button>
        ))}
      </div>
    </section>
  );
}
