// Isolated browser QA only. Not imported by any application route or deployment.
import { createServer } from "vite";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
if (
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.NODE_ENV === "production" ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.PAYPAL_CLIENT_SECRET
)
  throw Error("QA server refuses persistent databases, production, and payment credentials.");
const ownerSetupToken = randomBytes(32).toString("base64url");
process.env.REC_OWNER_INVITE_SHA256 = createHash("sha256").update(ownerSetupToken).digest("hex");
process.env.REC_OWNER_INVITE_EMAIL = "qa-invited-owner@example.invalid";
process.env.REC_OWNER_INVITE_EXPIRES_AT = new Date(Date.now() + 3600000).toISOString();
process.env.ADMIN_MFA_ENCRYPTION_KEY = randomBytes(32).toString("hex");
const server = await createServer({ server: { host: "0.0.0.0", port: 8080, strictPort: true } });
await server.listen();
const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");
const sql = await getSql();
const core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
const { mutate } = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
const users = {};
for (const role of ["owner", "manager", "production", "customer"]) {
  const password = randomBytes(18).toString("base64url");
  const email = `qa-${role}@example.invalid`;
  const response = await fetch("http://localhost:8080/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8080" },
    body: JSON.stringify({ name: "TEST FIXTURE " + role, email, password }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.user?.id)
    throw Error("Test account registration failed: " + JSON.stringify(payload));
  users[role] = { email, password, id: payload.user.id };
  if (role !== "customer")
    await sql`insert into merchant_staff(user_id,role) values(${payload.user.id},${role})`;
}
const actor = { userId: users.owner.id, role: "owner" };
const { id: orderId } = await mutate(
  "order.draft",
  {
    customerName: "TEST FIXTURE — Custom Hat Buyer",
    customerEmail: "qa-customer@example.invalid",
    title: "TEST FIXTURE — Richardson 112 Black custom hat",
    quantity: 2,
    unitAmount: 3000,
    specifications:
      "Model 112, Black, Rounded Rectangle, Medium, Buckskin leatherette; customer artwork and production proof required.",
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    requestId: randomUUID(),
  },
  actor,
);
await sql`update commerce_orders set assigned_to=${users.production.id},customer_user_id=${users.customer.id} where id=${orderId}`;
await sql.transaction((tx) =>
  core.recordPayment(tx, {
    orderId,
    provider: "sandbox_fixture",
    reference: "TEST-FIXTURE-" + randomUUID(),
    kind: "payment",
    amount: 6000,
    occurredAt: new Date().toISOString(),
    actor: actor.userId,
    reason: "Isolated browser test; no real money received",
  }),
);
await mutate(
  "order.note",
  { id: orderId, body: "TEST FIXTURE — Review original artwork before production." },
  actor,
);
const { id: unpaidOrderId } = await mutate(
  "order.draft",
  {
    customerName: "TEST FIXTURE — Unpaid Buyer",
    customerEmail: "unpaid@example.invalid",
    title: "TEST FIXTURE — Loose custom patches",
    quantity: 1,
    unitAmount: 500,
    specifications: "Loose patch, medium, supplied text",
    dueAt: null,
    requestId: randomUUID(),
  },
  actor,
);
const { id: inventoryId } = await mutate(
  "inventory.create",
  {
    sku: "TEST-112-BLACK",
    title: "TEST FIXTURE — 112 Black blanks",
    category: "blank_hat",
    threshold: 3,
  },
  actor,
);
await mutate(
  "inventory.adjust",
  {
    id: inventoryId,
    version: 1,
    delta: 12,
    reason: "TEST FIXTURE — verified test count",
    requestId: randomUUID(),
  },
  actor,
);
await mutate(
  "inventory.create",
  {
    sku: "TEST-UNKNOWN",
    title: "TEST FIXTURE — Material needs setup",
    category: "leatherette",
    threshold: 0,
  },
  actor,
);
await mutate(
  "product.save",
  {
    title: "TEST FIXTURE — Finished hat",
    description: "Isolated QA product. This is not a live business listing.",
    category: "Finished hats",
    state: "draft",
    images: ["/brand/rec-mama-made-louisiana-logo.jpeg"],
    variants: [
      { title: "Black", sku: "TEST-FINISHED-BLACK", price: 3000, active: true, options: {} },
    ],
  },
  actor,
);
mkdirSync("artifacts/commerce-qa", { recursive: true });
writeFileSync(
  "artifacts/commerce-qa/session.json",
  JSON.stringify(
    {
      users,
      orderId,
      unpaidOrderId,
      inventoryId,
      ownerSetupUrl: `http://localhost:8080/owner-setup#token=${ownerSetupToken}`,
    },
    null,
    2,
  ),
);
console.log(
  "Isolated QA server ready. Test-only account details written to ignored artifacts/commerce-qa/session.json.",
);
