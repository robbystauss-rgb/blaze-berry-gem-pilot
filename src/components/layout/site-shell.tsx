import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useStudio } from "@/lib/studio-store";
import { cn } from "@/lib/utils";
import { getPublishedContent } from "@/lib/commerce/public";
import { FeaturedProducts } from "./featured-products";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/actual-work", label: "Work" },
  { to: "/hats", label: "Hats" },
  { to: "/order", label: "Patches", search: { type: "patch" as const } },
] as const;

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    void getPublishedContent()
      .then(setContent)
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    void useStudio.persist.rehydrate();
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (pathname.startsWith("/admin")) return <>{children}</>;
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:text-ink focus:shadow-stage"
      >
        Skip to content
      </a>

      <div className="border-b border-border/70 bg-white/58 backdrop-blur-xl">
        <div className="site-container flex min-h-9 items-center justify-between gap-4 py-2 text-[0.64rem] font-bold tracking-[0.12em] uppercase sm:text-[0.66rem]">
          <div className="flex min-w-0 items-center gap-2 text-bark">
            <span className="status-dot" />
            <span className="truncate">
              {content.announcement || "Made to order · Proof before production"}
            </span>
          </div>
          <p className="hidden shrink-0 text-bark sm:block">
            Hat + patch from $30 · Patch only from $5 · Buy 12, get 1 free
          </p>
        </div>
      </div>

      <header className="sticky top-0 z-40 py-3">
        <div className="glass-nav site-container flex min-h-[64px] items-center justify-between gap-3 rounded-[22px] px-3 py-2.5 sm:gap-4 md:px-4">
          <Link
            to="/"
            className="group flex min-w-0 items-center gap-2.5 sm:gap-3"
            aria-label="REC Mama Made home"
          >
            <img
              src="/brand/rec-mama-made-louisiana-logo.jpeg"
              alt=""
              width={1536}
              height={1536}
              className="size-12 shrink-0 rounded-lg object-contain"
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-[0.98rem] leading-none font-bold tracking-[-0.025em] text-ink sm:text-[1.15rem]">
                REC Mama Made
              </span>
              <span className="mt-1 hidden truncate text-[0.57rem] font-extrabold tracking-[0.17em] text-bark uppercase min-[380px]:block">
                Custom hats + patches
              </span>
            </span>
          </Link>

          <nav
            className="hidden items-center rounded-full border border-border/80 bg-white/72 p-1 md:flex"
            aria-label="Main navigation"
          >
            {LINKS.map((link) => {
              const active =
                link.to === "/"
                  ? pathname === "/"
                  : pathname === link.to || pathname.startsWith(`${link.to}/`);
              return (
                <Link
                  key={link.label}
                  to={link.to}
                  search={"search" in link ? link.search : undefined}
                  className={cn(
                    "rounded-full px-4 py-2 text-xs font-bold tracking-[0.03em] transition-[background-color,color,box-shadow] duration-200",
                    active
                      ? "bg-pill text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.98)]"
                      : "text-bark hover:bg-pill/70 hover:text-ink",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/order"
              search={{ type: "hat" }}
              className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}
            >
              Build yours <ArrowUpRight className="size-3.5" />
            </Link>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-xl border border-border bg-white/88 text-ink shadow-[0_8px_22px_rgba(45,38,30,0.06)] md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {open && (
          <nav
            className="glass-nav site-container mt-2 rounded-[22px] p-2 md:hidden"
            aria-label="Mobile navigation"
          >
            <div className="flex flex-col gap-1">
              {LINKS.map((link) => (
                <Link
                  key={link.label}
                  to={link.to}
                  search={"search" in link ? link.search : undefined}
                  className="min-h-11 rounded-xl px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-pill/70"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/order"
                search={{ type: "hat" }}
                className="mt-1 flex min-h-11 items-center justify-between rounded-xl border border-ink bg-ink px-4 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(29,29,31,0.14)]"
              >
                Build your hat <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="main">
        {pathname === "/" && content.homepage_intro && (
          <div className="site-container py-6 text-sm leading-7 whitespace-pre-wrap">
            {content.homepage_intro}
          </div>
        )}
        {children}
        {pathname === "/" && content.featured_product_ids && (
          <FeaturedProducts ids={content.featured_product_ids} />
        )}
      </main>

      {pathname !== "/order" && (
        <footer className="mt-20 border-t border-border/80 bg-white/52 py-14 backdrop-blur-xl sm:mt-24 sm:py-16">
          <div className="site-container grid gap-10 lg:grid-cols-[1.25fr_0.75fr] lg:gap-16">
            <div>
              <Link to="/" aria-label="REC Mama Made home" className="inline-flex">
                <img
                  src="/brand/rec-mama-made-louisiana-logo.jpeg"
                  alt="REC Mama Made Louisiana wildflower logo"
                  width={1536}
                  height={1536}
                  loading="lazy"
                  className="mb-6 h-auto w-36 rounded-xl"
                />
              </Link>
              <div className="flex items-center gap-2">
                <span className="status-dot" />
                <span className="tech-label">REC Mama Made</span>
              </div>
              <p className="mt-4 font-display text-3xl font-bold tracking-[-0.04em] text-ink sm:text-4xl">
                Custom work, made personal.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-bark sm:text-base">
                Custom Richardson hats and heat-adhesive leatherette patches with real product
                photography, live customization preview, and a proof before production. Laser holes
                are available; sewing and thread are not offered.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-6 text-sm">
              <div>
                <p className="tech-label">Explore</p>
                <div className="mt-3 flex flex-col gap-1">
                  <Link
                    to="/actual-work"
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Actual work
                  </Link>
                  <Link
                    to="/hats"
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Hat catalog
                  </Link>
                  <Link
                    to="/shop"
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Shop merchandise
                  </Link>
                  <Link
                    to="/info"
                    search={{ page: "contact" }}
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Contact
                  </Link>
                </div>
              </div>
              <div>
                <p className="tech-label">Create</p>
                <div className="mt-3 flex flex-col gap-1">
                  <Link
                    to="/order"
                    search={{ type: "hat" }}
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Build a hat
                  </Link>
                  <Link
                    to="/order"
                    search={{ type: "patch" }}
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Patch only
                  </Link>
                  <Link
                    to="/login"
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Account sign in
                  </Link>
                  <Link
                    to="/info"
                    search={{ page: "shipping_policy" }}
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Shipping policy
                  </Link>
                  <Link
                    to="/info"
                    search={{ page: "refund_policy" }}
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Refund policy
                  </Link>
                  <Link
                    to="/info"
                    search={{ page: "privacy_policy" }}
                    className="flex min-h-11 items-center text-bark transition-colors hover:text-ink"
                  >
                    Privacy policy
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="site-container mt-10">
            <div className="metal-line" />
            <div className="mt-4 flex flex-col gap-2 text-[0.63rem] font-semibold tracking-[0.12em] text-subtle uppercase sm:flex-row sm:items-center sm:justify-between">
              <span>REC Mama Made</span>
              <span>Real assets · Real materials · Proof before production</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
