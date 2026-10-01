import { getLegalPolicy } from "@/lib/legal-policies";

export function PolicyPage({ slug }: { slug: string }) {
  const policy = getLegalPolicy(slug);

  if (!policy) {
    return (
      <section className="site-container page-top-space page-bottom-space">
        <p className="tech-label">LEGAL</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.04em] text-ink">Policy not found</h1>
      </section>
    );
  }

  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="max-w-3xl">
        <p className="tech-label">LEGAL / {policy.version}</p>
        <h1 className="mt-3 font-display text-[clamp(2.5rem,8vw,4.8rem)] font-bold leading-[0.98] tracking-[-0.05em] text-ink">{policy.name}</h1>
        <p className="mt-4 text-xs font-semibold leading-6 text-subtle">
          Version {policy.version} · Effective {policy.effectiveDate} · Last updated {policy.lastUpdated}
        </p>
        <p className="mt-6 max-w-[70ch] text-base leading-8 text-bark">{policy.intro}</p>

        <div className="mt-10 space-y-9">
          {policy.sections.map((section) => (
            <section key={section.heading} id={section.heading === "Contact" ? "contact" : undefined} className="scroll-mt-28">
              <h2 className="font-display text-2xl font-bold tracking-[-0.03em] text-ink">{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 max-w-[75ch] text-sm leading-7 text-bark sm:text-base">{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="mt-3 max-w-[75ch] list-disc space-y-2 pl-5 text-sm leading-7 text-bark sm:text-base">
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-border/80 pt-6 text-sm leading-7 text-bark">
          <p>
            Related policies: <a className="font-semibold text-primary underline underline-offset-4" href="/legal/terms">Terms</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/privacy">Privacy</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/custom-order">Custom orders</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/artwork">Artwork & IP</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/proof">Proof approval</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/shipping">Shipping</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/returns">Returns / remakes</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/dmca">Copyright / DMCA</a>{" · "}
            <a className="font-semibold text-primary underline underline-offset-4" href="/legal/trademark">Third-party brands</a>
          </p>
        </div>
      </div>
    </section>
  );
}
