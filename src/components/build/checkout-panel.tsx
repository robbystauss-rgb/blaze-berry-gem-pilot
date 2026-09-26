import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MANUAL_VENMO_URL,
  capturePayPalOrder,
  createPayPalOrder,
  createStripeCheckoutSession,
  getPayPalBrowserToken,
  getPaymentConfig,
  getStripeCheckoutStatus,
  type PaymentBuild,
} from "@/lib/payments";

 type PayPalMethods = { isEligible: (method: string) => boolean };
 type PayPalPaymentSession = { start: (options: { presentationMode: "auto" }, orderPromise: Promise<{ orderId: string }>) => Promise<void> };
 type PayPalSdk = {
  findEligibleMethods: (options: { currencyCode: "USD" }) => Promise<PayPalMethods>;
  createPayPalOneTimePaymentSession: (options: PaymentCallbacks) => PayPalPaymentSession;
  createVenmoOneTimePaymentSession: (options: PaymentCallbacks) => PayPalPaymentSession;
 };
 type PaymentCallbacks = {
  onApprove: (data: { orderId: string }) => Promise<void>;
  onCancel: () => void;
  onError: (error: unknown) => void;
 };
 type PayPalGlobal = { createInstance: (options: { clientToken: string; components: string[]; pageType: "checkout" }) => Promise<PayPalSdk> };

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function loadPayPalSdk(environment: "sandbox" | "live") {
  return new Promise<PayPalGlobal>((resolve, reject) => {
    const current = (window as Window & { paypal?: PayPalGlobal }).paypal;
    if (current?.createInstance) {
      resolve(current);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-rec-paypal-sdk="v6"]');
    const onReady = () => {
      const paypal = (window as Window & { paypal?: PayPalGlobal }).paypal;
      if (paypal?.createInstance) resolve(paypal);
      else reject(new Error("PayPal checkout did not load."));
    };
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", () => reject(new Error("PayPal checkout did not load.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.dataset.recPaypalSdk = "v6";
    script.src = environment === "live" ? "https://www.paypal.com/web-sdk/v6/core" : "https://www.sandbox.paypal.com/web-sdk/v6/core";
    script.addEventListener("load", onReady, { once: true });
    script.addEventListener("error", () => reject(new Error("PayPal checkout did not load.")), { once: true });
    document.head.appendChild(script);
  });
}

export function CheckoutPanel({
  build,
  total,
  paymentState,
  stripeSessionId,
}: {
  build: PaymentBuild;
  total: number;
  paymentState?: "stripe-success" | "stripe-canceled";
  stripeSessionId?: string;
}) {
  const buildRef = useRef(build);
  const payPalTokens = useRef(new Map<string, string>());
  const paypalRef = useRef<HTMLDivElement>(null);
  const venmoRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<{ stripeConfigured: boolean; paypalConfigured: boolean; paypalEnvironment: "sandbox" | "live" } | null>(null);
  const [busy, setBusy] = useState<"stripe" | "paypal" | "venmo" | "verify" | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  buildRef.current = build;

  useEffect(() => {
    let alive = true;
    getPaymentConfig()
      .then((next) => alive && setConfig(next))
      .catch(() => alive && setConfig({ stripeConfigured: false, paypalConfigured: false, paypalEnvironment: "sandbox" }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (paymentState === "stripe-canceled") {
      setNotice({ tone: "info", text: "Payment was canceled. Nothing was charged and your build is still saved on this device." });
      return;
    }
    if (paymentState !== "stripe-success" || !stripeSessionId) return;
    let alive = true;
    setBusy("verify");
    getStripeCheckoutStatus({ data: stripeSessionId })
      .then((status) => {
        if (!alive) return;
        if (status.paymentStatus === "paid") {
          setNotice({ tone: "success", text: `Payment confirmed${status.amountTotal ? ` · $${(status.amountTotal / 100).toFixed(2)}` : ""}. Your order is ready for the digital-proof step.` });
        } else {
          setNotice({ tone: "info", text: "Checkout returned, but payment is not marked paid yet. Please wait a moment before retrying." });
        }
      })
      .catch((error) => alive && setNotice({ tone: "error", text: messageFrom(error, "We could not verify the card payment yet.") }))
      .finally(() => alive && setBusy(null));
    return () => {
      alive = false;
    };
  }, [paymentState, stripeSessionId]);

  useEffect(() => {
    if (!config?.paypalConfigured || !paypalRef.current || !venmoRef.current) return;
    let alive = true;
    const paypalContainer = paypalRef.current;
    const venmoContainer = venmoRef.current;
    paypalContainer.replaceChildren();
    venmoContainer.replaceChildren();

    async function createOrderPromise(method: "paypal" | "venmo") {
      if (alive) setBusy(method);
      try {
        const created = await createPayPalOrder({ data: buildRef.current });
        payPalTokens.current.set(created.orderId, created.captureToken);
        return { orderId: created.orderId };
      } catch (error) {
        if (alive) {
          setBusy(null);
          setNotice({ tone: "error", text: messageFrom(error, "Payment could not start. Please try again.") });
        }
        throw error;
      }
    }

    const callbacksFor = (method: "paypal" | "venmo"): PaymentCallbacks => ({
      onApprove: async ({ orderId }) => {
        const captureToken = payPalTokens.current.get(orderId);
        if (!captureToken) throw new Error("Payment verification token is missing. Please retry checkout.");
        if (alive) setBusy(method);
        try {
          const result = await capturePayPalOrder({ data: { orderId, captureToken } });
          if (alive) setNotice({ tone: "success", text: `${method === "venmo" ? "Venmo" : "PayPal"} payment confirmed · $${Number(result.amount).toFixed(2)}. Your order is ready for the digital-proof step.` });
        } finally {
          if (alive) setBusy(null);
        }
      },
      onCancel: () => {
        if (alive) {
          setBusy(null);
          setNotice({ tone: "info", text: `${method === "venmo" ? "Venmo" : "PayPal"} payment was canceled. Nothing was charged.` });
        }
      },
      onError: (error) => {
        if (alive) {
          setBusy(null);
          setNotice({ tone: "error", text: messageFrom(error, `${method === "venmo" ? "Venmo" : "PayPal"} checkout ran into a problem. Please try again.`) });
        }
      },
    });

    void (async () => {
      try {
        const token = await getPayPalBrowserToken();
        const paypal = await loadPayPalSdk(token.environment);
        const sdk = await paypal.createInstance({ clientToken: token.clientToken, components: ["paypal-payments", "venmo-payments"], pageType: "checkout" });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (!alive) return;

        if (methods.isEligible("paypal")) {
          const session = sdk.createPayPalOneTimePaymentSession(callbacksFor("paypal"));
          const button = document.createElement("paypal-button");
          button.setAttribute("type", "pay");
          button.setAttribute("aria-label", "Pay with PayPal");
          button.addEventListener("click", () => {
            void session.start({ presentationMode: "auto" }, createOrderPromise("paypal"));
          });
          paypalContainer.appendChild(button);
        }

        if (methods.isEligible("venmo")) {
          const session = sdk.createVenmoOneTimePaymentSession(callbacksFor("venmo"));
          const button = document.createElement("venmo-button");
          button.setAttribute("type", "pay");
          button.setAttribute("aria-label", "Pay with Venmo");
          button.addEventListener("click", () => {
            void session.start({ presentationMode: "auto" }, createOrderPromise("venmo"));
          });
          venmoContainer.appendChild(button);
        }

        if (!paypalContainer.childNodes.length && !venmoContainer.childNodes.length) {
          setNotice({ tone: "info", text: "PayPal and Venmo are not eligible for this browser session. Card checkout is still available." });
        }
      } catch (error) {
        if (alive) setNotice({ tone: "error", text: messageFrom(error, "PayPal and Venmo could not initialize.") });
      }
    })();

    return () => {
      alive = false;
      paypalContainer.replaceChildren();
      venmoContainer.replaceChildren();
    };
  }, [config?.paypalConfigured]);

  async function startStripe() {
    setBusy("stripe");
    setNotice(null);
    try {
      const session = await createStripeCheckoutSession({ data: buildRef.current });
      window.location.assign(session.url);
    } catch (error) {
      setBusy(null);
      setNotice({ tone: "error", text: messageFrom(error, "Card checkout could not start. Please try again.") });
    }
  }

  const toneClass = notice?.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : notice?.tone === "error" ? "border-red-200 bg-red-50 text-red-950" : "border-stage-line bg-stage text-stage-ink";

  return (
    <section id="checkout-payment" className="mt-5 rounded-2xl border border-stage-line bg-white p-4 shadow-[0_14px_36px_rgba(45,38,30,0.06)] sm:p-5" aria-label="Payment options">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-stage-muted uppercase">Secure checkout</p>
          <h3 className="mt-1 font-display text-2xl leading-tight text-stage-ink">Choose how you want to pay</h3>
        </div>
        <p className="shrink-0 text-xl font-semibold tabular-nums text-stage-ink">${total.toFixed(2)}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-stage-muted">Your build and pricing stay exactly as reviewed. A digital proof is still required before production.</p>

      {notice && <div className={`mt-4 rounded-xl border px-3 py-3 text-sm leading-6 ${toneClass}`}>{notice.text}</div>}

      <div className="mt-4 grid gap-3">
        <Button type="button" className="min-h-12 w-full" onClick={() => void startStripe()} disabled={!config?.stripeConfigured || busy !== null}>
          {busy === "stripe" ? "Opening secure checkout…" : config?.stripeConfigured ? `Pay $${total.toFixed(2)} securely` : "Card checkout setup pending"}
        </Button>
        <p className="text-xs leading-5 text-stage-muted">Cards and eligible wallet options such as Apple Pay, Google Pay, and Link are presented by Stripe when available.</p>
      </div>

      <div className="my-5 flex items-center gap-3 text-[11px] font-semibold tracking-[0.14em] text-stage-muted uppercase before:h-px before:flex-1 before:bg-stage-line after:h-px after:flex-1 after:bg-stage-line">or</div>

      <div className="grid gap-3">
        <div ref={paypalRef} className="min-h-0" aria-label="PayPal checkout" />
        <div ref={venmoRef} className="min-h-0" aria-label="Venmo checkout" />
        {!config?.paypalConfigured && <p className="rounded-xl bg-stage px-3 py-3 text-sm leading-6 text-stage-muted">PayPal / Venmo setup is pending. It will appear here automatically once the secure business connection is enabled.</p>}
      </div>

      <details className="mt-4 rounded-xl border border-stage-line bg-stage/55 px-3 py-2.5">
        <summary className="cursor-pointer text-sm font-semibold text-stage-ink">Manual Venmo fallback</summary>
        <p className="mt-2 text-xs leading-5 text-stage-muted">Use this only if the automated payment buttons are unavailable. Manual Venmo payments do not update checkout status automatically.</p>
        <a className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href={MANUAL_VENMO_URL} target="_blank" rel="noreferrer">Pay manually with Venmo</a>
      </details>
      {busy === "verify" && <p className="mt-3 text-sm text-stage-muted">Verifying your payment…</p>}
    </section>
  );
}
