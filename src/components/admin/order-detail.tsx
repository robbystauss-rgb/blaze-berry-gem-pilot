import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Printer, Download } from "lucide-react";
import {
  getOrderDetail,
  mutateAdmin,
  invoiceAction,
  refundAction,
  getMerchantAccess,
} from "@/lib/commerce/api";
import { STAGES, label, money } from "@/lib/commerce/types";
import { Badge, Field } from "./command-center";
import { getBearerToken } from "@/lib/auth/client";
const msg = (e: unknown) => (e instanceof Error ? e.message : "Unable to save changes.");
export function OrderDetail({
  id,
  access,
  close,
  onChange,
}: {
  id: string;
  access: Awaited<ReturnType<typeof getMerchantAccess>>;
  close: () => void;
  onChange: () => Promise<unknown>;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getOrderDetail>> | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [refund, setRefund] = useState(false);
  const [refundRequest, setRefundRequest] = useState(() => crypto.randomUUID());
  const [printMode, setPrintMode] = useState<"summary" | "packing">("summary");
  const refresh = useCallback(
    () =>
      getOrderDetail({ data: id })
        .then(setData)
        .catch((e) => setError(msg(e))),
    [id],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function save(
    action: "order.update" | "order.note" | "payment.manual",
    payload: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    try {
      await mutateAdmin({ data: { action, payload } });
      setSuccess("Order updated.");
      await refresh();
      await onChange();
      return true;
    } catch (e) {
      setError(msg(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function invoice(action: "create" | "send" | "resend") {
    if (
      action !== "create" &&
      !window.confirm(
        `Review recipient ${data?.order.customer_email} and total ${money(data?.order.total ?? 0)}. ${action === "resend" ? "Resend" : "Send"} this REC Mama Made invoice?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await invoiceAction({ data: { orderId: id, action } });
      setSuccess(
        result.testMode
          ? "Test invoice action accepted. Stripe does not send customer email in test mode."
          : "Invoice action submitted to Stripe. Email delivery is not confirmed.",
      );
      await refresh();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }
  async function downloadArtwork(itemId: string) {
    setError("");
    try {
      const token = getBearerToken();
      const response = await fetch("/api/artwork/" + itemId, {
        headers: token ? { Authorization: "Bearer " + token } : {},
      });
      if (!response.ok) throw new Error("Artwork could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "artwork";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(msg(e));
    }
  }
  if (!data)
    return (
      <div className="cc-panel" role={error ? "alert" : "status"}>
        {error || "Loading order…"}
        <button className="cc-button secondary" onClick={close}>
          Back
        </button>
      </div>
    );
  const o = data.order;
  const production = access.role === "production";
  return (
    <div id="cc-order-print" className={`cc-order-detail print-${printMode}`}>
      <div className="cc-detail-toolbar">
        <button className="cc-button secondary" onClick={close}>
          <ArrowLeft size={16} />
          Back to orders
        </button>
        {!production && (
          <div className="cc-actions">
            <button
              className="cc-button secondary"
              onClick={() => {
                setPrintMode("packing");
                setTimeout(() => window.print(), 50);
              }}
            >
              <Printer size={16} />
              Packing slip
            </button>
            <button
              className="cc-button secondary"
              onClick={() => {
                setPrintMode("summary");
                setTimeout(() => window.print(), 50);
              }}
            >
              <Printer size={16} />
              Order summary
            </button>
          </div>
        )}
      </div>
      <div className="cc-panel">
        <div className="cc-panel-heading">
          <div>
            <p className="cc-eyebrow">REC MAMA MADE · ORDER #{o.number}</p>
            <h2>{o.customer_name}</h2>
            <p>
              {new Date(o.created_at).toLocaleString()} · {label(o.source)}
            </p>
          </div>
          <div className="cc-actions">
            <Badge value={o.payment_status} />
            <Badge
              value={
                o.source === "stripe_history_review" && o.stage === "new"
                  ? "historical_review_required"
                  : o.stage
              }
            />
          </div>
        </div>
        {!production && (
          <div className="cc-order-facts">
            <span>
              <small>Customer</small>
              {o.customer_email}
            </span>
            <span>
              <small>Shipping address</small>
              {o.shipping_address
                ? Object.values(o.shipping_address).filter(Boolean).join(", ")
                : "Not supplied by checkout"}
            </span>
            <span>
              <small>Tracking</small>
              {o.tracking ? `${o.carrier ?? ""} ${o.tracking}` : "Not shipped"}
            </span>
          </div>
        )}
      </div>
      {error && (
        <p className="cc-error cc-no-print" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="cc-success cc-no-print" role="status">
          {success}
        </p>
      )}
      <div className="cc-detail-grid">
        <section className="cc-panel">
          <h2>Original purchased specifications</h2>
          <p className="cc-help">
            These snapshots retain the customer’s original choices even when the catalog changes.
          </p>
          {data.items.map((item) => (
            <article className="cc-order-item" key={item.id}>
              <h3>{item.title}</h3>
              <p>
                {item.quantity} purchased · {item.fulfilled_quantity} to fulfill
                {!production && (
                  <span className="cc-financial"> · {money(item.unit_amount)} each</span>
                )}
              </p>
              <dl className="cc-specs">
                {Object.entries(item.specifications)
                  .filter(
                    ([key]) =>
                      ![
                        "customerName",
                        "customerEmail",
                        "snapshot_hash",
                        "checkoutRequestId",
                        "provider",
                        "hasArtwork",
                      ].includes(key),
                  )
                  .map(
                    ([key, value]) =>
                      value !== null &&
                      value !== "" && (
                        <div key={key}>
                          <dt>{label(key)}</dt>
                          <dd>
                            {typeof value === "object" ? JSON.stringify(value) : String(value)}
                          </dd>
                        </div>
                      ),
                  )}
              </dl>
              {item.has_artwork && <ArtworkPreview id={item.id} />}
              {item.has_artwork && (
                <button
                  className="cc-button secondary cc-no-print"
                  onClick={() => void downloadArtwork(item.id)}
                >
                  <Download size={16} />
                  Download original artwork
                </button>
              )}
              <small>Inventory mapping key: {item.product_key}</small>
            </article>
          ))}
        </section>
        {!production && (
          <section className="cc-panel cc-financial">
            <h2>Financial summary</h2>
            <dl className="cc-totals">
              {[
                ["Subtotal", o.subtotal],
                ["Discount", -o.discount],
                ["Shipping", o.shipping],
                ["Tax", o.tax],
                ["Order total", o.total],
                ["Collected", o.paid],
                ["Refunded", o.refunded],
                ["Net collected", o.paid - o.refunded],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{money(Number(v))}</dd>
                </div>
              ))}
            </dl>
            {!o.financial_detail_known && (
              <p className="cc-help">Historical financial components are unavailable.</p>
            )}
            {access.role === "owner" && (
              <div className="cc-no-print">
                <h3>Invoice actions</h3>
                <p>
                  {data.invoice
                    ? `Provider status: ${label(data.invoice.state)}`
                    : "No invoice created."}
                </p>
                {data.invoice?.last_error && <p className="cc-error">{data.invoice.last_error}</p>}
                <div className="cc-actions">
                  <button
                    className="cc-button secondary"
                    disabled={busy || o.paid > 0 || o.stage === "canceled"}
                    onClick={() => void invoice("create")}
                  >
                    {data.invoice?.provider_id
                      ? "Refresh / review invoice"
                      : "Create invoice for review"}
                  </button>
                  {data.invoice?.provider_id && (
                    <>
                      <button
                        className="cc-button"
                        disabled={busy || o.paid > 0}
                        onClick={() => void invoice(data.invoice?.sent_at ? "resend" : "send")}
                      >
                        {data.invoice.sent_at ? "Resend invoice" : "Send invoice"}
                      </button>
                      {data.invoice.hosted_url && (
                        <a
                          href={data.invoice.hosted_url}
                          target="_blank"
                          rel="noreferrer"
                          className="cc-button secondary"
                        >
                          Review secure payment link
                        </a>
                      )}
                    </>
                  )}
                </div>
                <p className="cc-help">
                  Requires verified REC Mama Made Stripe branding and sender. Sending requires
                  review. Paid totals are updated from trusted processor events.
                </p>
                <button
                  className="cc-button secondary"
                  disabled={busy || o.paid >= o.total || !!data.invoice?.provider_id}
                  onClick={() => setManual(!manual)}
                >
                  Record verified manual payment
                </button>
                {manual && (
                  <form
                    className="cc-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (
                        !window.confirm(
                          "Confirm this money was actually received. This creates an audited financial record.",
                        )
                      )
                        return;
                      if (
                        await save("payment.manual", {
                          id,
                          amount: Math.round(Number(f.get("amount")) * 100),
                          reference: String(f.get("reference")),
                          reason: String(f.get("reason")),
                          occurredAt: new Date(String(f.get("date"))).toISOString(),
                          requestId: crypto.randomUUID(),
                        })
                      )
                        setManual(false);
                    }}
                  >
                    <Field
                      name="amount"
                      title="Actual received amount ($)"
                      type="number"
                      value={(o.total - o.paid) / 100}
                      required
                    />
                    <Field
                      name="reference"
                      title="Unique bank / Venmo / cash receipt reference"
                      required
                    />
                    <Field
                      name="date"
                      title="Received at"
                      type="datetime-local"
                      value={dateValue(new Date().toISOString())}
                      required
                    />
                    <Field name="reason" title="Verification and reason" type="textarea" required />
                    <button className="cc-button" disabled={busy}>
                      Record payment
                    </button>
                  </form>
                )}
                {o.paid > o.refunded &&
                  data.payments.some(
                    (p) => p.kind === "payment" && ["stripe", "paypal"].includes(p.provider),
                  ) && (
                    <button
                      className="cc-button secondary"
                      disabled={busy}
                      onClick={() => setRefund(!refund)}
                    >
                      Issue processor refund
                    </button>
                  )}
                {refund && (
                  <form
                    className="cc-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const amount = Math.round(Number(f.get("amount")) * 100);
                      if (
                        !window.confirm(
                          `Refund ${money(amount)} to the selected original payment? This sends a real refund request to the configured processor. Inventory will not be automatically restocked.`,
                        )
                      )
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        const result = await refundAction({
                          data: {
                            orderId: id,
                            paymentId: String(f.get("paymentId")),
                            amount,
                            reason: String(f.get("reason")),
                            requestId: refundRequest,
                          },
                        });
                        setSuccess(
                          `Processor refund: ${label(result.state)}. ${result.reference ?? "Review provider status before retrying."}`,
                        );
                        setRefund(false);
                        setRefundRequest(crypto.randomUUID());
                        await refresh();
                        await onChange();
                      } catch (e) {
                        setError(msg(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label className="cc-field">
                      Original payment
                      <select name="paymentId" required>
                        {data.payments
                          .filter(
                            (p) =>
                              p.kind === "payment" && ["stripe", "paypal"].includes(p.provider),
                          )
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.provider} · {money(p.amount)} · {p.reference}
                            </option>
                          ))}
                      </select>
                    </label>
                    <Field
                      name="amount"
                      title="Refund amount ($)"
                      type="number"
                      value={(o.paid - o.refunded) / 100}
                      required
                    />
                    <Field name="reason" title="Refund reason" type="textarea" required />
                    <p className="cc-help">
                      Refunds preserve the original sale and specifications. Record any verified
                      physical restock separately in Inventory.
                    </p>
                    <button className="cc-button" disabled={busy}>
                      Review and issue refund
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>
        )}
      </div>
      <div className="cc-detail-grid cc-no-print">
        <section className="cc-panel">
          <h2>Production & fulfillment</h2>
          <form
            key={o.version}
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const payload: Record<string, unknown> = {
                id,
                version: o.version,
                stage: String(f.get("stage")),
              };
              if (!production)
                Object.assign(payload, {
                  dueAt: f.get("due") ? new Date(String(f.get("due"))).toISOString() : null,
                  assignedTo: String(f.get("assignedTo") || "") || null,
                  tracking: String(f.get("tracking") || ""),
                  carrier: String(f.get("carrier") || ""),
                });
              await save("order.update", payload);
            }}
          >
            <Field name="stage" title="Workflow stage">
              <select name="stage" defaultValue={o.stage}>
                {STAGES.filter(
                  (s) =>
                    !production ||
                    !["ready_to_ship", "shipped", "delivered", "completed", "canceled"].includes(s),
                ).map((s) => (
                  <option value={s} key={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </Field>
            {!production && (
              <>
                <Field
                  name="due"
                  title="Scheduled fulfillment / due date"
                  type="datetime-local"
                  value={dateValue(o.due_at)}
                />
                <Field
                  name="assignedTo"
                  title="Assigned staff user ID"
                  value={o.assigned_to ?? ""}
                />
                <Field name="carrier" title="Shipping carrier" value={o.carrier ?? ""} />
                <Field name="tracking" title="Tracking number" value={o.tracking ?? ""} />
              </>
            )}
            <button className="cc-button" disabled={busy}>
              Update order
            </button>
          </form>
          <p className="cc-help">
            Starting production consumes allocated stock once. Cancellation releases unconsumed
            stock. Consumed or refunded materials require a verified inventory adjustment.
          </p>
        </section>
        <section className="cc-panel">
          <h2>Internal production notes</h2>
          <div className="cc-records">
            {data.notes.map((n) => (
              <div key={n.id}>
                <span>
                  {n.body}
                  <small>
                    {n.actor_id} · {new Date(n.created_at).toLocaleString()}
                  </small>
                </span>
              </div>
            ))}
          </div>
          <form
            className="cc-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              if (await save("order.note", { id, body: String(f.get("body")) })) form.reset();
            }}
          >
            <Field name="body" title="Add internal note" type="textarea" required />
            <button className="cc-button secondary" disabled={busy}>
              Add note
            </button>
          </form>
        </section>
      </div>
      <section className="cc-panel cc-no-print">
        <h2>Order history</h2>
        <div className="cc-records">
          {data.audit.map((a) => (
            <div key={a.id}>
              <span>
                {label(a.action.replaceAll(".", " "))}
                <small>{a.actor_name}</small>
              </span>
              <time>{new Date(a.created_at).toLocaleString()}</time>
            </div>
          ))}
        </div>
        {data.payments.map((p) => (
          <p key={p.id} className="cc-help">
            {label(p.kind)} · {money(p.amount)} · {p.provider} · {p.reference}
          </p>
        ))}
      </section>
    </div>
  );
}
function ArtworkPreview({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let disposed = false,
      objectUrl = "";
    const controller = new AbortController();
    const token = getBearerToken();
    void fetch(`/api/artwork/${id}`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (response) => {
        if (
          !response.ok ||
          !/^image\/(png|jpeg|webp)$/.test(response.headers.get("content-type") ?? "")
        )
          return;
        const blob = await response.blob();
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  return url ? (
    <img src={url} alt="Customer submitted artwork" className="cc-artwork-preview" />
  ) : (
    <p className="cc-help">
      Original file available below. PDF and SVG originals download for review.
    </p>
  );
}
function dateValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
