import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { QuoteSummary } from "@/components/quotes/quote-summary";
import { answerPrivateQuote, getPrivateQuote } from "@/lib/commerce/quotes-api";
import { buttonVariants } from "@/components/ui/button";
import type { QuoteState } from "@/lib/commerce/quote-schemas";

export const Route = createFileRoute("/quote/$token")({
  loader: ({ params }) => getPrivateQuote({ data: params.token }),
  head: () => ({
    meta: [
      { title: "Private estimate · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PrivateQuotePage,
});

function PrivateQuotePage() {
  const quote = Route.useLoaderData();
  const { token } = Route.useParams();
  const [answer, setAnswer] = useState<QuoteState | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const state = answer ?? quote?.state;
  async function respond(action: "accept" | "decline") {
    if (!quote || busy) return;
    if (
      action === "decline" &&
      !window.confirm(
        "Decline this estimate? Contact the shop if you would like a revised version.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      setAnswer(
        (await answerPrivateQuote({ data: { token, version: quote.version, action } })).state,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your response could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="site-container page-top-space page-bottom-space max-w-3xl">
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">
        Your private estimate
      </h1>
      {!quote ? (
        <p role="status">
          This estimate link is unavailable. Ask the shop for its current review link.
        </p>
      ) : (
        <>
          <QuoteSummary quote={quote} />
          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-border p-4 text-bark">
              {error}
            </p>
          )}
          {state === "accepted" ? (
            <p role="status" className="mt-5 rounded-xl border border-border bg-white p-5">
              Estimate accepted. Your unpaid order is saved. The shop will follow up with payment
              instructions. No payment was collected on this page.
            </p>
          ) : state === "declined" ? (
            <p role="status" className="mt-5">
              Your response is saved. Contact the shop if you would like a revised estimate.
            </p>
          ) : quote.expired ? (
            <p role="status" className="mt-5">
              This estimate has expired. Contact the shop for an updated estimate.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              <label className="flex items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 size-5"
                />
                I have reviewed the items, total, expiration and terms above and want the shop to
                proceed with this order after payment is verified.
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  className={buttonVariants()}
                  disabled={busy || !confirmed}
                  onClick={() => void respond("accept")}
                >
                  {busy ? "Saving response…" : "Accept estimate"}
                </button>
                <button
                  className={buttonVariants({ variant: "outline" })}
                  disabled={busy}
                  onClick={() => void respond("decline")}
                >
                  Decline estimate
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
