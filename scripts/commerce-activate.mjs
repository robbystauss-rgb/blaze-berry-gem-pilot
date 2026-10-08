// Owner-approved release operations. No charges, invoices or customer messages.
import { createServer } from "vite";
import Stripe from "stripe";
import { recSession, recItems } from "./history-scope.mjs";
if (
  process.env.REC_OPERATIONS_ACTIVATE !== "approved" ||
  !process.env.DATABASE_URL ||
  process.env.BETTER_AUTH_URL !== "https://recmamamade.com"
)
  throw Error("Explicit REC operations approval and persistent production configuration required.");
const action = process.env.REC_OPERATIONS_ACTION;
if (!["register", "activate", "history"].includes(action))
  throw Error("Choose an explicit operations action.");
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { getSql } = await server.ssrLoadModule("/src/lib/db.ts"),
    sql = await getSql();
  const [owner] =
    await sql`select s.user_id from merchant_staff s join "user" u on u.id=s.user_id join commerce_mfa m on m.user_id=s.user_id and m.enabled where s.active and s.role='owner' and lower(u.email)=lower(${process.env.REC_OWNER_INVITE_EMAIL ?? ""})`;
  if (!owner)
    throw Error("No enrolled invited owner is available to attribute approved operations.");
  const actor = { userId: owner.user_id, role: "owner" };
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  if (action !== "history") {
    const ops = await server.ssrLoadModule("/src/lib/commerce/webhook-config.server.ts");
    try {
      const result = await (
        action === "register" ? ops.registerStripeWebhook : ops.activateStripeWebhook
      )(actor, stripe);
      console.log(`[operations-activation] webhook=${result.state}`);
    } catch (e) {
      console.log(
        `[operations-activation] webhook=blocked provider_code=${e.code ?? "configuration_review"} http_status=${e.statusCode ?? "unknown"}`,
      );
    }
  } else {
    const { importStripeHistory } = await server.ssrLoadModule(
      "/src/lib/commerce/reconciliation.server.ts",
    );
    let cursor,
      scanned = 0,
      eligible = 0,
      imported = 0,
      known = 0,
      review = 0,
      complete = false;
    for (let page = 0; page < 200; page++) {
      const batch = await stripe.checkout.sessions.list({
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      });
      for (const session of batch.data) {
        scanned++;
        if (!recSession(session)) continue;
        const exists =
          await sql`select order_id from commerce_checkouts where provider='stripe' and reference=${session.id}`;
        if (exists.length) {
          known++;
          continue;
        }
        if (session.metadata?.rec_order_id) {
          review++;
          continue;
        }
        try {
          const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
          if (!recItems(lines)) continue;
          eligible++;
          const result = await importStripeHistory(session.id, owner.user_id, stripe);
          if (result.imported) imported++;
          else known++;
        } catch (e) {
          review++;
          console.log(
            `[operations-activation] historical_record=review provider_code=${e.code ?? "reconciliation_required"} http_status=${e.statusCode ?? "unknown"}`,
          );
        }
      }
      if (!batch.has_more) {
        complete = true;
        break;
      }
      cursor = batch.data.at(-1)?.id;
      if (!cursor) throw Error("Provider history cursor missing.");
    }
    console.log(
      `[operations-activation] history_scanned=${scanned} rec_eligible=${eligible} imported=${imported} already_recorded=${known} review_required=${review} scan_complete=${complete}`,
    );
  }
} finally {
  await server.close();
}
process.exit(0);
