import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { StripeEmbeddedCheckout } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { OrderDraft } from "@/lib/order-store";
import type { Delivery } from "@/lib/checkout-validation";

type Config = { stripe: boolean; paypal: boolean; sandbox: boolean; stripeKey?: string; paypalClientId?: string };
type Receipt = { id: string; token: string; amountCents: number; subtotalCents: number; shippingCents: number; taxCents: number; provider?: "stripe" | "paypal"; summary: string };
type PaymentStatus = { status: "pending" | "paid" | "failed" | "expired"; provider: "stripe" | "paypal" | null; amountCents: number };
type PaypalButtons = { isEligible(): boolean; render(element: HTMLElement): Promise<void>; close(): Promise<void> };
type PaypalSdk = { Buttons(options: {
  style: { layout: "vertical"; height: number };
  createOrder(): Promise<string>;
  onApprove(data: { orderID: string }): Promise<void>;
  onCancel(): void; onError(error: unknown): void;
}): PaypalButtons };
declare global { interface Window { paypal?: PaypalSdk } }
const storageKey = "rec-mama-checkout";
async function api<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/checkout?action=${action}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Payment is unavailable. Please try again.");
  return data;
}
async function quote(draft: OrderDraft, delivery: Delivery) {
  let upload: { id: string; token: string } | undefined;
  // Preserve the builder's 12 MB PDF/SVG allowance without exceeding the
  // hosting provider's per-request limit. Each authenticated part is <1 MB.
  if (draft.artworkDataUrl.length > 2_000_000) {
    const bytes = new TextEncoder().encode(draft.artworkDataUrl);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const parts = Math.ceil(draft.artworkDataUrl.length / 1_000_000);
    upload = await api("artwork-start", { hash, parts });
    for (let part = 0; part < parts; part++) {
      await api("artwork-part", { ...upload, part, content: draft.artworkDataUrl.slice(part * 1_000_000, (part + 1) * 1_000_000) });
    }
  }
  return api<Omit<Receipt, "summary">>("create", {
    draft: upload ? { ...draft, artworkDataUrl: "" } : draft, delivery, upload,
  });
}
let paypalScript: Promise<void> | undefined;
function loadPaypal(config: Config) {
  if (window.paypal) return Promise.resolve();
  return paypalScript ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      "client-id": config.paypalClientId!, currency: "USD", intent: "capture",
      components: "buttons", "enable-funding": "venmo", "disable-funding": "card,credit,paylater",
      ...(config.sandbox ? { "buyer-country": "US" } : {}),
    });
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.onload = () => resolve();
    script.onerror = () => { paypalScript = undefined; script.remove(); reject(new Error("PayPal could not load. Please try again.")); };
    document.head.appendChild(script);
  });
}

export function Checkout({ open, onOpenChange, draft, summary }: {
  open: boolean; onOpenChange(open: boolean): void; draft: OrderDraft; summary: string;
}) {
  const [config, setConfig] = useState<Config>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [status, setStatus] = useState<PaymentStatus>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<"stripe" | "paypal">();
  const [retry, setRetry] = useState(0);
  const [delivery, setDelivery] = useState<Delivery>({ name: draft.customerName, address: {
    line1: "", line2: "", city: "", state: "", postal_code: "", country: "US",
  } });
  const host = useRef<HTMLDivElement>(null);
  const requestLock = useRef(false);
  const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  const save = (value: Receipt) => { sessionStorage.setItem(storageKey, JSON.stringify(value)); setReceipt(value); };
  async function check(value = receipt) {
    if (!value) return;
    const result = await api<PaymentStatus>("status", value);
    setStatus(result);
    if (result.provider && value.provider !== result.provider) save({ ...value, provider: result.provider });
    if (result.status === "paid") { setProvider(undefined); setNotice(""); }
    else if (result.status === "pending") setNotice("Payment has not been confirmed yet. Check again before starting another payment.");
    return result;
  }

  useEffect(() => {
    if (!open) { setProvider(undefined); return; }
    let cancelled = false;
    setError("");
    void (async () => {
      try {
        const response = await fetch("/api/checkout", { cache: "no-store" });
        if (!response.ok) throw new Error("Payment options could not load.");
        const next = await response.json() as Config;
        if (cancelled) return;
        setConfig(next);
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const value = JSON.parse(saved) as Receipt;
          setReceipt(value);
          if (next.stripe || next.paypal) await check(value);
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Payment options could not load."); }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function choose(method: "stripe" | "paypal") {
    if (requestLock.current) return;
    requestLock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const value = receipt;
      if (!value) throw new Error("Calculate your total first.");
      // Persist the method before creating any payable provider session. On
      // network failure the same order and idempotency key are reused.
      if (value.provider && value.provider !== method) throw new Error("Continue with the method selected for this saved order.");
      save({ ...value, provider: method });
      setProvider(method); setRetry((n) => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start payment."); }
    finally { requestLock.current = false; setBusy(false); }
  }

  useEffect(() => {
    if (!open || !provider || !receipt || !config || !host.current) return;
    let cancelled = false;
    let stripeCheckout: StripeEmbeddedCheckout | undefined;
    let buttons: PaypalButtons | undefined;
    const element = host.current;
    setBusy(true);
    void (async () => {
      try {
        if (provider === "stripe") {
          const stripe = await loadStripe(config.stripeKey!);
          if (!stripe || cancelled) return;
          const embedded = await stripe.createEmbeddedCheckoutPage({
            fetchClientSecret: async () => (await api<{ clientSecret: string }>("stripe", receipt)).clientSecret,
            onComplete: () => { void check(receipt).catch(() => setError("Payment is being verified. Use Check payment status.")); },
          });
          stripeCheckout = embedded;
          if (cancelled) { embedded.destroy(); return; }
          embedded.mount(element);
        } else {
          await loadPaypal(config);
          if (cancelled) return;
          buttons = window.paypal!.Buttons({
            style: { layout: "vertical", height: 48 },
            createOrder: async () => (await api<{ orderId: string }>("paypal", receipt)).orderId,
            onApprove: async ({ orderID }) => {
              setBusy(true); setError("");
              try {
                await api("capture", { ...receipt, orderId: orderID });
                await check(receipt);
              } catch (e) { setError(e instanceof Error ? e.message : "Payment is still being verified."); }
              finally { setBusy(false); }
            },
            onCancel: () => setNotice("Payment was canceled. Your build is saved and you can retry here."),
            onError: () => setError("PayPal could not complete the payment. Check payment status before retrying."),
          });
          if (!buttons.isEligible()) throw new Error("PayPal is not available on this device.");
          await buttons.render(element);
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Payment could not load."); }
      finally { if (!cancelled) setBusy(false); }
    })();
    return () => { cancelled = true; stripeCheckout?.destroy(); void buttons?.close(); };
  }, [open, provider, retry]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{status?.status === "paid" ? "Payment received" : "Secure checkout"}</DialogTitle>
        <DialogDescription>Review your saved build and pay securely. A digital proof is still required before engraving.</DialogDescription>
      </DialogHeader>
      {config?.sandbox && (config.stripe || config.paypal) && <p className="text-sm font-semibold">Test checkout — no real money is collected.</p>}
      {receipt && <div className="rounded-xl bg-stage p-4 text-stage-ink">
        <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <dt>Products</dt><dd className="text-right">{money(receipt.subtotalCents)}</dd>
          <dt>Shipping &amp; packaging</dt><dd className="text-right">{money(receipt.shippingCents)}</dd>
          <dt>Sales tax</dt><dd className="text-right">{money(receipt.taxCents)}</dd>
        </dl>
        <p className="text-lg font-semibold">Order total: {money(receipt.amountCents)}</p>
        <p className="mt-1 text-xs break-all">Reference: {receipt.id}</p>
        <details className="mt-2 text-sm"><summary className="min-h-11 cursor-pointer">View saved order</summary><p className="whitespace-pre-line">{receipt.summary}</p></details>
      </div>}
      {status?.status === "paid" ? <div role="status" className="space-y-3">
        <p>Thank you. Your payment is confirmed and your custom build is saved for its digital proof. Payment does not approve the artwork.</p>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
        <Button variant="outline" onClick={() => { sessionStorage.removeItem(storageKey); setReceipt(undefined); setStatus(undefined); setNotice(""); onOpenChange(false); }}>Start another order</Button>
      </div> : <>
        {config && !config.stripe && !config.paypal ? <p role="status">Online checkout is being set up. Your build is saved. You can close this window to copy or email your build.</p> : <>
          <p className="text-sm">Cards, Apple Pay, Google Pay and Link are offered through Stripe when available. PayPal shows Venmo only for eligible US customers.</p>
          {!receipt && (config?.stripe || config?.paypal) && <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            if (requestLock.current) return;
            requestLock.current = true; setBusy(true); setError("");
            void quote(draft, delivery)
              .then((created) => save({ ...created, summary }))
              .catch((e: Error) => setError(e.message))
              .finally(() => { requestLock.current = false; setBusy(false); });
          }}>
            <p className="text-sm sm:col-span-2">US delivery. Shipping includes packaging and is estimated from parcel weight. Your full total appears before you choose a payment method.</p>
            <label className="grid gap-1 text-sm sm:col-span-2">Delivery name
              <input required autoComplete="shipping name" value={delivery.name} className="min-h-11 rounded-lg border border-stage-line px-3" onChange={(e) => setDelivery({ ...delivery, name: e.target.value })} />
            </label>
            {([
              ["line1", "Street address", "address-line1"], ["line2", "Apartment / suite (optional)", "address-line2"],
              ["city", "City", "address-level2"], ["state", "State (2 letters)", "address-level1"], ["postal_code", "ZIP code", "postal-code"],
            ] as const).map(([field, label, autocomplete]) => <label key={field} className="grid gap-1 text-sm">
              {label}<input required={field !== "line2"} autoComplete={`shipping ${autocomplete}`} value={delivery.address[field]}
                maxLength={field === "state" ? 2 : field === "postal_code" ? 10 : 200}
                pattern={field === "state" ? "[A-Za-z]{2}" : field === "postal_code" ? "[0-9]{5}(-[0-9]{4})?" : undefined}
                className="min-h-11 rounded-lg border border-stage-line px-3"
                onChange={(e) => setDelivery({ ...delivery, address: { ...delivery.address, [field]: e.target.value } })} />
            </label>)}
            <Button type="submit" className="min-h-12 sm:col-span-2" disabled={busy}>Calculate total</Button>
          </form>}
          {receipt && <div className="grid gap-3 sm:grid-cols-2">
            {config?.stripe && <Button className="min-h-12" disabled={busy || receipt?.provider === "paypal" || status?.status === "expired" || status?.status === "failed"} onClick={() => void choose("stripe")}>Pay by card or wallet</Button>}
            {config?.paypal && <Button className="min-h-12" variant="outline" disabled={busy || receipt?.provider === "stripe" || status?.status === "expired" || status?.status === "failed"} onClick={() => void choose("paypal")}>PayPal / Venmo</Button>}
          </div>}
        </>}
        {busy && <p role="status">Loading secure payment…</p>}
        <div ref={host} className="min-w-0" />
        {status && ["failed", "expired"].includes(status.status) && <p role="status">This payment is {status.status}. Keep your reference and contact the shop before starting a new payment.</p>}
        {receipt && <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => {
          setBusy(true); setError("");
          void check().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
        }}>Check payment status</Button>}
      </>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {error && <p role="alert" className="text-sm font-medium">{error}</p>}
    </DialogContent>
  </Dialog>;
}
