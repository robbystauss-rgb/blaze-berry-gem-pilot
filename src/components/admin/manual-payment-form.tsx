import { useEffect, useRef, useState } from "react";
import { mutateAdmin } from "@/lib/commerce/api";
import {
  dollarsToCents,
  localDateTime,
  manualPaymentSchema,
  PAYMENT_METHODS,
} from "@/lib/commerce/manual-payment";
import { ownerError } from "@/lib/commerce/errors";
import { label, money } from "@/lib/commerce/types";

type Draft = {
  requestId: string;
  method: string;
  amount: string;
  reference: string;
  reason: string;
  date: string;
};
export function ManualPaymentForm({
  orderId,
  remaining,
  blocked,
  onSaved,
}: {
  orderId: string;
  remaining: number;
  blocked: boolean;
  onSaved: (message: string) => Promise<void>;
}) {
  const storageKey = `rec-manual-payment:${orderId}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as Draft;
    } catch {
      /* Storage may be unavailable. Server idempotency still applies. */
    }
    return {
      requestId: crypto.randomUUID(),
      method: "venmo",
      amount: (remaining / 100).toFixed(2),
      reference: "",
      reason: "",
      date: localDateTime(),
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* Optional tab recovery. */
    }
  }, [draft, storageKey]);
  const field = (key: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  return (
    <form
      className="cc-form cc-manual-payment"
      noValidate
      aria-label="Record external payment"
      onSubmit={async (event) => {
        event.preventDefault();
        if (inFlight.current || blocked) return;
        setError("");
        const received = new Date(draft.date);
        const parsed = manualPaymentSchema.safeParse({
          id: orderId,
          method: draft.method,
          amount: dollarsToCents(draft.amount),
          reference: draft.reference,
          reason: draft.reason,
          occurredAt: Number.isFinite(received.getTime()) ? received.toISOString() : "",
          requestId: draft.requestId,
        });
        const next: Record<string, string> = {};
        if (!parsed.success)
          for (const issue of parsed.error.issues)
            next[issue.path[0] === "occurredAt" ? "date" : String(issue.path[0])] = issue.message;
        if (received > new Date()) next.date = "Choose a received time that is not in the future.";
        if (dollarsToCents(draft.amount) > remaining)
          next.amount = `The remaining balance is ${money(remaining)}. Review payment history before collecting more.`;
        setErrors(next);
        if (!parsed.success || Object.keys(next).length) {
          event.currentTarget
            .querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)
            ?.focus();
          return;
        }
        if (
          !window.confirm(
            `Confirm you independently verified ${money(parsed.data.amount)} received by ${label(parsed.data.method)}. This creates a private, audited receipt. Payment does not approve artwork.`,
          )
        )
          return;
        inFlight.current = true;
        setBusy(true);
        try {
          const result = await mutateAdmin({
            data: { action: "payment.manual", payload: parsed.data },
          });
          if (!("receiptId" in result))
            throw Error(
              "Receipt confirmation is unavailable. Refresh payment history before retrying.",
            );
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* Optional storage. */
          }
          await onSaved(
            `${result.duplicate ? "Existing receipt confirmed" : "Payment recorded"}: ${money(parsed.data.amount)} by ${label(parsed.data.method)}. Collected ${money(Number(result.paid))}; remaining ${money(Number(result.remaining))}. Artwork approval remains separate.`,
          );
        } catch (e) {
          setError(ownerError(e));
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      }}
    >
      <h3>Record money already received</h3>
      <p className="cc-help">
        Remaining balance: <strong>{money(remaining)}</strong>. This is your verification of an
        external receipt. No Venmo API verification or customer message is sent.
      </p>
      <fieldset disabled={busy || blocked}>
        <label className="cc-field" htmlFor="manual-method">
          Payment method
          <select
            id="manual-method"
            name="method"
            value={draft.method}
            onChange={(e) => field("method", e.target.value)}
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {label(method)}
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ["amount", "Amount received ($)", "text"],
            ["date", "Date and time received", "datetime-local"],
            ["reference", "Transaction / receipt reference", "text"],
          ] as const
        ).map(([name, title, type]) => (
          <label className="cc-field" key={name} htmlFor={`manual-${name}`}>
            {title}
            <input
              id={`manual-${name}`}
              name={name}
              aria-label={title}
              type={type}
              inputMode={name === "amount" ? "decimal" : undefined}
              autoComplete="off"
              value={draft[name]}
              maxLength={name === "reference" ? 160 : undefined}
              aria-invalid={!!errors[name]}
              aria-describedby={`manual-${name}-help`}
              onChange={(e) => field(name, e.target.value)}
            />
            <span
              id={`manual-${name}-help`}
              className={errors[name] ? "cc-field-error" : "cc-help"}
            >
              {errors[name] ||
                (name === "reference"
                  ? "At least 3 characters. Use the actual transaction ID, or your unique cash receipt number."
                  : name === "date"
                    ? `Your local time (${Intl.DateTimeFormat().resolvedOptions().timeZone}); saved with its UTC equivalent.`
                    : "Dollars and cents, up to the remaining balance. Partial payments are supported.")}
            </span>
          </label>
        ))}
        <label className="cc-field" htmlFor="manual-reason">
          Internal verification note
          <textarea
            id="manual-reason"
            aria-label="Internal verification note"
            name="reason"
            value={draft.reason}
            minLength={5}
            maxLength={500}
            aria-invalid={!!errors.reason}
            aria-describedby="manual-reason-help"
            placeholder="Payment verified in Venmo on [date]."
            onChange={(e) => field("reason", e.target.value)}
          />
          <span id="manual-reason-help" className={errors.reason ? "cc-field-error" : "cc-help"}>
            {errors.reason ||
              "At least 5 characters. Explain how you confirmed receipt; this note stays private."}
          </span>
        </label>
      </fieldset>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
      <button className="cc-button" disabled={busy || blocked}>
        {busy ? "Confirming receipt…" : "Record verified payment"}
      </button>
    </form>
  );
}
