import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { HatApproval } from "@/components/studio/hat-approval";
import { StorePreview } from "@/components/studio/store-preview";
import { MaterialApproval } from "@/components/studio/material-approval";
import { WorkLibrary } from "@/components/studio/work-library";
import { isDirty, useStudio } from "@/lib/studio-store";

export const Route = createFileRoute("/studio")({ component: StudioPage });

type Tab = "materials" | "catalog" | "work" | "preview";

function StudioPage() {
  const [tab, setTab] = useState<Tab>("materials");
  const dirty = useStudio((state) => isDirty(state));
  useEffect(() => {
    void useStudio.persist.rehydrate();
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty(useStudio.getState()),
    enableBeforeUnload: () => isDirty(useStudio.getState()),
    withResolver: true,
  });

  return (
    <div id="studio" className="bg-stage text-stage-ink">
      <div className="mx-auto w-[min(1240px,94vw)] py-8 md:py-12">
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Studio · not the live shop</p>
        <h1 className="mt-2 font-display text-5xl text-stage-ink">Studio</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stage-muted">
          Every supplied color starts as not offered. A photo, a Richardson listing, an offer, and stock are four separate facts.
        </p>
        {dirty && (
          <p className="mt-4 rounded-2xl bg-primary/15 px-4 py-3 text-sm text-stage-ink" role="status">
            Unsaved changes. They are not part of the saved snapshot. Leaving Studio will ask you to stay or discard the trip — the changes stay in this browser until you save a snapshot.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <TabButton current={tab} id="materials" onSelect={setTab} label="Materials" />
          <TabButton current={tab} id="catalog" onSelect={setTab} label="Hat catalog" />
          <TabButton current={tab} id="work" onSelect={setTab} label="Work library" />
          <TabButton current={tab} id="preview" onSelect={setTab} label="Preview store" />
        </div>
        <div className="mt-6">
          {tab === "materials" && <MaterialApproval />}
          {tab === "catalog" && <HatApproval />}
          {tab === "work" && <WorkLibrary />}
          {tab === "preview" && <StorePreview />}
        </div>
        <aside className="mt-12 border-t border-stage-line pt-6">
          <h2 className="text-sm font-semibold tracking-wide text-stage-muted uppercase">Not connected to the shop</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stage-muted">
            The staging builder uses the 31 named material swatches from the approved source sheet and keeps the two unnamed cards out. This Studio panel is for visual QA and catalog review; publishing to the live shop stays off.
          </p>
        </aside>
      </div>
      {blocker.status === "blocked" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-4" role="dialog" aria-modal="true" aria-label="Unsaved catalog changes">
          <div className="w-[min(440px,100%)] rounded-3xl bg-stage p-5 text-stage-ink shadow-stage">
            <h2 className="font-display text-3xl">Leave Studio?</h2>
            <p className="mt-2 text-sm leading-6 text-stage-muted">
              These catalog changes are not in the saved snapshot. They remain in this browser, but they are not saved as the catalog snapshot.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="text-stage-ink" onClick={() => blocker.reset()}>
                Stay
              </Button>
              <Button type="button" onClick={() => blocker.proceed()}>
                Leave anyway
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  current,
  id,
  label,
  onSelect,
}: {
  current: Tab;
  id: Tab;
  label: string;
  onSelect: (id: Tab) => void;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`min-h-11 rounded-full px-4 text-sm font-semibold ${on ? "bg-primary text-primary-fg" : "bg-stage-photo text-stage-ink ring-1 ring-stage-line"}`}
    >
      {label}
    </button>
  );
}
