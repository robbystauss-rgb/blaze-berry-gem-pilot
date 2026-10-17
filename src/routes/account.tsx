import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useSyncExternalStore } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { getMyOrders } from "@/lib/commerce/public";
import { getMerchantAccess } from "@/lib/commerce/api";
import { label, money } from "@/lib/commerce/types";
import { getOwnReorderLines, getReorderIntent } from "@/lib/commerce/reorder-api";
import type { ReorderIntent, ReorderLine } from "@/lib/commerce/reorder-types";
import { useOrder } from "@/lib/order-store";
export const Route = createFileRoute("/account")({
  component: Account,
  head: () => ({
    meta: [
      { title: "My account · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
const subscribeHydration = () => () => {};
function Account() {
  const { user } = useCurrentUserState();
  // Better Auth may already have a cached browser session while SSR has no
  // session snapshot. Keep the initial HTML stable until hydration completes.
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  if (!hydrated)
    return (
      <section className="site-container page-top-space page-bottom-space">
        <h1 className="font-display text-4xl">My account</h1>
        <p role="status">Checking your account…</p>
      </section>
    );
  // Remount account data when identity changes so another session never sees a
  // previous user's cached orders or repeat-order intents while reads finish.
  return <AccountWorkspace key={user?.id ?? "signed-out"} />;
}
function AccountWorkspace() {
  const { user, isPending } = useCurrentUserState();
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof getMyOrders>> | null>(null);
  const [error, setError] = useState("");
  const [merchant, setMerchant] = useState<Awaited<ReturnType<typeof getMerchantAccess>> | null>(
    null,
  );
  useEffect(() => {
    if (user)
      void getMyOrders()
        .then(setOrders)
        .catch((e) => setError(e.message));
  }, [user?.id]);
  useEffect(() => {
    if (user)
      void getMerchantAccess()
        .then(setMerchant)
        .catch(() => setMerchant(null));
  }, [user?.id]);
  return (
    <section className="site-container page-top-space page-bottom-space">
      <h1 className="font-display text-4xl">My account</h1>
      {isPending ? (
        <p role="status">Checking your account…</p>
      ) : !user ? (
        <Link to="/login" className="cc-button mt-6">
          Sign in
        </Link>
      ) : (
        <div className="mt-6 space-y-6">
          <p>{user.displayName}</p>
          <UserButton />
          <p className="text-xs text-muted">Account ID: {user.id}</p>
          {merchant && (
            <Link
              to="/admin"
              search={{ section: merchant.role === "production" ? "production" : "overview" }}
              className="cc-button secondary"
            >
              Owner / staff workspace
            </Link>
          )}
          {error && (
            <p role="alert" className="cc-error">
              {error}
            </p>
          )}
          <h2 className="font-display text-2xl">Your orders</h2>
          {orders === null ? (
            <p role="status">Loading your orders…</p>
          ) : orders.length ? (
            <div className="cc-panel cc-records">
              {orders.map((o) => (
                <div key={o.id} className="flex-wrap">
                  <span>
                    #{o.number} · {o.titles}
                    <small>{new Date(o.created_at).toLocaleString()}</small>
                  </span>
                  <RepeatOrderOptions orderId={o.id} />
                  <span>
                    {label(o.stage)} · {label(o.payment_status)}
                    <small>{money(o.total)}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p>
              No orders have been linked to this authenticated account. Guest orders require
              ownership verification; a matching email alone does not grant access.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function RepeatOrderOptions({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const [lines, setLines] = useState<ReorderLine[] | null>(null),
    [intent, setIntent] = useState<ReorderIntent | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="w-full space-y-3">
      <button
        type="button"
        className="cc-button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setLines(await getOwnReorderLines({ data: orderId }));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Your previous options could not load.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Checking previous options…" : "Review repeat options"}
      </button>
      {lines && (
        <div className="space-y-3" aria-label="Previous order items">
          <p className="text-sm leading-6 text-muted">
            Restore an available custom item, review its current price, then check the design in the
            builder.
          </p>
          {lines.map((line) => (
            <div key={line.id} className="rounded-xl border border-border p-4">
              <p className="text-sm leading-6">
                {line.title} · quantity {line.quantity}
              </p>
              {line.supported ? (
                <button
                  type="button"
                  className="cc-button secondary mt-2"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    setIntent(null);
                    try {
                      setIntent(await getReorderIntent({ data: line.id }));
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "This item needs a new quote.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Check current availability & price
                </button>
              ) : (
                <p className="text-sm leading-6 text-muted">
                  This older or quoted item needs a new request to the shop; its options will not be
                  guessed.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {intent && (
        <div
          className="rounded-xl border border-border bg-surface p-4 text-sm leading-6"
          role="status"
        >
          <p>
            {intent.settings.orderType === "hat"
              ? `Richardson ${intent.settings.family} · ${intent.settings.colorway}`
              : "Patch only"}{" "}
            · {intent.settings.patchShape} · {intent.settings.patchSize}
          </p>
          <p>
            Current quote: {money(intent.quote.unitCents)} each · {money(intent.quote.totalCents)}{" "}
            items total for {intent.settings.quantity}
          </p>
          <p>{intent.notice}</p>
          <button
            type="button"
            className="cc-button mt-3"
            onClick={async () => {
              const current = useOrder.getState();
              if (
                (current.artworkDataUrl || current.patchText || current.customerName) &&
                !window.confirm(
                  "Replace your current unsent builder draft with these options? Your previous order stays unchanged.",
                )
              )
                return;
              current.restoreReorder(intent.settings, intent.notice);
              await navigate({ to: "/order", search: {} });
            }}
          >
            Open builder to review
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="cc-error">
          {error}
        </p>
      )}
    </div>
  );
}
