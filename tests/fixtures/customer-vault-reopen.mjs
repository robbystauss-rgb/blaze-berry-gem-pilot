import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "vite";
if (
  !process.env.REC_TEST_DATABASE_DIR ||
  process.env.DATABASE_URL ||
  process.env.VERCEL ||
  process.env.STRIPE_SECRET_KEY
)
  throw Error("Only isolated durable test storage can be reopened.");
const [customerId, assetId, designId, orderId] = process.argv.slice(2);
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const db = await server.ssrLoadModule("/src/lib/db.ts"),
    sql = await db.getSql();
  const crm = await server.ssrLoadModule("/src/lib/commerce/customers.server.ts");
  const actor = { userId: "vault-test-owner", role: "owner" };
  const c = await crm.readCustomer(customerId, actor);
  assert.equal(c.profile.id, customerId);
  assert.equal(c.designs.find((d) => d.id === designId).version, 2);
  assert.equal(c.designs.find((d) => d.id === designId).configuration.variantId, "112:black");
  const bytes = (await crm.customerArtwork(assetId, actor)).bytes;
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    c.assets.find((a) => a.id === assetId).checksum,
  );
  assert.equal(
    (await sql`select count(*)::int as count from commerce_payments where order_id=${orderId}`)[0]
      .count,
    1,
  );
  console.log(
    JSON.stringify({ durableReopen: true, originalsVerified: true, revisions: 2, paidReceipts: 1 }),
  );
  await (await db.getPglite()).close();
} finally {
  await server.close();
}
