import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, signIn, GROK_PROVIDERS } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
export const Route = createFileRoute("/login")({ component: Login });
function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, isPending } = useCurrentUserState();
  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-bg-elevated p-6">
        <p className="tech-label">REC Mama Made</p>
        <h1 className="mt-2 font-display text-3xl">Account sign in</h1>
        {isPending ? (
          <p role="status">Checking session…</p>
        ) : user ? (
          <div className="mt-6 space-y-4">
            <p>Signed in as {user.displayName}</p>
            <Link to="/account" className="cc-button">
              Open account
            </Link>
            <UserButton />
          </div>
        ) : (
          <>
            <form
              className="mt-6 space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(e.currentTarget);
                try {
                  const result = await authClient.signIn.email({
                    email: String(form.get("email")),
                    password: String(form.get("password")),
                    callbackURL: "/account",
                  });
                  if (result.error) throw new Error(result.error.message);
                  window.location.assign("/account");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Sign in failed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="cc-field">
                Email
                <input name="email" type="email" autoComplete="username" required />
              </label>
              <label className="cc-field">
                Password
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button className="cc-button" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <div className="mt-5 space-y-2">
              {GROK_PROVIDERS.map((p) => (
                <button
                  className="cc-button secondary w-full"
                  key={p.providerId}
                  onClick={() =>
                    void signIn(p.providerId, { callbackURL: "/account" }).catch((e) =>
                      setError(e.message),
                    )
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm text-muted">
              Merchant access is granted by the owner. Signing in does not create an admin account.
            </p>
          </>
        )}
        {error && (
          <p className="cc-error mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
