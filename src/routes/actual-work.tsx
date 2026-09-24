import { createFileRoute, Link } from "@tanstack/react-router";
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
    <section className="mx-auto w-[min(1240px,94vw)] py-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl">Actual work</h1>
        <Link to="/order" className={buttonVariants()}>
          Build your hat
        </Link>
      </div>
      {current && (
        <figure className="mt-6 overflow-hidden rounded-[28px] bg-stage-photo shadow-stage ring-1 ring-stage-line">
          <img
            src={drivePhoto(current.item.driveId, 1600) ?? ""}
            alt={current.decision.title || "Finished REC Mama Made hat"}
            className="max-h-[78dvh] w-full object-contain"
          />
          <figcaption className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm text-stage-muted">{current.decision.title || "Finished build"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="min-h-11 px-3 text-sm font-semibold" onClick={() => setOpen((value) => (value - 1 + photos.length) % photos.length)}>
                Previous
              </button>
              <button type="button" className="min-h-11 px-3 text-sm font-semibold" onClick={() => setOpen((value) => (value + 1) % photos.length)}>
                Next
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
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {photos.map((entry, index) => (
          <button
            key={entry.item.id}
            type="button"
            onClick={() => setOpen(index)}
            className={`w-28 shrink-0 overflow-hidden rounded-2xl bg-stage-photo ring-2 ${index === open ? "ring-primary" : "ring-transparent"}`}
          >
            <img src={drivePhoto(entry.item.driveId, 320) ?? ""} alt="" className="h-36 w-full object-cover" />
          </button>
        ))}
      </div>
    </section>
  );
}
