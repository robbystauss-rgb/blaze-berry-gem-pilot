// Local built-output QA. Test-only invitation uses the existing owner-setup flow.
import { spawn } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.NODE_ENV === "production" ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET
)
  throw Error("Built QA refuses persistent databases, production and provider credentials.");
const base = "http://localhost:8081",
  token = randomBytes(32).toString("base64url");
const users = Object.fromEntries(
  ["owner", "customer"].map((role) => [
    role,
    { email: `qa-built-${role}@example.invalid`, password: randomBytes(24).toString("base64url") },
  ]),
);
const child = spawn(
  process.execPath,
  ["scripts/with-app-env.mjs", process.execPath, "node_modules/vite/bin/vite.js", "preview"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BETTER_AUTH_URL:base,
      REC_OWNER_INVITE_SHA256: createHash("sha256").update(token).digest("hex"),
      REC_OWNER_INVITE_EMAIL: users.owner.email,
      REC_OWNER_INVITE_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
    },
  },
);
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(base);
    if (r.ok) {
      ready = true;
      break;
    }
  } catch {
    /* Wait for the local build server. */
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready) {
  child.kill();
  throw Error("Built preview did not become ready.");
}
for (const [role, user] of Object.entries(users)) {
  const response = await fetch(base + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ ...user, name: "TEST FIXTURE built " + role }),
  });
  if (!response.ok) {
    child.kill();
    throw Error("Built test account registration failed.");
  }
}
mkdirSync("artifacts/commerce-qa", { recursive: true });
writeFileSync(
  "artifacts/commerce-qa/built-session.json",
  JSON.stringify({ users, ownerSetupUrl: base + "/owner-setup#token=" + token }, null, 2),
);
console.log("Built QA ready. Local test credentials remain in ignored artifacts.");
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
await new Promise((r) => child.on("exit", r));
