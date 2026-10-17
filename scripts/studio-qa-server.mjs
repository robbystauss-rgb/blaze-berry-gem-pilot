// Isolated browser acceptance environment. This script is never imported by the app.
// All provider responses are explicit fixtures; no external payments or emails occur.
import { createServer } from "vite";
import Stripe from "stripe";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
for (const key of [
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "VERCEL",
  "PAYPAL_CLIENT_SECRET",
])
  if (process.env[key])
    throw Error("Studio QA refuses production, provider credentials and persistent databases.");
if (process.env.NODE_ENV === "production") throw Error("QA is development only.");
process.env.STRIPE_SECRET_KEY = "sk_test_isolated_fixture";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_isolated_fixture";
process.env.REC_INVOICE_BRANDING_VERIFIED = "true";
process.env.REC_INVOICE_SENDER = "owner@example.invalid";
process.env.RESEND_API_KEY = "re_isolated_fixture";
process.env.REC_ORDER_EMAIL_FROM = "orders@recmamamade.com";
process.env.REC_ORDER_EMAIL_TO = "owner@example.invalid";
process.env.REC_ORDER_EMAIL_SENDER_VERIFIED = "true";
const invoices = new Map(),
  customers = new Map(),
  lines = new Map(),
  messages = new Map();
const native = new Stripe(process.env.STRIPE_SECRET_KEY);
globalThis.__recStudioFixture = {
  webhooks: native.webhooks,
  accounts: {
    retrieve: async () => ({
      business_profile: { name: "REC Mama Made", support_email: process.env.REC_INVOICE_SENDER },
    }),
  },
  customers: {
    create: async (p) => {
      const c = { ...p, id: "cus_fixture_" + randomUUID() };
      customers.set(c.id, c);
      return c;
    },
    retrieve: async (id) => customers.get(id),
  },
  invoices: {
    create: async (p) => {
      const i = {
        ...p,
        id: "in_fixture_" + randomUUID(),
        currency: "usd",
        total: 0,
        status: "draft",
        customer_email: customers.get(p.customer).email,
        livemode: false,
        invoice_pdf: null,
      };
      i.hosted_invoice_url = "https://invoice.stripe.com/fixture/" + i.id;
      invoices.set(i.id, i);
      lines.set(i.id, []);
      return { ...i };
    },
    retrieve: async (id) => ({ ...invoices.get(id) }),
    listLineItems: async (id) => ({ has_more: false, data: lines.get(id) }),
    finalizeInvoice: async (id) => {
      const i = invoices.get(id);
      i.status = "open";
      return { ...i };
    },
    voidInvoice: async (id) => {
      const i = invoices.get(id);
      if (i.status === "paid") throw Error("Paid invoice cannot be voided");
      i.status = "void";
      return { ...i };
    },
  },
  invoiceItems: {
    create: async (p) => {
      const line = { ...p, id: randomUUID() };
      lines.get(p.invoice).push(line);
      invoices.get(p.invoice).total += p.amount;
      return line;
    },
  },
  invoicePayments: {
    list: async ({ invoice }) => {
      const i = invoices.get(invoice);
      return {
        has_more: false,
        data:
          i.status === "paid"
            ? [
                {
                  status: "paid",
                  amount_paid: i.total,
                  currency: "usd",
                  invoice,
                  payment: { type: "payment_intent", payment_intent: "pi_" + invoice },
                },
              ]
            : [],
      };
    },
  },
  paymentIntents: {
    retrieve: async (id) => {
      const i = invoices.get(id.slice(3));
      return { id, status: "succeeded", currency: "usd", amount_received: i.total };
    },
  },
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : (input.url ?? input));
  if (url.hostname === "api.resend.com") {
    if (init.method === "POST") {
      const p = JSON.parse(init.body);
      if (!p.to.every((x) => x.endsWith("@example.invalid")))
        throw Error("Fixture email must use .invalid recipients");
      const key = new Headers(init.headers).get("Idempotency-Key"),
        old = [...messages.values()].find((x) => x.key === key);
      if (old) return Response.json({ id: old.id });
      const m = { id: randomUUID(), key, payload: p };
      messages.set(m.id, m);
      return Response.json({ id: m.id });
    }
    const m = messages.get(url.pathname.split("/").at(-1));
    return m
      ? Response.json({ id: m.id, to: m.payload.to, last_event: "delivered" })
      : new Response("missing", { status: 404 });
  }
  if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
    return realFetch(input, init);
  throw Error("External network disabled in isolated Studio QA: " + url.hostname);
};
let fixtureHandler;
const server = await createServer({
  server: { host: "127.0.0.1", port: 8080, strictPort: true },
  plugins: [
    {
      name: "studio-qa-only-provider",
      enforce: "pre",
      configureServer(s) {
        s.middlewares.use((req, res, next) =>
          fixtureHandler ? fixtureHandler(req, res, next) : next(),
        );
      },
      transform(code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/lib/commerce/providers.server.ts"))
          return code.replace(
            "return new Stripe(secret);",
            "return globalThis.__recStudioFixture;",
          );
      },
    },
  ],
});
const { getSql } = await server.ssrLoadModule("/src/lib/db.ts");
const sql = await getSql();
fixtureHandler = async (req, res, next) => {
  if (req.url !== "/__studio-fixture") {
    next();
    return;
  }
  try {
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const { invoiceId } = JSON.parse(raw),
        i = invoices.get(invoiceId);
      if (!i || i.status !== "open") throw Error("No open fixture invoice");
      i.status = "paid";
      const payload = JSON.stringify({
          id: "evt_fixture_" + randomUUID(),
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          type: "invoice.paid",
          data: { object: { id: i.id } },
        }),
        signature = native.webhooks.generateTestHeaderString({
          payload,
          secret: process.env.STRIPE_WEBHOOK_SECRET,
        });
      const response = await realFetch("http://localhost:8080/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      });
      if (!response.ok) throw Error("Webhook failed: " + (await response.text()));
      res.end(JSON.stringify({ paid: true }));
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        documents:
          await sql`select id,kind,order_id,state,proof_version from commerce_studio_documents order by created_at`,
        orders:
          await sql`select o.id,o.stage,coalesce(sum(p.amount) filter(where p.kind='payment'),0)::int paid from commerce_orders o left join commerce_payments p on p.order_id=o.id group by o.id`,
        emails: [...messages.values()].map((m) => ({
          id: m.id,
          subject: m.payload.subject,
          text: m.payload.text,
          to: m.payload.to,
          attachments: m.payload.attachments.map((a) => ({
            filename: a.filename,
            content_type: a.content_type,
          })),
        })),
      }),
    );
  } catch (e) {
    res.statusCode = 500;
    res.end(e.message);
  }
};
await server.listen();
const users = {};
for (const role of ["owner", "manager", "customer"]) {
  const email = `studio-${role}@example.invalid`,
    password = randomBytes(18).toString("base64url");
  const r = await fetch("http://localhost:8080/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:8080" },
    body: JSON.stringify({ name: "TEST " + role, email, password }),
  });
  const p = await r.json();
  if (!r.ok || !p.user?.id) throw Error("Fixture registration failed " + JSON.stringify(p));
  users[role] = { email, password, id: p.user.id };
  if (role !== "customer")
    await sql`insert into merchant_staff(user_id,role) values(${p.user.id},${role})`;
}
await sql`insert into commerce_content(key,value) values('contact_email','owner@example.invalid'),('contact_phone','TEST FIXTURE ONLY') on conflict(key) do update set value=excluded.value`;
mkdirSync("artifacts/studio", { recursive: true });
writeFileSync("artifacts/studio/browser-session.json", JSON.stringify({ users }, null, 2));
console.log("Isolated Studio QA ready on localhost:8080. No external provider traffic.");
