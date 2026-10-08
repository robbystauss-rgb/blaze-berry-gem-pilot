import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { getMyOrders } from "@/lib/commerce/public";
import { getMerchantAccess } from "@/lib/commerce/api";
import { label, money } from "@/lib/commerce/types";
export const Route = createFileRoute("/account")({
  component: Account,
  head: () => ({
    meta: [
      { title: "My account · REC Mama Made" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});
function Account() {
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
                <div key={o.id}>
                  <span>
                    #{o.number} · {o.titles}
                    <small>{new Date(o.created_at).toLocaleString()}</small>
                  </span>
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
