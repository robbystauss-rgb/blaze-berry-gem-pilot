import { useState } from "react";
import { stripeHistoryAction } from "@/lib/commerce/api";
import { money } from "@/lib/commerce/types";

export function StripeHistory({
  refresh,
  open,
}: {
  refresh: () => Promise<unknown>;
  open: (id: string) => void;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof stripeHistoryAction>> | null>(
      null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [range, setRange] = useState({ from: "", to: "" });
  async function load(cursor?: string) {
    setBusy(true);
    setError("");
    try {
      setPreview(await stripeHistoryAction({ data: { action: "preview", ...range, cursor } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reconcile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="cc-panel">
      <summary>Reconcile historical Stripe checkout sales</summary>
      <p className="cc-help">
        Preview actual collected payments from the configured Stripe account. Imported records
        require historical fulfillment review. Original artwork and unavailable specifications are
        clearly marked. Importing does not change stock or send customer messages.
      </p>
      <form
        className="cc-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="cc-field">
          From (inclusive)
          <input
            type="date"
            required
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </label>
        <label className="cc-field">
          Until (exclusive)
          <input
            type="date"
            required
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </label>
        <button className="cc-button secondary" disabled={busy}>
          Preview processor records
        </button>
      </form>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      {preview?.preview && (
        <div className="cc-records">
          {preview.preview.rows.length === 0 ? (
            <p>No eligible collected checkout records in this page.</p>
          ) : (
            preview.preview.rows.map((row) => (
              <article key={row.id}>
                <b>
                  {row.customer} · {money(row.amount)}
                </b>
                <p>
                  {row.email} · {new Date(row.created).toLocaleString()}
                </p>
                <small>{row.id}</small>
                <details>
                  <summary>Review original provider metadata</summary>
                  <pre className="cc-json">{JSON.stringify(row.metadata, null, 2)}</pre>
                </details>
                <button
                  className="cc-button secondary"
                  disabled={busy || row.imported}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Import the verified Stripe sale ${row.id} for ${row.email || row.customer} (${money(row.amount)})? Existing specifications cannot be reconstructed beyond stored metadata. Review its actual fulfillment state afterwards.`,
                      )
                    )
                      return;
                    setBusy(true);
                    setError("");
                    try {
                      const result = await stripeHistoryAction({
                        data: { action: "import", reference: row.id },
                      });
                      await refresh();
                      if (result.order) open(result.order.id);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Unable to import.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {row.imported ? "Already linked" : "Review and import sale"}
                </button>
              </article>
            ))
          )}
          {preview.preview.hasMore && (
            <button
              className="cc-button secondary"
              disabled={busy}
              onClick={() => void load(preview.preview!.cursor ?? undefined)}
            >
              Next processor page
            </button>
          )}
        </div>
      )}
    </details>
  );
}
