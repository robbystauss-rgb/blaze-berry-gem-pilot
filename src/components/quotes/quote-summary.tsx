import type { PublicQuote } from "@/lib/commerce/quote-schemas";
import { money } from "@/lib/commerce/types";

export function QuoteSummary({ quote }: { quote: PublicQuote }) {
  return (
    <article className="rounded-3xl border border-border bg-white p-5 text-ink sm:p-8">
      <p className="tech-label">
        REC MAMA MADE · ESTIMATE {quote.number ? `#${quote.number}` : "PREVIEW"}
      </p>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">{quote.title}</h2>
      <p className="mt-3 text-bark">Prepared for {quote.customerName || "your customer"}</p>
      <p className="mt-2 text-sm text-stage-muted">
        USD · Valid until{" "}
        {new Date(quote.expiresAt).toLocaleString("en-US", {
          timeZone: "America/Chicago",
          timeZoneName: "short",
        })}
      </p>
      <div className="mt-6 divide-y divide-border">
        {quote.lines.map((line) => (
          <section key={line.id} className="py-4">
            <div className="flex flex-wrap justify-between gap-3">
              <h3 className="font-semibold">{line.title || "Item title"}</h3>
              <strong>{money(line.quantity * line.unitAmount)}</strong>
            </div>
            <p className="mt-1 text-sm text-stage-muted">
              {line.quantity} × {money(line.unitAmount)} · {line.kind}
            </p>
            {line.specifications && (
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-bark">
                {line.specifications}
              </p>
            )}
          </section>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-5 text-sm">
        <dt>Subtotal</dt>
        <dd className="text-right">{money(quote.subtotal)}</dd>
        <dt>Shipping (recorded by shop)</dt>
        <dd className="text-right">{money(quote.shipping)}</dd>
        <dt>Tax (recorded by shop)</dt>
        <dd className="text-right">{money(quote.tax)}</dd>
        <dt className="text-lg font-semibold">Total</dt>
        <dd className="text-right text-lg font-semibold">{money(quote.total)}</dd>
      </dl>
      <h3 className="mt-7 font-semibold">Terms & production details</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-bark">
        {quote.terms}
      </p>
      <p className="mt-5 text-sm leading-6 text-stage-muted">
        Accepting confirms this estimate and creates an unpaid order. The shop will provide its
        payment instructions or invoice. Payment must be verified before production; accepting this
        page does not charge you.
      </p>
    </article>
  );
}
