import { useState, useEffect, useCallback } from "react";
import {
  getStudioDocuments,
  saveStudioDocument,
  studioOwnerAction,
  getStudioDetail,
  getStudioOrder,
  uploadStudioPhoto,
  emailStudioDocument,
  refreshDocumentDelivery,
} from "@/lib/commerce/studio-api";
import type { StudioRow, InvoiceBody, ProofBody } from "@/lib/commerce/studio-schemas";
import { money, label } from "@/lib/commerce/types";
import { StudioTextActions } from "./studio-text-actions";
type Data = Awaited<ReturnType<typeof getStudioDocuments>>;
type Detail = Awaited<ReturnType<typeof getStudioDetail>>;
const emptyInvoice = (): InvoiceBody => ({
  customerName: "",
  customerEmail: "",
  billingAddress: "",
  shippingAddress: "",
  lines: [
    {
      id: crypto.randomUUID(),
      kind: "product",
      title: "",
      quantity: 1,
      unitAmount: 0,
      specifications: "",
      productKey: "",
    },
  ],
  shipping: 0,
  tax: 0,
  discount: 0,
  dueDate: "",
  terms: "",
  notes: "",
  totalsConfirmed: false,
  availabilityConfirmed: false,
  requiresProof: false,
});
const emptyProof = (): ProofBody => ({
  title: "",
  notes: "",
  details: [],
  mediaIds: [],
  expiresAt: "",
});
const editableProof = (body: ProofBody): ProofBody => ({
  title: body.title,
  notes: body.notes,
  details: body.details,
  mediaIds: body.mediaIds,
  expiresAt: body.expiresAt,
});
export function StudioDocuments({
  kind,
  initialOrderId,
}: {
  kind: "invoice" | "proof";
  initialOrderId?: string;
}) {
  const [data, setData] = useState<Data | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [id, setId] = useState<string>(() => crypto.randomUUID()),
    [version, setVersion] = useState(0),
    [orderId, setOrderId] = useState<string | null>(null),
    [invoice, setInvoice] = useState<InvoiceBody>(emptyInvoice),
    [proof, setProof] = useState<ProofBody>(emptyProof),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [path, setPath] = useState(""),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const selected = detail?.document,
    locked = !!selected && selected.state !== "draft";
  const displayStatus = (d: StudioRow) => {
    if (d.kind !== "invoice" || d.state !== "issued") return d.state;
    if (d.provider_state === "void") return "void";
    const order = data?.orders.find((o) => o.id === d.order_id);
    if (order && order.payment_status !== "unpaid") return order.payment_status;
    return (d.body as InvoiceBody).dueDate <
      new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })
      ? "overdue"
      : "unpaid";
  };
  const reload = useCallback(async () => {
    setData(await getStudioDocuments({ data: kind }));
  }, [kind]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const select = useCallback(
    async (candidate: Pick<StudioRow, "id">) => {
      const result = await getStudioDetail({ data: candidate.id });
      const d = result.document;
      setDetail(result);
      setId(d.id);
      setVersion(d.version);
      setOrderId(d.order_id);
      setPath("");
      setRequestId(crypto.randomUUID());
      if (kind === "invoice") setInvoice(d.body as InvoiceBody);
      else setProof(editableProof(d.body as ProofBody));
    },
    [kind],
  );
  const chooseOrder = useCallback(
    async (value: string) => {
      setOrderId(value || null);
      if (!value || kind !== "invoice") return;
      const result = await getStudioOrder({ data: value });
      if (result.existingId) {
        await select({ id: result.existingId });
        return;
      }
      setInvoice((v) => ({
        ...v,
        customerName: result.order.customer_name,
        customerEmail: result.order.customer_email,
        shipping: result.order.shipping,
        tax: result.order.tax,
        discount: result.order.discount,
        lines: result.items.map((i) => ({
          id: i.id,
          kind: "product",
          title: i.title,
          quantity: i.quantity,
          unitAmount: i.unit_amount,
          productKey: "",
          specifications: i.specifications.instructions ?? "Recorded order customization",
        })),
      }));
    },
    [kind, select],
  );
  useEffect(() => {
    setDetail(null);
    setVersion(0);
    setId(crypto.randomUUID());
    setPath("");
    setInvoice(emptyInvoice());
    setProof(emptyProof());
    setOrderId(null);
    void reload()
      .then(() => (initialOrderId ? chooseOrder(initialOrderId) : undefined))
      .catch((e) => setError(e.message));
  }, [initialOrderId, reload, chooseOrder]);
  function newDraft(previous?: StudioRow) {
    setId(crypto.randomUUID());
    setVersion(0);
    setDetail(null);
    setPath("");
    setRequestId(crypto.randomUUID());
    setOrderId(previous?.order_id ?? null);
    if (kind === "invoice") setInvoice(previous ? (previous.body as InvoiceBody) : emptyInvoice());
    else
      setProof(
        previous ? { ...editableProof(previous.body as ProofBody), expiresAt: "" } : emptyProof(),
      );
  }
  async function save() {
    const result = await saveStudioDocument({
      data:
        kind === "invoice"
          ? { kind, id, version, orderId, body: invoice }
          : { kind, id, version, orderId: orderId!, body: proof },
    });
    await reload();
    const fresh = await getStudioDetail({ data: result.id });
    setDetail(fresh);
    setVersion(result.version);
    if (kind === "invoice") setInvoice(fresh.document.body as InvoiceBody);
    setNotice("Draft saved. Preview the customer document and PDF before issuing.");
  }
  async function action(action: "issue" | "rotate" | "withdraw" | "void" | "prepare_payment") {
    if (
      action !== "prepare_payment" &&
      !confirm(
        action === "issue"
          ? "Freeze and issue this document? Invoice amounts and proof version images will be preserved. This does not send an email."
          : action === "rotate"
            ? "Replace the private customer link? Older links will stop working."
            : "Confirm this action? History is preserved.",
      )
    )
      return;
    const result = await studioOwnerAction({ data: { id, version, action } });
    if (result.path) setPath(result.path);
    await reload();
    const fresh = await getStudioDetail({ data: id });
    setDetail(fresh);
    setVersion(fresh.document.version);
    setNotice(
      action === "prepare_payment"
        ? "Provider payment link prepared. No payment was recorded."
        : action === "issue"
          ? "Document issued. Review it, prepare invoice payment if applicable, then send the separate email."
          : "Action saved.",
    );
  }
  const field = (
    title: string,
    value: string,
    set: (v: string) => void,
    type = "text",
    required = false,
  ) => (
    <label className="cc-field">
      {title}
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        type={type}
        required={required}
        disabled={locked}
      />
    </label>
  );
  if (!data)
    return (
      <div className="cc-panel">
        <p role={error ? "alert" : "status"}>{error || "Loading documents…"}</p>
      </div>
    );
  const visible = data.documents.filter((d) => {
    const b = d.body as InvoiceBody;
    return (
      `${d.number} ${b.customerName ?? ""} ${b.customerEmail ?? ""} ${(d.body as ProofBody).title ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!filter || displayStatus(d) === filter) &&
      (!from ||
        new Date(d.created_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) >=
          from) &&
      (!through ||
        new Date(d.created_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) <=
          through)
    );
  });
  return (
    <div className="cc-studio-workspace">
      <div className="cc-panel">
        <div className="cc-panel-heading">
          <div>
            <h2>{kind === "invoice" ? "Signature Studio Invoices" : "Design Proofs"}</h2>
            <p>
              {kind === "invoice"
                ? "Itemized invoices and secure Stripe payment. Proofs remain separate."
                : "Versioned private proofs, independent customer responses and production holds."}
            </p>
          </div>
          <button className="cc-button" onClick={() => newDraft()}>
            Create {kind === "invoice" ? "invoice" : "proof"}
          </button>
        </div>
        <div className="cc-filters">
          <label className="cc-field">
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Number or customer"
            />
          </label>
          <label className="cc-field">
            Status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">All document states</option>
              {(kind === "invoice"
                ? [
                    "draft",
                    "unpaid",
                    "overdue",
                    "partially_paid",
                    "paid",
                    "refunded",
                    "partially_refunded",
                    "failed",
                    "void",
                  ]
                : [
                    "draft",
                    "awaiting_approval",
                    "changes_requested",
                    "approved",
                    "superseded",
                    "withdrawn",
                  ]
              ).map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="cc-field">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="cc-field">
            Through
            <input type="date" value={through} onChange={(e) => setThrough(e.target.value)} />
          </label>
        </div>
        {visible.length === 0 ? (
          <p>No matching documents. Create a draft to begin.</p>
        ) : (
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>{kind === "invoice" ? "Amount / due" : "Proof version"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Document">
                      <button className="cc-link" onClick={() => void task(() => select(d))}>
                        {kind === "invoice" ? "INV" : "P"}-{String(d.number).padStart(5, "0")}
                      </button>
                    </td>
                    <td data-label="Customer">{(d.body as InvoiceBody).customerName}</td>
                    <td data-label="Status">{label(displayStatus(d))}</td>
                    <td data-label={kind === "invoice" ? "Amount / due" : "Proof version"}>
                      {kind === "invoice" ? (
                        <>
                          {money(d.total)} · {(d.body as InvoiceBody).dueDate}
                        </>
                      ) : (
                        d.proof_version
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="cc-panel">
        <h2>
          {selected
            ? `${kind === "invoice" ? "Invoice" : "Proof"} #${selected.number}`
            : `New ${kind} draft`}
        </h2>
        <p>
          {locked
            ? "Issued contents are frozen. Use a new proof version or void/replacement invoice for changes."
            : "Save the draft before opening its customer preview or PDF."}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void task(save);
          }}
        >
          <fieldset disabled={busy || locked} style={{ border: 0, padding: 0 }}>
            <label className="cc-field">
              {kind === "invoice" ? "Existing order (optional)" : "Order (required)"}
              <select
                value={orderId ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  void task(() => chooseOrder(value));
                }}
                required={kind === "proof"}
              >
                <option value="">
                  {kind === "invoice"
                    ? "Custom invoice - enter customer and items"
                    : "Choose an order"}
                </option>
                {data.orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.number} · {o.customer_name} · {o.stage}
                  </option>
                ))}
              </select>
            </label>
            {kind === "invoice" ? (
              <>
                <div className="cc-form-grid">
                  {field(
                    "Customer name",
                    invoice.customerName,
                    (v) => setInvoice({ ...invoice, customerName: v }),
                    "text",
                    true,
                  )}
                  {field(
                    "Customer email",
                    invoice.customerEmail,
                    (v) => setInvoice({ ...invoice, customerEmail: v }),
                    "email",
                    true,
                  )}
                  {field(
                    "Due date (America/Chicago)",
                    invoice.dueDate,
                    (v) => setInvoice({ ...invoice, dueDate: v }),
                    "date",
                    true,
                  )}
                  {field("Billing address (if supplied)", invoice.billingAddress, (v) =>
                    setInvoice({ ...invoice, billingAddress: v }),
                  )}
                  {field("Shipping address (if supplied)", invoice.shippingAddress, (v) =>
                    setInvoice({ ...invoice, shippingAddress: v }),
                  )}
                </div>
                {orderId && (
                  <p>
                    Recorded order items and amounts are authoritative and cannot be changed here.
                  </p>
                )}
                <fieldset disabled={!!orderId || locked} style={{ border: 0, padding: 0 }}>
                  {invoice.lines.map((l, i) => (
                    <div className="cc-panel" key={l.id}>
                      <div className="cc-form-grid">
                        <label className="cc-field">
                          Item / service
                          <input
                            value={l.title}
                            required
                            onChange={(e) =>
                              setInvoice({
                                ...invoice,
                                lines: invoice.lines.map((x, j) =>
                                  j === i ? { ...x, title: e.target.value } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="cc-field">
                          Quantity
                          <input
                            type="number"
                            min={1}
                            max={10000}
                            value={l.quantity}
                            onChange={(e) =>
                              setInvoice({
                                ...invoice,
                                lines: invoice.lines.map((x, j) =>
                                  j === i ? { ...x, quantity: Number(e.target.value) } : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="cc-field">
                          Unit price (USD)
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={(l.unitAmount / 100).toFixed(2)}
                            onChange={(e) =>
                              setInvoice({
                                ...invoice,
                                lines: invoice.lines.map((x, j) =>
                                  j === i
                                    ? { ...x, unitAmount: Math.round(Number(e.target.value) * 100) }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="cc-field">
                        Customization description
                        <textarea
                          value={l.specifications}
                          maxLength={4000}
                          onChange={(e) =>
                            setInvoice({
                              ...invoice,
                              lines: invoice.lines.map((x, j) =>
                                j === i ? { ...x, specifications: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                      {invoice.lines.length > 1 && (
                        <button
                          type="button"
                          className="cc-button secondary"
                          onClick={() =>
                            setInvoice({
                              ...invoice,
                              lines: invoice.lines.filter((_, j) => j !== i),
                            })
                          }
                        >
                          Remove item
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="cc-button secondary"
                    onClick={() =>
                      setInvoice({ ...invoice, lines: [...invoice.lines, ...emptyInvoice().lines] })
                    }
                  >
                    Add line item
                  </button>
                  <div className="cc-form-grid">
                    {(
                      [
                        ["Shipping", "shipping"],
                        ["Tax (explicit recorded amount)", "tax"],
                        ["Discount", "discount"],
                      ] as const
                    ).map(([title, key]) => (
                      <label className="cc-field" key={key}>
                        {title} (USD)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={(invoice[key] / 100).toFixed(2)}
                          onChange={(e) =>
                            setInvoice({
                              ...invoice,
                              [key]: Math.round(Number(e.target.value) * 100),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="cc-field">
                  Payment terms (owner-supplied)
                  <textarea
                    value={invoice.terms}
                    maxLength={4000}
                    onChange={(e) => setInvoice({ ...invoice, terms: e.target.value })}
                  />
                </label>
                <label className="cc-field">
                  Customer-visible note
                  <textarea
                    value={invoice.notes}
                    maxLength={4000}
                    onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
                  />
                </label>
                <label className="cc-check">
                  <input
                    type="checkbox"
                    checked={invoice.requiresProof ?? false}
                    onChange={(e) => setInvoice({ ...invoice, requiresProof: e.target.checked })}
                  />
                  This order requires separate artwork approval before production.
                </label>
                <label className="cc-check">
                  <input
                    type="checkbox"
                    checked={invoice.totalsConfirmed}
                    onChange={(e) => setInvoice({ ...invoice, totalsConfirmed: e.target.checked })}
                  />
                  I reviewed the complete price, discount, shipping and tax amounts.
                </label>
                <label className="cc-check">
                  <input
                    type="checkbox"
                    checked={invoice.availabilityConfirmed}
                    onChange={(e) =>
                      setInvoice({ ...invoice, availabilityConfirmed: e.target.checked })
                    }
                  />
                  I confirmed availability for the offered items.
                </label>
              </>
            ) : (
              <>
                {field(
                  "Proof title",
                  proof.title,
                  (v) => setProof({ ...proof, title: v }),
                  "text",
                  true,
                )}
                <label className="cc-field">
                  Link expiration (your local time)
                  <input
                    type="datetime-local"
                    required
                    value={
                      proof.expiresAt
                        ? new Date(
                            new Date(proof.expiresAt).getTime() -
                              new Date(proof.expiresAt).getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setProof({
                        ...proof,
                        expiresAt: e.target.value ? new Date(e.target.value).toISOString() : "",
                      })
                    }
                  />
                </label>
                <label className="cc-field">
                  Upload actual proof images (PNG/JPG/WebP; 3 MB each)
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      void task(async () => {
                        const ids: string[] = [];
                        for (const f of files) {
                          if (f.size > 3_000_000)
                            throw Error("Proof images must be at most 3 MB each.");
                          const image = await new Promise<string>((resolve, reject) => {
                            const r = new FileReader();
                            r.onload = () => resolve(String(r.result));
                            r.onerror = () => reject(Error("Could not read image."));
                            r.readAsDataURL(f);
                          });
                          const result = await uploadStudioPhoto({
                            data: { name: f.name, data: image, alt: proof.title || f.name },
                          });
                          ids.push(result.id);
                        }
                        await reload();
                        setProof((v) => ({
                          ...v,
                          mediaIds: [...new Set([...v.mediaIds, ...ids])].slice(0, 6),
                        }));
                      });
                    }}
                  />
                </label>
                <label className="cc-field">
                  Select / order up to six private media images
                  <select
                    multiple
                    size={6}
                    value={proof.mediaIds}
                    onChange={(e) =>
                      setProof({
                        ...proof,
                        mediaIds: Array.from(e.target.selectedOptions, (x) => x.value).slice(0, 6),
                      })
                    }
                  >
                    {data.media.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="studio-owner-thumbnails">
                  {proof.mediaIds.map((mediaId, i) => (
                    <div key={mediaId}>
                      <img
                        style={{ width: 140, height: 110, objectFit: "contain" }}
                        src={`/api/media/${mediaId}?thumbnail=1`}
                        alt={`Selected proof image ${i + 1}`}
                      />
                      <button
                        type="button"
                        className="cc-link"
                        onClick={() => {
                          const ids = [...proof.mediaIds];
                          if (i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          setProof({ ...proof, mediaIds: ids });
                        }}
                      >
                        Move earlier
                      </button>
                    </div>
                  ))}
                </div>
                {proof.details.map((x, i) => (
                  <div className="cc-form-grid" key={i}>
                    {field("Specification label", x.label, (v) =>
                      setProof({
                        ...proof,
                        details: proof.details.map((d, j) => (i === j ? { ...d, label: v } : d)),
                      }),
                    )}
                    {field("Value / physical dimensions", x.value, (v) =>
                      setProof({
                        ...proof,
                        details: proof.details.map((d, j) => (i === j ? { ...d, value: v } : d)),
                      }),
                    )}
                    <button
                      type="button"
                      className="cc-button secondary"
                      onClick={() =>
                        setProof({ ...proof, details: proof.details.filter((_, j) => i !== j) })
                      }
                    >
                      Remove detail
                    </button>
                  </div>
                ))}
                <button
                  className="cc-button secondary"
                  type="button"
                  onClick={() =>
                    setProof({ ...proof, details: [...proof.details, { label: "", value: "" }] })
                  }
                >
                  Add design detail
                </button>
                <label className="cc-field">
                  Customer-visible proof notes
                  <textarea
                    value={proof.notes}
                    maxLength={4000}
                    onChange={(e) => setProof({ ...proof, notes: e.target.value })}
                  />
                </label>
                <p>
                  Creating a proof requires approval for this order. Only the latest issued approved
                  version can release its artwork hold. Payment remains separate.
                </p>
              </>
            )}
          </fieldset>
          {!locked && (
            <button className="cc-button" disabled={busy} type="submit">
              Save Draft
            </button>
          )}
        </form>
        {selected && (
          <>
            <div className="cc-actions">
              <a
                className="cc-button secondary"
                href={`/studio-preview/${id}`}
                target="_blank"
                rel="noreferrer"
              >
                Preview customer document
              </a>
              <a className="cc-button secondary" href={`/api/studio-file/${id}`}>
                Download PDF
              </a>
              {selected.state === "draft" ? (
                <button
                  className="cc-button"
                  disabled={busy}
                  onClick={() => void task(() => action("issue"))}
                >
                  Issue {kind === "invoice" ? "Invoice" : "Proof"}
                </button>
              ) : (
                <>
                  {!["void", "withdrawn", "superseded"].includes(selected.state) && (
                    <button
                      className="cc-button secondary"
                      disabled={busy}
                      onClick={() => void task(() => action("rotate"))}
                    >
                      Create / replace private link
                    </button>
                  )}
                  {kind === "invoice" && selected.state === "issued" && (
                    <>
                      <button
                        className="cc-button"
                        disabled={busy}
                        onClick={() => void task(() => action("prepare_payment"))}
                      >
                        Prepare Stripe payment
                      </button>
                      <button
                        className="cc-button secondary"
                        disabled={busy}
                        onClick={() => void task(() => action("void"))}
                      >
                        Void unpaid invoice
                      </button>
                    </>
                  )}
                  {kind === "proof" && (
                    <>
                      <button
                        className="cc-button"
                        disabled={busy}
                        onClick={() => newDraft(selected)}
                      >
                        Create revised version
                      </button>
                      {!["withdrawn", "superseded"].includes(selected.state) && (
                        <button
                          className="cc-button secondary"
                          disabled={busy}
                          onClick={() => void task(() => action("withdraw"))}
                        >
                          Withdraw proof
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            {!path && (
              <StudioTextActions
                key={id}
                id={id}
                kind={kind}
                path={path}
                contact={detail.contact}
                onSaved={(contact) =>
                  setDetail((current) => (current ? { ...current, contact } : current))
                }
              />
            )}
            {path && (
              <div className="cc-panel">
                <label className="cc-field">
                  Private customer link
                  <input readOnly value={new URL(path, window.location.origin).href} />
                </label>
                <StudioTextActions
                  id={id}
                  kind={kind}
                  path={path}
                  contact={detail.contact}
                  onSaved={(contact) =>
                    setDetail((current) => (current ? { ...current, contact } : current))
                  }
                >
                  <button
                    className="cc-button secondary"
                    onClick={() =>
                      void task(async () => {
                        await navigator.clipboard.writeText(
                          new URL(path, window.location.origin).href,
                        );
                        setNotice("Private link copied.");
                      })
                    }
                  >
                    Copy secure link
                  </button>
                  <a href={path} className="cc-button secondary" target="_blank" rel="noreferrer">
                    Open issued document
                  </a>
                  <button
                    className="cc-button"
                    disabled={busy}
                    onClick={() =>
                      void task(async () => {
                        if (
                          !confirm(
                            `Send this separate ${kind} email to ${(selected.body as InvoiceBody).customerEmail}?`,
                          )
                        )
                          return;
                        const result = await emailStudioDocument({ data: { id, path, requestId } });
                        setNotice(
                          `Email ${result.state}. Provider acceptance does not confirm delivery.`,
                        );
                        setDetail(await getStudioDetail({ data: id }));
                      })
                    }
                  >
                    Send separate {kind} email
                  </button>
                </StudioTextActions>
                <p>
                  Reuse the same send request after an uncertain response. For an intentional resend
                  after acceptance, create a new request below.
                </p>
                <button
                  className="cc-button secondary"
                  onClick={() => {
                    if (confirm("Start an intentional new email delivery request?")) {
                      setRequestId(crypto.randomUUID());
                      setNotice("New delivery request prepared. Review recipient, then send.");
                    }
                  }}
                >
                  Prepare intentional resend
                </button>
              </div>
            )}
            {selected.response && (
              <div className="cc-panel">
                <h3>Customer response · version {selected.proof_version}</h3>
                <p>
                  {selected.response.name} · {label(selected.response.action)} ·{" "}
                  {selected.responded_at ? new Date(selected.responded_at).toLocaleString() : ""}
                </p>
                <p style={{ whiteSpace: "pre-wrap" }}>{selected.response.message}</p>
              </div>
            )}
            <div className="cc-panel">
              {detail.financial && (
                <>
                  <h3>Order and payment record</h3>
                  <p>
                    <a
                      className="cc-link"
                      href={`/admin?section=orders&orderId=${detail.financial.id}`}
                    >
                      Open order {detail.financial.id.slice(0, 8)}
                    </a>{" "}
                    · {label(detail.financial.payment_status)} ·{" "}
                    {label(detail.financial.proof_status ?? "not_required")}
                  </p>
                  <p>
                    Received {money(detail.financial.paid)} · Refunded{" "}
                    {money(detail.financial.refunded)} · Remaining{" "}
                    {money(
                      Math.max(
                        0,
                        detail.financial.total - detail.financial.paid + detail.financial.refunded,
                      ),
                    )}
                  </p>
                  {detail.payments.map((p, i) => (
                    <p key={i}>
                      {label(p.kind)} · {money(p.amount)} ·{" "}
                      {new Date(p.occurred_at).toLocaleString()}
                    </p>
                  ))}
                </>
              )}
              <h3>Document history</h3>
              {detail.audit.map((a, i) => (
                <p key={i}>
                  {label(a.action)} · {new Date(a.created_at).toLocaleString()} · {a.actor_id}
                </p>
              ))}
            </div>
            <div className="cc-panel">
              <h3>Email delivery history</h3>
              {detail.emails.length === 0 ? (
                <p>No document emails submitted.</p>
              ) : (
                detail.emails.map((e) => (
                  <div key={e.id}>
                    <p>
                      {label(e.state)} · {new Date(e.created_at).toLocaleString()} · {e.attempts}{" "}
                      attempt(s)
                    </p>
                    {e.last_error && <p role="alert">{e.last_error}</p>}
                    {e.provider_id && (
                      <button
                        className="cc-link"
                        onClick={() =>
                          void task(async () => {
                            await refreshDocumentDelivery({ data: e.id });
                            setDetail(await getStudioDetail({ data: id }));
                            setNotice("Delivery status refreshed from the provider.");
                          })
                        }
                      >
                        Check provider delivery
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
        {error && (
          <p className="cc-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="cc-success" role="status">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
