import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-stage-photo focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to content
      </a>
      <div className="border-b border-ink/10 text-center">
        <p className="mx-auto w-[min(1180px,94vw)] py-2 text-xs font-medium tracking-wide text-bark">
          Independent shop · Heat-adhesive patches · Hat + patch from $30 · Buy 12, get 1 free
        </p>
      </div>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex w-[min(1180px,94vw)] items-center justify-between gap-4 py-3">
          <Link to="/" className="min-w-0">
            <span className="block font-display text-[1.35rem] leading-none font-semibold text-ink">REC Mama Made</span>
            <span className="mt-1 block text-[0.68rem] font-medium tracking-[0.14em] text-bark uppercase">
              Custom leather patch hats
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {LINKS.map((link) => {
              const active = link.to === "/" ? pathname === "/" : pathname === link.to || pathname.startsWith(`${link.to}/`);
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  search={"search" in link ? link.search : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-2 text-sm font-medium text-bark",
                    active && "bg-pill text-ink",
                    !active && "hover:bg-pill/80",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/order" search={{ type: "hat" }} className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
              Build your hat
            </Link>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-full text-ink ring-1 ring-ink/15 md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-ink/10 px-[4vw] py-3 md:hidden" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {LINKS.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  search={"search" in link ? link.search : undefined}
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-medium text-ink hover:bg-pill"
                >
                  {link.label}
                </Link>
              ))}
              <Link to="/order" search={{ type: "hat" }} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 text-sm font-semibold text-primary">
                Build your hat
              </Link>
            </div>
          </nav>
        )}
      </header>
      <main id="main">{children}</main>
      {pathname !== "/order" && (
        <footer className="mt-8 border-t border-ink/10 py-10">
          <div className="mx-auto flex w-[min(1180px,94vw)] flex-wrap items-start justify-between gap-6">
            <div>
              <p className="font-display text-2xl text-ink">REC Mama Made</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-bark">
                Custom hats and heat-adhesive leatherette patches. We can laser holes. We don’t sew and we don’t thread.
                Hat + patch from $30 · Patch only from $5 · Buy 12, get 1 free.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-bark">
              <Link to="/actual-work" className="hover:text-ink">Work</Link>
              <Link to="/hats" className="hover:text-ink">Hats</Link>
              <Link to="/order" className="hover:text-ink">Build</Link>
              <Link to="/studio" className="hover:text-ink">Studio</Link>
              <a href="https://www.etsy.com/shop/RECMamaMade" target="_blank" rel="noreferrer" className="hover:text-ink">
                Etsy
              </a>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
