import { useCallback, useEffect, useState } from "react";
import {
  getPrivateStudio,
  payPrivateInvoice,
  answerPrivateProof,
  getStudioDetail,
} from "@/lib/commerce/studio-api";
import type { StudioRow, InvoiceBody, ProofBody } from "@/lib/commerce/studio-schemas";
import { money, label } from "@/lib/commerce/types";
import "./studio.css";
type View = {
  document: StudioRow;
  status: string;
  balance: number;
  paid: number;
  refunded: number;
  payable: boolean;
  imageCount: number;
  payments: { amount: number; kind: string; occurred_at: string }[];
};
export function CustomerDocument({
  token,
  kind,
  previewId,
}: {
  token?: string;
  kind?: "invoice" | "proof";
  previewId?: string;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setView(null);
    setError("");
    try {
      if (previewId) {
        const { document: d, financial, payments } = await getStudioDetail({ data: previewId });
        setView({
          document: d,
          status:
            d.kind === "invoice" && d.state === "issued"
              ? d.provider_state === "void"
                ? "void"
                : (financial?.payment_status ?? "unpaid")
              : d.state,
          balance: Math.max(0, d.total - (financial?.paid ?? 0) + (financial?.refunded ?? 0)),
          paid: financial?.paid ?? 0,
          refunded: financial?.refunded ?? 0,
          payable: false,
          imageCount: d.kind === "proof" ? (d.body as ProofBody).mediaIds.length : 0,
          payments,
        });
      } else {
        const v = await getPrivateStudio({ data: token! });
        if (v && v.document.kind === kind) setView(v);
        else {
          setView(null);
          setError(
            "This private document link is unavailable, expired or replaced. Contact the shop for a current link.",
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Document unavailable.");
    } finally {
      setLoading(false);
    }
  }, [token, kind, previewId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (loading)
    return (
      <main className="studio-shell" role="status">
        Loading your private document…
      </main>
    );
  if (!view)
    return (
      <main className="studio-shell">
        <h1>Private document unavailable</h1>
        <p role="alert">{error}</p>
      </main>
    );
  const d = view.document,
    invoice = d.kind === "invoice",
    b = d.body as InvoiceBody,
    p = d.body as ProofBody;
  const file = (mode = "pdf", position = 0) =>
    `/api/studio-file/${d.id}?mode=${mode}&position=${position}${token ? "&token=" + encodeURIComponent(token) : ""}`;
  return (
    <main className="studio-shell">
      <article className="studio-paper" data-studio-document={d.kind}>
        <header className="studio-heading">
          <div className="studio-brand">
            <img src="/brand/rec-mama-made-app-logo.jpg" alt="REC Mama Made" />
            <div>
              <span>REC MAMA MADE</span>
              <small>Custom goods · made with care</small>
            </div>
          </div>
          <div>
            <p className="studio-kicker">
              {invoice ? "Signature Studio" : "Separate customer approval"}
            </p>
            <h1>{invoice ? "INVOICE" : "DESIGN PROOF"}</h1>
            <p>
              {invoice ? "INV" : "P"}-{String(d.number).padStart(5, "0")}
              {!invoice && ` / Version ${d.proof_version}`}
            </p>
          </div>
        </header>
        {previewId && (
          <p className="studio-notice">
            Owner preview · this does not issue, email, approve or pay a document.
          </p>
        )}
        <section className="studio-billing">
          <div>
            <p className="studio-kicker">{invoice ? "Bill to" : "Prepared for"}</p>
            <h2>{b.customerName}</h2>
            <p>{b.customerEmail}</p>
            {invoice && b.billingAddress && <p className="studio-prewrap">{b.billingAddress}</p>}
            {invoice && b.shippingAddress && (
              <p className="studio-prewrap">Ship to: {b.shippingAddress}</p>
            )}
          </div>
          <div>
            <strong className="studio-status">{label(view.status)}</strong>
            <p>Issued {d.issued_at ? new Date(d.issued_at).toLocaleDateString() : "Draft"}</p>
            {invoice ? (
              <p>Due {b.dueDate} · America/Chicago</p>
            ) : (
              <p>
                Version {d.proof_version} ·{" "}
                {d.expires_at ? "Link expires " + new Date(d.expires_at).toLocaleString() : "Draft"}
              </p>
            )}
          </div>
        </section>
        {d.sender && (
          <p className="studio-sender">
            {[d.sender.name, d.sender.email, d.sender.phone, d.sender.address]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {invoice ? (
          <>
            <div className="studio-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <strong>{l.title}</strong>
                        <p>{l.specifications}</p>
                      </td>
                      <td>{l.quantity}</td>
                      <td>{money(l.unitAmount)}</td>
                      <td>{money(l.unitAmount * l.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <section className="studio-totals">
              <dl>
                {[
                  ["Subtotal", d.subtotal],
                  ["Discount", -b.discount],
                  ["Shipping", b.shipping],
                  ["Tax (recorded)", b.tax],
                  ["Invoice total", d.total],
                  ["Payments received", view.paid],
                  ["Refunds", view.refunded],
                  ["Balance due", view.balance],
                ].map(([name, amount]) => (
                  <div key={name}>
                    <dt>{name}</dt>
                    <dd>{money(Number(amount))}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {b.terms && (
              <section>
                <h2>Payment terms</h2>
                <p className="studio-prewrap">{b.terms}</p>
              </section>
            )}
            {b.notes && (
              <section>
                <h2>Notes</h2>
                <p className="studio-prewrap">{b.notes}</p>
              </section>
            )}
            <div className="studio-callout">
              <h2>Secure online payment</h2>
              <p>
                Payment status updates after provider verification. Returning from payment or
                receiving an email does not mark an invoice paid.
              </p>
              {view.payable && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await payPrivateInvoice({ data: token! });
                      window.location.assign(result.url);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Payment link unavailable.");
                      setBusy(false);
                    }
                  }}
                >
                  Pay Invoice securely
                </button>
              )}
              {!previewId && !view.payable && view.status !== "paid" && (
                <p>The shop can provide payment access when this invoice is ready.</p>
              )}
              <button className="secondary" disabled={busy} onClick={() => void load()}>
                Refresh payment status
              </button>
            </div>
            {view.payments.length > 0 && (
              <section>
                <h2>Payment history</h2>
                {view.payments.map((x, i) => (
                  <p key={i}>
                    {label(x.kind)} · {money(x.amount)} · {new Date(x.occurred_at).toLocaleString()}
                  </p>
                ))}
              </section>
            )}
          </>
        ) : (
          <>
            <section className="studio-proof-images" aria-label="Proof images">
              <h2>{p.title}</h2>
              {Array.from({ length: view.imageCount }, (_, i) => (
                <a key={i} href={file("image", i)} target="_blank" rel="noreferrer">
                  <img
                    src={file("image", i)}
                    alt={`Design proof version ${d.proof_version}, image ${i + 1}. Open for full-size zoom.`}
                  />
                  <span>Open full-size image / zoom</span>
                </a>
              ))}
            </section>
            <section className="studio-callout">
              <h2>Design details</h2>
              <dl>
                {p.details.map((x, i) => (
                  <div key={i}>
                    <dt>{x.label}</dt>
                    <dd>{x.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="studio-prewrap">{p.notes}</p>
            </section>
            <section>
              <h2>Separate customer approval</h2>
              <p>
                Payment does not approve artwork. Approving this proof does not pay an invoice. Your
                response applies only to version {d.proof_version}.
              </p>
              {!previewId && d.state === "awaiting_approval" ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    const f = new FormData(e.currentTarget),
                      action =
                        (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
                        "changes"
                          ? "changes"
                          : "approve";
                    try {
                      const result = await answerPrivateProof({
                        data: {
                          token: token!,
                          version: d.version,
                          action,
                          name: String(f.get("name")),
                          email: String(f.get("email")),
                          message: String(f.get("message") ?? ""),
                          confirmed: (f.get("confirmed") === "on") as true,
                        },
                      });
                      setNotice(
                        `Version ${result.proofVersion}: ${label(result.state)}. Recorded ${new Date(result.respondedAt!).toLocaleString()}.`,
                      );
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Response failed.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Your name
                    <input name="name" required maxLength={120} />
                  </label>
                  <label>
                    Customer email
                    <input name="email" type="email" required maxLength={254} />
                  </label>
                  <label>
                    Changes requested / message
                    <textarea name="message" maxLength={4000} rows={4} />
                  </label>
                  <label className="studio-check">
                    <input name="confirmed" type="checkbox" required />I reviewed this exact version
                    and confirm the response I am submitting.
                  </label>
                  <div className="studio-actions">
                    <button name="action" value="approve" disabled={busy}>
                      Approve Proof
                    </button>
                    <button name="action" value="changes" className="secondary" disabled={busy}>
                      Request Changes
                    </button>
                  </div>
                  <p>
                    This records a design approval response, not a separate electronic-signature
                    service.
                  </p>
                </form>
              ) : (
                <p>
                  {previewId
                    ? "Customer approval actions become available only on the separately issued proof link."
                    : `${label(d.state)}${d.responded_at ? " · " + new Date(d.responded_at).toLocaleString() : ""}`}
                </p>
              )}
              {d.response && (
                <div className="studio-notice">
                  <strong>
                    {d.response.name} · {label(d.response.action)}
                  </strong>
                  <p className="studio-prewrap">{d.response.message}</p>
                </div>
              )}
            </section>
          </>
        )}
        <div className="studio-actions">
          <a className="studio-button" href={file()}>
            Download {invoice ? "Invoice" : "Design Proof"} PDF
          </a>
        </div>
        {error && (
          <p role="alert" className="studio-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="studio-notice">
            {notice}
          </p>
        )}
        <footer>
          <p>Thank you for supporting REC Mama Made.</p>
          <a href="/">recmamamade.com</a>
        </footer>
      </article>
    </main>
  );
}
