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
    <div id="studio" className="bg-stage/55 text-stage-ink">
      <div className="site-container page-top-space page-bottom-space">
        <p className="tech-label">Studio · not the live shop</p>
        <h1 className="mt-3 font-display text-[clamp(2.8rem,8vw,5rem)] leading-tight text-stage-ink">Studio</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stage-muted">
          Every supplied color starts as not offered. A photo, a Richardson listing, an offer, and stock are four separate facts.
        </p>
        {dirty && (
          <p className="mt-5 max-w-4xl rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm leading-6 text-stage-ink" role="status">
            Unsaved changes. They are not part of the saved snapshot. Leaving Studio will ask you to stay or discard the trip — the changes stay in this browser until you save a snapshot.
          </p>
        )}
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap" role="tablist" aria-label="Studio sections">
          <TabButton current={tab} id="materials" onSelect={setTab} label="Materials" />
          <TabButton current={tab} id="catalog" onSelect={setTab} label="Hat catalog" />
          <TabButton current={tab} id="work" onSelect={setTab} label="Work library" />
          <TabButton current={tab} id="preview" onSelect={setTab} label="Preview store" />
        </div>
        <div className="mt-7 min-w-0">
          {tab === "materials" && <MaterialApproval />}
          {tab === "catalog" && <HatApproval />}
          {tab === "work" && <WorkLibrary />}
          {tab === "preview" && <StorePreview />}
        </div>
        <aside className="mt-14 border-t border-stage-line pt-6">
          <h2 className="text-sm font-semibold tracking-wide text-stage-muted uppercase">Not connected to the shop</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-stage-muted">
            The staging builder uses the 31 named material swatches from the approved source sheet and keeps the two unnamed cards out. This Studio panel is for visual QA and catalog review; publishing to the live shop stays off.
          </p>
        </aside>
      </div>
      {blocker.status === "blocked" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/80 p-4" role="dialog" aria-modal="true" aria-label="Unsaved catalog changes">
          <div className="w-[min(440px,100%)] rounded-3xl bg-white p-5 text-stage-ink shadow-[0_24px_70px_rgba(45,38,30,0.18)] sm:p-6">
            <h2 className="font-display text-3xl leading-tight">Leave Studio?</h2>
            <p className="mt-2 text-sm leading-6 text-stage-muted">
              These catalog changes are not in the saved snapshot. They remain in this browser, but they are not saved as the catalog snapshot.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
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
      role="tab"
      aria-selected={on}
      onClick={() => onSelect(id)}
      className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${on ? "bg-primary text-primary-fg" : "bg-white text-stage-ink ring-1 ring-stage-line"}`}
    >
      {label}
    </button>
  );
}
