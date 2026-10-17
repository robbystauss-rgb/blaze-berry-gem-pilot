import { useState } from "react";
import { Download, Upload } from "lucide-react";
import {
  previewInventoryCsv,
  importInventoryCsv,
  exportInventoryCsv,
} from "@/lib/commerce/owner-api";
import { INVENTORY_CSV_TEMPLATE } from "@/lib/commerce/inventory-csv";
import type { InventoryImportPreview } from "@/lib/commerce/inventory-import.server";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Unable to process this inventory file.";
export function InventoryCsv({ onApplied }: { onApplied: (message: string) => Promise<void> }) {
  const [csv, setCsv] = useState(""),
    [reason, setReason] = useState(""),
    [preview, setPreview] = useState<InventoryImportPreview | null>(null),
    [requestId, setRequestId] = useState(() => crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const invalidate = () => {
    setPreview(null);
    setStatus("");
    setError("");
    setRequestId(crypto.randomUUID());
  };
  async function review() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setPreview(await previewInventoryCsv({ data: { csv, reason } }));
    } catch (e) {
      setPreview(null);
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (
      !preview ||
      preview.summary.errors ||
      !window.confirm(
        `Import verified counts for ${preview.summary.create + preview.summary.update} stock items? This records stock movements and an audit receipt. Existing order reservations remain protected.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await importInventoryCsv({
        data: { csv, reason, fingerprint: preview.fingerprint, requestId },
      });
      const done = `Import complete: ${result.create} created, ${result.update} updated, ${result.unchanged} unchanged.`;
      setStatus("");
      setPreview(null);
      await onApplied(done);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cc-panel cc-inventory-csv" aria-labelledby="inventory-csv-title">
      <div className="cc-panel-heading">
        <div>
          <h2 id="inventory-csv-title">Import verified stock counts</h2>
          <p className="cc-help">
            Preview every change before applying it. New items require a title, category and actual
            count.
          </p>
        </div>
        <div className="cc-actions">
          <button
            type="button"
            className="cc-button secondary"
            disabled={busy}
            onClick={() => download("inventory-template.csv", INVENTORY_CSV_TEMPLATE)}
          >
            <Download size={16} />
            Blank template
          </button>
          <button
            type="button"
            className="cc-button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = await exportInventoryCsv();
                download("inventory-counts.csv", result.csv);
                setStatus(
                  `${result.count} stock records exported. Edit counts and add your reference before importing.`,
                );
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={16} />
            Export editable counts
          </button>
        </div>
      </div>
      <details>
        <summary>How to prepare your CSV</summary>
        <p className="cc-help">
          Required columns: sku and on_hand. Counts are absolute whole units from 0 to 1,000,000.
          Optional title, category, threshold, incoming and reason columns use the template. A blank
          title, category, threshold or incoming value keeps the existing setting. Incoming stock
          never increases available units. Existing reserved and committed counts cannot be edited
          here. Up to 500 rows / 200 KB per import.
        </p>
      </details>
      <div className="cc-form-grid">
        <label className="cc-field">
          Choose inventory CSV
          <input
            aria-label="Choose inventory CSV"
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              invalidate();
              setCsv("");
              if (file.size > 200_000) {
                setError("Choose a CSV file up to 200 KB.");
                return;
              }
              try {
                setCsv(await file.text());
              } catch {
                setError("Could not read this file.");
              }
            }}
          />
        </label>
        <label className="cc-field">
          Count / supplier reference
          <input
            aria-label="Count / supplier reference"
            value={reason}
            minLength={5}
            maxLength={200}
            disabled={busy}
            placeholder="For example, physical count and date"
            onChange={(e) => {
              setReason(e.target.value);
              invalidate();
            }}
          />
        </label>
      </div>
      <label className="cc-field">
        CSV contents
        <textarea
          aria-label="CSV contents"
          value={csv}
          rows={5}
          maxLength={200_000}
          disabled={busy}
          spellCheck={false}
          placeholder={INVENTORY_CSV_TEMPLATE.trim()}
          onChange={(e) => {
            setCsv(e.target.value);
            invalidate();
          }}
        />
      </label>
      <div className="cc-actions">
        <button
          type="button"
          className="cc-button secondary"
          disabled={busy || !csv.trim() || reason.trim().length < 5}
          onClick={() => void review()}
        >
          <Upload size={16} />
          {busy ? "Processing…" : "Preview import"}
        </button>
      </div>
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="cc-success">
          {status}
        </p>
      )}
      {preview && (
        <div className="cc-tool-stack">
          <p role="status">
            {preview.summary.create} new · {preview.summary.update} changed ·{" "}
            {preview.summary.unchanged} unchanged · {preview.summary.errors} rows need correction
          </p>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Row / SKU</th>
                  <th>Change</th>
                  <th>On hand</th>
                  <th>Held for orders</th>
                  <th>Settings / validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line}>
                    <td data-label="Row / SKU">
                      <b>{r.sku || "Missing SKU"}</b>
                      <small>
                        CSV line {r.line} · {r.title}
                      </small>
                    </td>
                    <td data-label="Change">{r.action}</td>
                    <td data-label="On hand">
                      {r.before?.on_hand ?? "Uncounted"} → {r.onHand}
                    </td>
                    <td data-label="Held for orders">
                      {r.before
                        ? `${r.before.reserved} reserved / ${r.before.committed} committed`
                        : "No existing orders"}
                    </td>
                    <td data-label="Settings / validation">
                      {r.errors.length ? (
                        <ul className="cc-csv-errors">
                          {r.errors.map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                      ) : (
                        <>
                          <span>
                            Threshold {r.threshold} · incoming {r.incoming}
                          </span>
                          <small>{r.reason}</small>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="cc-button"
            disabled={
              busy || !!preview.summary.errors || !(preview.summary.create + preview.summary.update)
            }
            onClick={() => void apply()}
          >
            Confirm and import {preview.summary.create + preview.summary.update} changes
          </button>
          {preview.summary.errors > 0 && (
            <p className="cc-help">
              Nothing will be imported until every row is valid. Correct the file and preview again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
