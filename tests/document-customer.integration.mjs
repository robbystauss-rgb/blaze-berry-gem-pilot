import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY"])
  if (process.env[key]) throw Error("Isolated test storage only");
const owner = { userId: "document-customer-test-owner", role: "owner" };
let server, sql, studio, quotes, crm;
before(async () => {
  server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
  studio = await server.ssrLoadModule("/src/lib/commerce/studio.server.ts");
  quotes = await server.ssrLoadModule("/src/lib/commerce/quotes.server.ts");
  crm = await server.ssrLoadModule("/src/lib/commerce/customers.server.ts");
  await sql`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values(${owner.userId},'TEST OWNER','owner@example.invalid',true,now(),now())`;
  await sql`insert into merchant_staff(user_id,role) values(${owner.userId},'owner')`;
  await sql`insert into commerce_content(key,value) values('contact_email','shop@example.invalid')`;
});
after(async () => {
  await server?.close();
});
const line = () => ({
  id: randomUUID(),
  kind: "product",
  title: "TEST ONLY hat",
  quantity: 2,
  unitAmount: 3000,
  specifications: "TEST ONLY exact choices",
  productKey: "",
});
const body = (name, email) => ({
  customerName: name,
  customerEmail: email,
  billingAddress: "",
  shippingAddress: "",
  lines: [line()],
  shipping: 0,
  tax: 0,
  discount: 0,
  dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  terms: "TEST ONLY",
  notes: "TEST ONLY",
  totalsConfirmed: true,
  availabilityConfirmed: true,
  requiresProof: true,
});
async function customer(email = "caller@example.invalid") {
  const id = randomUUID(),
    name = "TEST caller " + id.slice(0, 8);
  await crm.saveCustomer(
    { id, version: 0, body: { name, email, phone: "+15045550129" }, reviewedDuplicate: true },
    owner,
  );
  return { id, name, email };
}
test("invoice selection persists the existing profile through issue without a second identity or public id", async () => {
  const c = await customer(),
    id = randomUUID();
  await studio.saveStudio(
    {
      kind: "invoice",
      id,
      version: 0,
      orderId: null,
      customerId: c.id,
      body: body(c.name, c.email),
    },
    owner,
  );
  const selected = await studio.studioOwnerDocument(id, owner);
  assert.equal(selected.document.customer_id, c.id);
  assert.equal(selected.contact.phone, "+15045550129");
  const texting = await server.ssrLoadModule("/src/lib/commerce/studio-text.server.ts");
  await texting.saveStudioContact(
    { id, version: selected.contact.version, phone: "+15045550130" },
    owner,
  );
  assert.equal((await crm.readCustomer(c.id, owner)).profile.phone_normalized, "+15045550130");
  assert.ok((await crm.readCustomer(c.id, owner)).documents.some((d) => d.id === id));
  const issued = await studio.actOnStudio({ id, version: 1, action: "issue" }, owner);
  const view = await studio.viewStudio(issued.path.split("/").at(-1));
  assert.equal(view.document.customer_id, undefined);
  const [order] =
    await sql`select customer_id,total from commerce_orders where id=${view.document.order_id}`;
  assert.equal(order.customer_id, c.id);
  assert.equal(order.total, 6000);
  assert.equal(
    (await sql`select count(*)::int n from commerce_customers where email=${c.email}`)[0].n,
    1,
  );
  assert.equal(
    (
      await sql`select required from commerce_proof_controls where order_id=${view.document.order_id}`
    )[0].required,
    true,
  );
  assert.equal(
    (
      await sql`select count(*)::int n from commerce_payments where order_id=${view.document.order_id}`
    )[0].n,
    0,
  );
});
test("quote selection survives acceptance, remains private and never copies a payment or approval", async () => {
  const c = await customer("quote-caller@example.invalid"),
    id = randomUUID(),
    b = body(c.name, c.email);
  const {
    billingAddress: _billing,
    shippingAddress: _shipping,
    discount: _discount,
    dueDate: _due,
    notes: _notes,
    requiresProof: _proof,
    ...base
  } = b;
  await quotes.saveQuote(
    {
      id,
      version: 0,
      customerId: c.id,
      body: {
        ...base,
        title: "TEST estimate",
        expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        privateNotes: "TEST internal",
      },
    },
    owner,
  );
  assert.ok((await crm.readCustomer(c.id, owner)).quotes.some((q) => q.id === id));
  const issued = await quotes.actOnQuote({ id, version: 1, action: "issue" }, owner),
    token = issued.path.split("/").at(-1);
  const view = await quotes.publicQuote(token);
  assert.equal(view.customer_id, undefined);
  await quotes.respondToQuote({ token, version: view.version, action: "accept" });
  const [row] =
    await sql`select o.customer_id,o.total from commerce_quotes q join commerce_orders o on o.id=q.order_id where q.id=${id}`;
  assert.equal(row.customer_id, c.id);
  assert.equal(row.total, 6000);
});
test("phone-only, stale, archived and unauthorized associations fail before issuing work", async () => {
  const c = await customer(null),
    id = randomUUID();
  await assert.rejects(
    () =>
      studio.saveStudio(
        {
          kind: "invoice",
          id,
          version: 0,
          orderId: null,
          customerId: c.id,
          body: body(c.name, "invented@example.invalid"),
        },
        owner,
      ),
    /phone-only/,
  );
  const valid = await customer("stale@example.invalid"),
    payload = {
      kind: "invoice",
      id: randomUUID(),
      version: 0,
      orderId: null,
      customerId: valid.id,
      body: body(valid.name, valid.email),
    };
  await assert.rejects(
    () => studio.saveStudio({ ...payload, body: body("Wrong person", valid.email) }, owner),
    /contact details changed/,
  );
  await sql`update commerce_customers set archived=true where id=${valid.id}`;
  await assert.rejects(() => studio.saveStudio(payload, owner), /active customer/);
  await assert.rejects(
    () => studio.saveStudio(payload, { ...owner, role: "production" }),
    /permission/,
  );
  assert.equal(
    (await sql`select count(*)::int n from commerce_studio_documents where id=${payload.id}`)[0].n,
    0,
  );
});
