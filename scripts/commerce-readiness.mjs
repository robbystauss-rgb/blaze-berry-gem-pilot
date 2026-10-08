// Read-only provider/database inspection using hosting-injected credentials.
// Never prints keys, customer details, payment references or webhook secrets.
import Stripe from "stripe";
import pg from "pg";
if (process.env.REC_OPERATIONS_INSPECT !== "approved")
  throw new Error("Explicit operations inspection is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const owner = await pool.query(
    "select count(*)::int as owners,count(*) filter(where exists(select 1 from commerce_mfa m where m.user_id=s.user_id and m.enabled))::int as protected from merchant_staff s where s.active and s.role='owner'",
  );
  const counts = await pool.query(
    "select (select count(*)::int from commerce_orders) as orders,(select count(*)::int from commerce_payments) as receipts,(select count(*)::int from commerce_inventory where on_hand is not null) as counted_inventory",
  );
  console.log(
    "[operations-readiness]",
    JSON.stringify({ owner: owner.rows[0], records: counts.rows[0] }),
  );
} finally {
  await pool.end();
}
if (process.env.STRIPE_SECRET_KEY) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const account = await stripe.accounts.retrieve();
  if (account.id !== process.env.STRIPE_ACCOUNT_ID)
    throw new Error("Configured payment account does not match the provider.");
  const endpoints = [];
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 }))
    endpoints.push({
      id: endpoint.id,
      url: endpoint.url,
      status: endpoint.status,
      livemode: endpoint.livemode,
      events: endpoint.enabled_events,
    });
  const history = await stripe.checkout.sessions.list({ limit: 1 });
  console.log(
    "[operations-readiness]",
    JSON.stringify({
      stripe: {
        accountMatches: true,
        businessName: account.business_profile?.name ?? null,
        supportEmail: account.business_profile?.support_email ?? null,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        endpoints,
        checkoutHistoryPresent: history.data.length > 0,
        checkoutHistoryHasMore: history.has_more,
      },
    }),
  );
}
