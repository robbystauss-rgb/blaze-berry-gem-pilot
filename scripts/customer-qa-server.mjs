// Local, durable browser acceptance harness. No deployed application imports it.
import { createServer } from "vite";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
for (const key of [
  "DATABASE_URL",
  "VERCEL",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
  "PAYPAL_CLIENT_SECRET",
  "REC_TEST_DATABASE_DIR",
])
  if (process.env[key])
    throw Error("Customer QA refuses production, database URLs and provider credentials.");
if (process.env.NODE_ENV === "production") throw Error("Customer QA is development only.");
mkdirSync("artifacts/commerce-qa", { recursive: true });
process.env.REC_TEST_DATABASE_DIR = resolve("artifacts/commerce-qa/customer-browser-database");
const saved = "artifacts/commerce-qa/customer-browser-session.json";
const users = existsSync(saved) ? JSON.parse(readFileSync(saved, "utf8")).users : {};
const server = await createServer({ server: { host: "0.0.0.0", port: 8080, strictPort: true } });
await server.listen();
const db = await server.ssrLoadModule("/src/lib/db.ts"),
  sql = await db.getSql();
for (const role of ["owner", "manager", "production", "customer"]) {
  if (users[role] && (await sql`select id from "user" where id=${users[role].id}`).length) continue;
  const password = randomBytes(24).toString("base64url"),
    email = `customer-qa-${role}@example.invalid`;
  const response = await fetch("http://localhost:8080/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8080" },
    body: JSON.stringify({ name: "TEST ONLY " + role, email, password }),
  });
  const body = await response.json();
  if (!response.ok || !body.user?.id) throw Error("Isolated QA registration failed.");
  users[role] = { email, password, id: body.user.id };
  if (role !== "customer")
    await sql`insert into merchant_staff(user_id,role) values(${body.user.id},${role})`;
}
writeFileSync(saved, JSON.stringify({ users, durableTestStorage: true }, null, 2));
console.log(
  "Customer QA ready with durable local test storage. Credentials are in ignored artifacts/commerce-qa/customer-browser-session.json.",
);
const stop = async () => {
  await server.close();
  await (await db.getPglite()).close();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
