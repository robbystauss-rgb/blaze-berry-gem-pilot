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
    `[operations-readiness] owners=${owner.rows[0].owners} enrolled_owners=${owner.rows[0].protected} orders=${counts.rows[0].orders} receipts=${counts.rows[0].receipts} counted_inventory=${counts.rows[0].counted_inventory}`,
  );
} finally {
  await pool.end();
}
if (process.env.STRIPE_SECRET_KEY) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  // Permissions are reported separately. An unavailable provider-management read
  // must not prevent unrelated inventory/security/file operations from deploying.
  const probe = async (name, work) => {
    try {
      await work();
    } catch (error) {
      console.log(
        `[operations-readiness] ${name}=unverified provider_code=${error.code ?? "unavailable"} http_status=${error.statusCode ?? "unknown"}`,
      );
    }
  };
  await probe("stripe_account", async () => {
    const account = await stripe.accounts.retrieve();
    if (account.id !== process.env.STRIPE_ACCOUNT_ID) throw new Error("Payment account mismatch");
    console.log(
      `[operations-readiness] stripe_account=verified rec_brand=${account.business_profile?.name === "REC Mama Made"} sender_configured=${!!account.business_profile?.support_email} sender_matches=${account.business_profile?.support_email === process.env.REC_INVOICE_SENDER} charges_enabled=${account.charges_enabled}`,
    );
  });
  await probe("stripe_webhooks", async () => {
    const endpoints = [];
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 }))
      endpoints.push(endpoint);
    const expected = endpoints.filter(
      (e) =>
        e.url === "https://recmamamade.com/api/webhooks/stripe" &&
        e.status === "enabled" &&
        e.livemode,
    );
    console.log(
      `[operations-readiness] stripe_webhooks=readable rec_endpoint_count=${expected.length} total_endpoints=${endpoints.length}`,
    );
    for (const endpoint of expected)
      console.log(`[operations-readiness] rec_webhook_events=${endpoint.enabled_events.join(",")}`);
  });
  await probe("stripe_checkout_history", async () => {
    const history = await stripe.checkout.sessions.list({ limit: 1 });
    console.log(
      `[operations-readiness] stripe_checkout_history=readable present=${history.data.length > 0} has_more=${history.has_more}`,
    );
  });
  await probe("stripe_payment_records", async () => {
    await stripe.paymentIntents.list({ limit: 1 });
    console.log("[operations-readiness] stripe_payment_records=readable");
  });
  await probe("stripe_invoice_records", async () => {
    await stripe.invoices.list({ limit: 1 });
    console.log("[operations-readiness] stripe_invoice_records=readable");
  });
}
