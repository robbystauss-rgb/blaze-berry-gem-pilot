import { useEffect, useState, type ReactNode } from "react";
import { getStudioText, saveStudioCustomerPhone } from "@/lib/commerce/studio-api";
import { nativeSmsHref } from "@/lib/commerce/studio-text";

type Contact = { phone: string; version: number };
export function StudioTextActions({
  id,
  kind,
  path,
  contact,
  onSaved,
  children,
}: {
  id: string;
  kind: "invoice" | "proof";
  path: string;
  contact: Contact;
  onSaved: (contact: Contact) => void;
  children?: ReactNode;
}) {
  const [phone, setPhone] = useState(contact.phone),
    [prepared, setPrepared] = useState<Awaited<ReturnType<typeof getStudioText>> | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [expired, setExpired] = useState(false);
  useEffect(() => {
    setPhone(contact.phone);
    setNotice("");
  }, [id, contact.phone]);
  useEffect(() => {
    let canceled = false;
    setPrepared(null);
    setExpired(false);
    setError("");
    if (path && contact.phone)
      void getStudioText({ data: { id, path } })
        .then((result) => {
          if (!canceled) setPrepared(result);
        })
        .catch(() => {
          if (!canceled)
            setError(
              "Text unavailable. Reopen the document or create its current private link, then try again.",
            );
        });
    return () => {
      canceled = true;
    };
  }, [id, path, contact.phone, contact.version]);
  useEffect(() => {
    if (!prepared) return;
    let timer: number;
    const checkExpiry = () => {
      const remaining = new Date(prepared.expiresAt).getTime() - Date.now();
      if (remaining <= 0) setExpired(true);
      else timer = window.setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    };
    checkExpiry();
    return () => window.clearTimeout(timer);
  }, [prepared]);
  const ready = !!prepared && !expired && phone === contact.phone && !busy;
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Private message copied. Review the recipient before sending.");
    } catch {
      setError("Copy is unavailable in this browser. Select and copy the private message below.");
    }
  }
  return (
    <section className={path ? undefined : "cc-panel"} aria-label="Native text message">
      <h3>Text {kind === "invoice" ? "invoice" : "design proof"}</h3>
      <form
        className="cc-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const result = await saveStudioCustomerPhone({
              data: { id, version: contact.version, phone },
            });
            setPhone(result.phone);
            onSaved(result);
            setNotice("Customer phone saved privately.");
          } catch {
            setError(
              "Phone was not saved. Use one US/Canada number or +country code; reopen the document if another edit changed it.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="cc-field">
          Customer mobile phone
          <input
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={40}
            value={phone}
            aria-describedby="studio-phone-help"
            onChange={(e) => {
              setPhone(e.target.value);
              setNotice("");
            }}
          />
        </label>
        <p id="studio-phone-help" className="cc-help">
          US/Canada: 10 digits. International: + and country code. Saved privately for this customer
          across invoices and proofs. Clear and save to remove it.
        </p>
        <button
          type="submit"
          className="cc-button secondary"
          disabled={busy || phone === contact.phone}
        >
          Save customer phone
        </button>
      </form>
      <div className="cc-actions">
        {children}
        {ready ? (
          <a
            className="cc-button secondary"
            href={nativeSmsHref(
              prepared.phone,
              prepared.message,
              navigator.userAgent,
              navigator.maxTouchPoints,
            )}
            rel="noreferrer"
            onClick={(e) => {
              if (Date.now() >= new Date(prepared.expiresAt).getTime()) {
                e.preventDefault();
                setExpired(true);
                return;
              }
              setNotice(
                "Your messaging app may open. Review the recipient and press Send there. Sending and delivery are not confirmed by this website.",
              );
            }}
          >
            Text {kind === "invoice" ? "Invoice" : "Design Proof"}
          </a>
        ) : (
          <button type="button" className="cc-button secondary" disabled>
            Text {kind === "invoice" ? "Invoice" : "Design Proof"}
          </button>
        )}
        {prepared && !expired && (
          <button
            type="button"
            className="cc-button secondary"
            onClick={() => void copy(prepared.message)}
          >
            Copy text message
          </button>
        )}
      </div>
      <p className="cc-help">
        Uses your device’s messaging app. Review the number and press Send yourself. Opening the app
        does not mean a message was sent or delivered. On desktop, or if the app does not open or
        prefill, use Copy secure link or Copy text message.
      </p>
      {!path && (
        <p className="cc-help">
          Issue the document and use Create / replace private link to enable texting and link
          copying.
        </p>
      )}
      {phone !== contact.phone && <p role="status">Save the phone number before texting.</p>}
      {expired && (
        <p role="status">This link has expired. Create a current private link before sharing.</p>
      )}
      {prepared && !expired && (
        <label className="cc-field">
          Private text message preview
          <textarea readOnly value={prepared.message} rows={5} />
        </label>
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
    </section>
  );
}
