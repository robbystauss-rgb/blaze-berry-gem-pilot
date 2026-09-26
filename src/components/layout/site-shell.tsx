import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Menu, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/actual-work", label: "Work" },
  { to: "/hats", label: "Hats" },
  { to: "/order", label: "Patches", search: { type: "patch" as const } },
] as const;

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void useStudio.persist.rehydrate();
  }, []);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-stage-photo focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>

      <div className="border-b border-border bg-white/65 backdrop-blur-xl">
        <div className="mx-auto flex w-[min(1240px,94vw)] items-center justify-between gap-4 py-2 text-[0.68rem] font-bold tracking-[0.12em] uppercase">
          <div className="flex min-w-0 items-center gap-2 text-bark">
            <span className="status-dot shrink-0" />
            <span className="truncate">Custom build system online</span>
          </div>
          <p className="hidden text-bark sm:block">Hat + patch from $30 · Patch only from $5 · Buy 12, get 1 free</p>
        </div>
      </div>

      <header className="sticky top-0 z-40 px-3 pt-3 md:px-5">
        <div className="glass-nav mx-auto flex w-[min(1240px,100%)] items-center justify-between gap-4 rounded-2xl px-3 py-2.5 md:px-4">
          <Link to="/" className="group flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <Sparkles className="size-4 text-primary transition-transform duration-300 group-hover:rotate-12" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[1.04rem] leading-none font-bold tracking-[-0.02em] text-ink sm:text-[1.15rem]">
                REC Mama Made
              </span>
              <span className="mt-1 block truncate text-[0.58rem] font-extrabold tracking-[0.18em] text-bark uppercase">
                Custom product studio
              </span>
            </span>
          </Link>

          <nav className="hidden items-center rounded-full border border-border bg-white/65 p-1 md:flex" aria-label="Main">
            {LINKS.map((link) => {
              const active = link.to === "/" ? pathname === "/" : pathname === link.to || pathname.startsWith(`${link.to}/`);
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  search={"search" in link ? link.search : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold tracking-[0.03em] transition-colors",
                    active ? "bg-pill text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]" : "text-bark hover:bg-pill/70 hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/order"
              search={{ type: "hat" }}
              className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
            >
              Build yours <ArrowUpRight className="size-3.5" />
            </Link>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-xl border border-border bg-white/80 text-ink shadow-sm md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="glass-nav mx-auto mt-2 w-[min(1240px,100%)] rounded-2xl p-2 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {LINKS.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  search={"search" in link ? link.search : undefined}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-pill/70"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/order"
                search={{ type: "hat" }}
                onClick={() => setOpen(false)}
                className="mt-1 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/[0.08] px-4 py-3 text-sm font-bold text-primary"
              >
                Build your hat <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main">{children}</main>

      {pathname !== "/order" && (
        <footer className="mt-20 border-t border-border bg-white/55 py-12 backdrop-blur-xl">
          <div className="mx-auto grid w-[min(1180px,94vw)] gap-8 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="flex items-center gap-2">
                <span className="status-dot" />
                <span className="tech-label">REC build system</span>
              </div>
              <p className="mt-4 font-display text-3xl font-bold tracking-[-0.035em] text-ink">REC Mama Made</p>
              <p className="mt-3 max-w-xl text-sm leading-6 text-bark">
                Custom Richardson hats and heat-adhesive leatherette patches with real product photography, live customization preview, and a proof before production. Laser holes are available; sewing and thread are not offered.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Link to="/actual-work" className="hairline-card rounded-xl px-4 py-3 text-bark transition-colors hover:text-ink">Actual work</Link>
              <Link to="/hats" className="hairline-card rounded-xl px-4 py-3 text-bark transition-colors hover:text-ink">Hat catalog</Link>
              <Link to="/order" search={{ type: "hat" }} className="hairline-card rounded-xl px-4 py-3 text-bark transition-colors hover:text-ink">Build a hat</Link>
              <Link to="/order" search={{ type: "patch" }} className="hairline-card rounded-xl px-4 py-3 text-bark transition-colors hover:text-ink">Patch only</Link>
              <Link to="/studio" className="hairline-card rounded-xl px-4 py-3 text-bark transition-colors hover:text-ink">Studio</Link>
              <a href="https://www.etsy.com/shop/RECMamaMade" target="_blank" rel="noreferrer" className="hairline-card rounded-xl px-4 py-3 text-bark transition-colors hover:text-ink">
                Etsy
              </a>
            </div>
          </div>
          <div className="mx-auto mt-10 w-[min(1180px,94vw)]">
            <div className="metal-line" />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[0.65rem] font-semibold tracking-[0.12em] text-subtle uppercase">
              <span>REC Mama Made</span>
              <span>Real assets · Real materials · Proof before production</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
