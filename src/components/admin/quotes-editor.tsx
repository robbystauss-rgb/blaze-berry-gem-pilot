import { useCallback, useEffect, useState } from "react";
import { Plus, Copy, FileText, ExternalLink, Trash2 } from "lucide-react";
import { getQuotes, quoteOwnerAction, saveEstimate } from "@/lib/commerce/quotes-api";
import {
  quoteTotals,
  type Estimate,
  type EstimateLine,
  type OwnerQuote,
  type PublicQuote,
  type QuoteRequest,
} from "@/lib/commerce/quote-schemas";
import { money, label } from "@/lib/commerce/types";
import { QuoteSummary } from "@/components/quotes/quote-summary";
import "./quotes.css";

type Props = { onOpenOrder?: (id: string) => void; onChange?: () => void | Promise<void> };
const future = () => new Date(Date.now() + 14 * 86_400_000).toISOString();
const newLine = (): EstimateLine => ({
  id: crypto.randomUUID(),
  kind: "product",
  title: "",
  quantity: 1,
  unitAmount: 0,
  specifications: "",
  productKey: "",
});
const empty = (): Estimate => ({
  title: "Custom project estimate",
  customerName: "",
  customerEmail: "",
  lines: [newLine()],
  shipping: 0,
  tax: 0,
  terms:
    "Payment is required before production. Artwork and product availability must be confirmed with REC Mama Made.",
  expiresAt: future(),
  privateNotes: "",
  availabilityConfirmed: false,
  totalsConfirmed: false,
});
const message = (e: unknown) =>
  e instanceof Error ? e.message : "The action could not be completed.";

export function QuotesEditor({ onOpenOrder, onChange }: Props) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getQuotes>> | null>(null),
    [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OwnerQuote | null>(null),
    [id, setId] = useState<string>(() => crypto.randomUUID()),
    [body, setBody] = useState<Estimate>(empty),
    [requestId, setRequestId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [preview, setPreview] = useState(false),
    [sharePath, setSharePath] = useState("");
  const refresh = useCallback(async () => {
    const next = await getQuotes({ data: search });
    setData(next);
    return next;
  }, [search]);
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getQuotes({ data: search })
      .then((next) => {
        if (mounted) {
          setData(next);
          setError("");
        }
      })
      .catch((e) => {
        if (mounted) setError(message(e));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [search]);
  const readonly = !!selected && selected.state !== "draft";
  const dirty = !!selected && JSON.stringify(body) !== JSON.stringify(selected.body);
  const totals = quoteTotals(body);
  function edit(row: OwnerQuote) {
    setSelected(row);
    setId(row.id);
    setBody(structuredClone(row.body));
    setRequestId(row.request_id ?? undefined);
    setSharePath("");
    setPreview(false);
    setError("");
    setSuccess("");
  }
  function start(source?: OwnerQuote | QuoteRequest) {
    setSelected(null);
    setId(crypto.randomUUID());
    setSharePath("");
    setPreview(false);
    setError("");
    setSuccess("");
    if (source && "body" in source) {
      setBody({
        ...structuredClone(source.body),
        expiresAt: future(),
        availabilityConfirmed: false,
        totalsConfirmed: false,
      });
      setRequestId(undefined);
    } else if (source) {
      setBody({
        ...empty(),
        customerName: source.name,
        customerEmail: source.email,
        title: source.company ? `${source.company} project` : "Custom project estimate",
        lines: [{ ...newLine(), quantity: source.quantity, specifications: source.details }],
      });
      setRequestId(source.id);
    } else {
      setBody(empty());
      setRequestId(undefined);
    }
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await saveEstimate({ data: { id, version: selected?.version ?? 0, body, requestId } });
      const next = await refresh(),
        row = next.quotes.find((q) => q.id === id);
      if (row) {
        setSelected(row);
        setBody(structuredClone(row.body));
      }
      setSuccess("Draft estimate saved. It is private until you create its review link.");
      await onChange?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "issue" | "revoke") {
    if (!selected || busy) return;
    if (action === "issue" && dirty) {
      setError("Save draft changes before creating its customer review link.");
      return;
    }
    const prompt =
      action === "revoke"
        ? "Withdraw this estimate and invalidate its customer review link? Existing history will be preserved."
        : selected.state === "issued"
          ? "Replace the private review link? The previous link will stop working. The estimate's items and total remain frozen."
          : `Issue this estimate for ${selected.body.customerEmail} at ${money(selected.total)}? The review link lets its recipient accept these exact terms and creates one unpaid order. No charge or email is sent.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await quoteOwnerAction({
        data: { id: selected.id, version: selected.version, action },
      });
      const next = await refresh();
      const updated = next.quotes.find((q) => q.id === selected.id) ?? null;
      setSelected(updated);
      if (updated) setBody(structuredClone(updated.body));
      setSharePath(result.path ?? "");
      setSuccess(
        action === "issue"
          ? "Private review link created. Copy it now and send it through your approved customer communication channel. Anyone with the link can review and respond."
          : "Estimate withdrawn; its review link no longer works.",
      );
      await onChange?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const previewQuote: PublicQuote = {
    number: selected?.number ?? 0,
    title: body.title,
    customerName: body.customerName,
    state: selected?.state ?? "draft",
    lines: body.lines,
    ...totals,
    shipping: body.shipping,
    tax: body.tax,
    terms: body.terms,
    expiresAt: body.expiresAt,
    expired: false,
    version: selected?.version ?? 0,
  };
  function lineChange(index: number, patch: Partial<EstimateLine>) {
    setBody((old) => ({
      ...old,
      lines: old.lines.map((line, n) => (n === index ? { ...line, ...patch } : line)),
    }));
  }
  return (
    <section className="cc-panel cc-quotes">
      <div className="cc-section-heading">
        <div>
          <h2>Quotes & bulk requests</h2>
          <p className="cc-help">
            Prepare a complete USD estimate, review its customer preview, and share a private link.
            Acceptance creates one unpaid order for the existing production and invoice workflow.
          </p>
        </div>
        <button type="button" className="cc-button" onClick={() => start()}>
          <Plus size={16} />
          New estimate
        </button>
      </div>
      <label className="cc-field">
        Find an estimate or request
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Customer, title or estimate number"
        />
      </label>
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="cc-success">
          {success}
        </p>
      )}
      {loading ? (
        <p role="status">Loading estimates…</p>
      ) : (
        <>
          {!!data?.requests.length && (
            <details className="cc-panel" open>
              <summary>Customer requests ({data.requests.length})</summary>
              <div className="cc-table-wrap">
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Project</th>
                      <th>Quantity</th>
                      <th>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requests.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Customer">
                          {r.name}
                          <br />
                          <small>{r.email}</small>
                        </td>
                        <td data-label="Project">
                          {r.company || "Custom project"}
                          <br />
                          <span className="cc-help">{r.details}</span>
                        </td>
                        <td data-label="Quantity">{r.quantity}</td>
                        <td data-label="Action">
                          <button
                            type="button"
                            className="cc-button secondary"
                            onClick={() => start(r)}
                          >
                            Prepare estimate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Estimate</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data?.quotes.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Estimate">
                      #{q.number} · {q.body.title}
                    </td>
                    <td data-label="Customer">{q.body.customerName}</td>
                    <td data-label="Status">
                      {label(q.state)}
                      {q.expired && q.state === "issued" ? " · expired" : ""}
                    </td>
                    <td data-label="Total">{money(q.total)}</td>
                    <td data-label="Action">
                      <button type="button" className="cc-button secondary" onClick={() => edit(q)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.quotes.length && (
              <p className="cc-help">
                No estimates yet. Start a draft or turn a customer request into an estimate.
              </p>
            )}
          </div>
          {!!data?.quotes.length && (
            <p className="cc-help">
              Showing up to 100 recent estimates. Search to narrow the list.
            </p>
          )}
        </>
      )}
      <hr />
      <div className="cc-section-heading">
        <h3>
          {selected
            ? `Estimate #${selected.number} · ${label(selected.state)}`
            : "New draft estimate"}
        </h3>
        <div className="cc-actions">
          <button
            type="button"
            className="cc-button secondary"
            onClick={() => setPreview((v) => !v)}
          >
            <FileText size={16} />
            {preview ? "Edit details" : "Customer preview"}
          </button>
          {selected && (
            <button type="button" className="cc-button secondary" onClick={() => start(selected)}>
              <Copy size={16} />
              Duplicate as draft
            </button>
          )}
        </div>
      </div>
      {preview ? (
        <QuoteSummary quote={previewQuote} />
      ) : (
        <form
          className="cc-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={busy || readonly}>
            <div className="cc-two-col">
              <label className="cc-field">
                Estimate title
                <input
                  required
                  maxLength={200}
                  value={body.title}
                  onChange={(e) => setBody({ ...body, title: e.target.value })}
                />
              </label>
              <label className="cc-field">
                Customer name
                <input
                  required
                  maxLength={120}
                  value={body.customerName}
                  onChange={(e) => setBody({ ...body, customerName: e.target.value })}
                />
              </label>
              <label className="cc-field">
                Customer email
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={body.customerEmail}
                  onChange={(e) => setBody({ ...body, customerEmail: e.target.value })}
                />
              </label>
              <label className="cc-field">
                Expires (your local time)
                <input
                  type="datetime-local"
                  required
                  value={new Date(
                    new Date(body.expiresAt).getTime() -
                      new Date(body.expiresAt).getTimezoneOffset() * 60_000,
                  )
                    .toISOString()
                    .slice(0, 16)}
                  onChange={(e) => {
                    if (e.target.value)
                      setBody({ ...body, expiresAt: new Date(e.target.value).toISOString() });
                  }}
                />
              </label>
            </div>
            <h4>Items & explicit service fees</h4>
            {body.lines.map((line, index) => (
              <div className="cc-panel" key={line.id}>
                <div className="cc-two-col">
                  <label className="cc-field">
                    Line {index + 1} title
                    <input
                      required
                      maxLength={200}
                      value={line.title}
                      onChange={(e) => lineChange(index, { title: e.target.value })}
                    />
                  </label>
                  <label className="cc-field">
                    Line type
                    <select
                      aria-label="Line type"
                      value={line.kind}
                      onChange={(e) =>
                        lineChange(index, {
                          kind: e.target.value as EstimateLine["kind"],
                          productKey: "",
                        })
                      }
                    >
                      {["product", "setup", "design", "service"].map((kind) => (
                        <option key={kind} value={kind}>
                          {label(kind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cc-field">
                    Quantity
                    <input
                      type="number"
                      required
                      min={1}
                      max={10000}
                      value={line.quantity}
                      onChange={(e) => lineChange(index, { quantity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="cc-field">
                    Unit price ($)
                    <input
                      type="number"
                      required
                      min={0}
                      max={100000}
                      step=".01"
                      value={line.unitAmount / 100}
                      onChange={(e) =>
                        lineChange(index, { unitAmount: Math.round(Number(e.target.value) * 100) })
                      }
                    />
                  </label>
                </div>
                <label className="cc-field">
                  Exact product / artwork / production instructions
                  <textarea
                    rows={3}
                    maxLength={4000}
                    value={line.specifications}
                    onChange={(e) => lineChange(index, { specifications: e.target.value })}
                  />
                </label>
                {line.kind === "product" && (
                  <label className="cc-field">
                    Tracked stock mapping
                    <select
                      aria-label="Tracked stock mapping"
                      value={line.productKey}
                      onChange={(e) => lineChange(index, { productKey: e.target.value })}
                    >
                      <option value="">No mapped stock — owner must confirm availability</option>
                      {data?.inventory.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.title} · {item.key}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="cc-actions">
                  <strong>{money(line.quantity * line.unitAmount)}</strong>
                  {body.lines.length > 1 && (
                    <button
                      type="button"
                      className="cc-button secondary"
                      onClick={() =>
                        setBody({ ...body, lines: body.lines.filter((_, n) => n !== index) })
                      }
                    >
                      <Trash2 size={16} />
                      Remove line {index + 1}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="cc-button secondary"
              disabled={body.lines.length >= 50}
              onClick={() => setBody({ ...body, lines: [...body.lines, newLine()] })}
            >
              <Plus size={16} />
              Add item or fee
            </button>
            <div className="cc-two-col">
              <label className="cc-field">
                Shipping ($)
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step=".01"
                  value={body.shipping / 100}
                  onChange={(e) =>
                    setBody({ ...body, shipping: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </label>
              <label className="cc-field">
                Tax ($)
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step=".01"
                  value={body.tax / 100}
                  onChange={(e) =>
                    setBody({ ...body, tax: Math.round(Number(e.target.value) * 100) })
                  }
                />
              </label>
            </div>
            <p className="cc-help">
              Enter reviewed shipping and tax amounts explicitly, including $0 where appropriate.
              This estimate does not calculate tax or promise delivery dates automatically.
            </p>
            <label className="cc-field">
              Customer-facing terms & production expectations
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={body.terms}
                onChange={(e) => setBody({ ...body, terms: e.target.value })}
              />
            </label>
            <label className="cc-field">
              Private shop notes
              <textarea
                rows={3}
                maxLength={4000}
                value={body.privateNotes}
                onChange={(e) => setBody({ ...body, privateNotes: e.target.value })}
              />
            </label>
            <label className="cc-field">
              <span>
                <input
                  type="checkbox"
                  checked={body.availabilityConfirmed}
                  onChange={(e) => setBody({ ...body, availabilityConfirmed: e.target.checked })}
                />{" "}
                I reviewed exact products, customization and availability. Mapped stock will be
                reserved only on acceptance.
              </span>
            </label>
            <label className="cc-field">
              <span>
                <input
                  type="checkbox"
                  checked={body.totalsConfirmed}
                  onChange={(e) => setBody({ ...body, totalsConfirmed: e.target.checked })}
                />{" "}
                Shipping, tax, quantities, fees, expiration and the full USD total are ready to
                honor.
              </span>
            </label>
          </fieldset>
          <p>
            <strong>Estimate total: {money(totals.total)}</strong>
          </p>
          {!readonly && (
            <button className="cc-button" disabled={busy || loading}>
              {busy ? "Saving…" : "Save private draft"}
            </button>
          )}
        </form>
      )}
      {selected && (
        <div className="cc-actions">
          {["draft", "issued"].includes(selected.state) && (
            <>
              <button
                type="button"
                className="cc-button"
                disabled={busy || dirty || selected.expired}
                onClick={() => void act("issue")}
              >
                {selected.state === "issued"
                  ? "Replace private review link"
                  : "Create private review link"}
              </button>
              <button
                type="button"
                className="cc-button secondary"
                disabled={busy}
                onClick={() => void act("revoke")}
              >
                Withdraw estimate
              </button>
            </>
          )}
          {selected.order_id && (
            <button
              type="button"
              className="cc-button"
              onClick={() =>
                onOpenOrder
                  ? onOpenOrder(selected.order_id!)
                  : window.location.assign(
                      `/admin?section=orders&orderId=${encodeURIComponent(selected.order_id!)}`,
                    )
              }
            >
              Open accepted order & invoice actions
            </button>
          )}
        </div>
      )}
      {sharePath && (
        <div className="cc-panel">
          <p className="cc-help">
            Private recipient link. Copy it now; only its hash is stored. Replacing the link
            invalidates the previous one.
          </p>
          <label className="cc-field">
            Review link
            <input
              readOnly
              value={typeof window !== "undefined" ? window.location.origin + sharePath : sharePath}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="cc-actions">
            <button
              type="button"
              className="cc-button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.origin + sharePath);
                  setSuccess("Private review link copied.");
                } catch {
                  setError("Select the review link and copy it from the field above.");
                }
              }}
            >
              <Copy size={16} />
              Copy private link
            </button>
            <a className="cc-button secondary" href={sharePath} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open customer review
            </a>
          </div>
        </div>
      )}
      {dirty && <p className="cc-help">Save changes before creating the customer review link.</p>}
    </section>
  );
}
