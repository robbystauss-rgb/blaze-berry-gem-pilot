import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { inspectOwnerSetup, acceptOwnerSetup } from "@/lib/commerce/owner-setup";
export const Route = createFileRoute("/owner-setup")({ component: OwnerSetup });
function OwnerSetup() {
  const [token, setToken] = useState("");
  const [invite, setInvite] = useState<{ email: string; hasAccount: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, isPending } = useCurrentUserState();
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (!value) {
      setError("Open your private owner setup link, or sign in if setup is already complete.");
      return;
    }
    setToken(value);
    void inspectOwnerSetup({ data: { token: value } })
      .then(setInvite)
      .catch((e) => setError(e.message));
  }, []);
  const claim = async () => {
    await acceptOwnerSetup({ data: { token } });
    window.location.assign("/admin?section=security");
  };
  return (
    <section className="site-container page-top-space page-bottom-space">
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-bg-elevated p-6">
        <p className="tech-label">REC Mama Made · Private invitation</p>
        <h1 className="mt-2 font-display text-3xl">Set up owner access</h1>
        {error && (
          <p role="alert" className="cc-error mt-4">
            {error}
          </p>
        )}
        {!invite && !error && (
          <p role="status" className="mt-6">
            Checking your invitation…
          </p>
        )}
        {invite && (
          <>
            <p className="mt-4 text-sm">
              This single-use invitation grants owner access to {invite.email}.
            </p>
            {isPending ? (
              <p role="status">Checking session…</p>
            ) : user ? (
              <div className="mt-6 space-y-4">
                <p>Signed in as {user.displayName}.</p>
                <button
                  className="cc-button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await claim();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Setup failed.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Saving…" : "Activate owner access"}
                </button>
                <button
                  className="cc-button secondary"
                  disabled={busy}
                  onClick={() => void authClient.signOut()}
                >
                  Sign out to use another account
                </button>
              </div>
            ) : (
              <form
                className="mt-6 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  const form = new FormData(e.currentTarget);
                  try {
                    const credentials = {
                      email: invite.email,
                      password: String(form.get("password")),
                    };
                    const result = invite.hasAccount
                      ? await authClient.signIn.email(credentials)
                      : await authClient.signUp.email({
                          ...credentials,
                          name: String(form.get("name")),
                        });
                    if (result.error)
                      throw new Error(result.error.message ?? "Account sign in failed.");
                    await claim();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Setup failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {!invite.hasAccount && (
                  <label className="cc-field">
                    Your name
                    <input name="name" autoComplete="name" required maxLength={120} />
                  </label>
                )}
                <label className="cc-field">
                  Email
                  <input type="email" value={invite.email} readOnly autoComplete="username" />
                </label>
                <label className="cc-field">
                  {invite.hasAccount ? "Existing password" : "Choose your password"}
                  <input
                    name="password"
                    type="password"
                    autoComplete={invite.hasAccount ? "current-password" : "new-password"}
                    minLength={invite.hasAccount ? undefined : 12}
                    maxLength={128}
                    required
                  />
                </label>
                <button className="cc-button" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : invite.hasAccount
                      ? "Sign in and activate owner access"
                      : "Create account and activate owner access"}
                </button>
                {!invite.hasAccount && (
                  <p className="text-sm text-muted">
                    Choose at least 12 characters. After setup, enroll your authenticator in
                    Security.
                  </p>
                )}
              </form>
            )}
          </>
        )}
        <p className="mt-6 text-sm">
          <Link to="/login">Return to sign in</Link>
        </p>
      </div>
    </section>
  );
}
