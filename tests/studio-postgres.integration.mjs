// Explicit opt-in rehearsal on an EMPTY disposable PostgreSQL database.
// Remote targets reuse the existing pinned-preview and verified-TLS safety gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { createServer } from "vite";
import { PDFDocument } from "pdf-lib";
import { previewDatabaseConfiguration } from "../scripts/preview-database.mjs";

const url = process.env.REC_STUDIO_PG_VERIFY_URL;
test(
  "0016 PostgreSQL migration, transaction rollback, persisted proofs and financial holds",
  { skip: !url },
  async () => {
    const target = new URL(url);
    if (["127.0.0.1", "localhost"].includes(target.hostname))
      assert.match(target.pathname, /^\/rec_studio_verification_[a-z0-9_]+$/);
    else {
      const config = previewDatabaseConfiguration({ ...process.env, DATABASE_URL: url });
      assert.equal(config.initialize, true, "Explicit isolated-preview initialization required");
      assert.equal(new URL(config.connectionString).searchParams.get("sslmode"), "verify-full");
    }
    for (const key of ["DATABASE_URL", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "VERCEL"])
      assert.ok(!process.env[key], "Refusing configured application/provider environment");
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    let server;
    const checks = [];
    const check = (name) => checks.push(name);
    const evidenceTarget = ["127.0.0.1", "localhost"].includes(target.hostname)
      ? target.pathname.slice(1)
      : process.env.REC_PREVIEW_DATABASE_PROJECT_ID;
    assert.match(evidenceTarget, /^[a-z0-9_-]+$/);
    const evidenceDir = "artifacts/studio/postgres/" + evidenceTarget;
    mkdirSync(evidenceDir, { recursive: true });
    try {
      assert.equal(
        (await client.query("select tablename from pg_tables where schemaname='public'")).rowCount,
        0,
        "Disposable target must be empty; existing data is never reset",
      );
      await client.query(
        "create table _migrations(name text primary key,applied_at timestamptz not null default now())",
      );
      const names = readdirSync("migrations")
        .filter((n) => /^\d{4}_.*\.sql$/.test(n))
        .sort();
      for (const name of names.filter((n) => n < "0016")) {
        await client.query("begin");
        await client.query(readFileSync("migrations/" + name, "utf8"));
        await client.query("insert into _migrations(name) values($1)", [name]);
        await client.query("commit");
      }
      await client.query(`insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values('pg-test-owner','TEST OWNER','owner@example.invalid',true,now(),now());
      insert into merchant_staff(user_id,role) values('pg-test-owner','owner');
      insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total,stage) values('pg-old-approval','TEST HISTORY','history@example.invalid','test_fixture',1200,1200,'customer_approval'),('pg-old-normal','TEST HISTORY','normal@example.invalid','test_fixture',500,500,'new');
      insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values('pg-old-item','pg-old-approval','test-old','TEST historical item',1,1,1200,'{"instructions":"original"}','\\x01020304','image/png');
      insert into commerce_payments(id,order_id,provider,reference,kind,amount,occurred_at) values('pg-old-payment','pg-old-approval','test_fixture','pg-old-reference','payment',1200,now());
      insert into commerce_content(key,value) values('contact_email','recmamamade@gmail.com');`);
      const fingerprint = async () => {
        const values = [];
        for (const table of [
          "commerce_orders",
          "commerce_order_items",
          "commerce_payments",
          "user",
        ])
          values.push([
            table,
            createHash("sha256")
              .update(
                JSON.stringify((await client.query(`select * from "${table}" order by id`)).rows),
              )
              .digest("hex"),
          ]);
        return Object.fromEntries(values);
      };
      const before = await fingerprint();
      const migration = readFileSync("migrations/0016_signature_documents.sql", "utf8");
      await client.query("begin");
      await client.query(migration);
      assert.equal(
        (await client.query("select count(*)::int n from commerce_proof_controls")).rows[0].n,
        1,
      );
      await client.query("rollback");
      assert.equal(
        (await client.query("select to_regclass('commerce_studio_documents') r")).rows[0].r,
        null,
      );
      assert.deepEqual(await fingerprint(), before);
      check(
        "Failed/precommit migration rollback leaves original schema and protected records intact",
      );
      await client.query("begin");
      await client.query(migration);
      await client.query("insert into _migrations(name) values('0016_signature_documents.sql')");
      await client.query("commit");
      assert.deepEqual(await fingerprint(), before);
      check(
        "Committed 0016 preserves exact historical orders, prices, payment rows, original artwork and customer identity",
      );
      assert.deepEqual(
        (
          await client.query(
            "select order_id,required,current_proof_id from commerce_proof_controls",
          )
        ).rows,
        [{ order_id: "pg-old-approval", required: true, current_proof_id: null }],
      );
      check("Existing approval-stage orders receive persistent production holds");
      const contactMigration = readFileSync("migrations/0017_studio_customer_contacts.sql", "utf8");
      await client.query("begin");
      await client.query(contactMigration);
      await client.query("rollback");
      assert.equal(
        (await client.query("select to_regclass('commerce_customer_contacts') as name")).rows[0]
          .name,
        null,
      );
      await client.query("begin");
      await client.query(contactMigration);
      await client.query(
        "insert into _migrations(name) values('0017_studio_customer_contacts.sql')",
      );
      await client.query("commit");
      assert.deepEqual(await fingerprint(), before);
      check("Additive 0017 rollback and commit preserve historical records");
      process.env.DATABASE_URL = url;
      server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
      const sql = await (await server.ssrLoadModule("/src/lib/db.ts")).getSql();
      const studio = await server.ssrLoadModule("/src/lib/commerce/studio.server.ts");
      const media = await server.ssrLoadModule("/src/lib/commerce/media.server.ts");
      const core = await server.ssrLoadModule("/src/lib/commerce/core.server.ts");
      const mutations = await server.ssrLoadModule("/src/lib/commerce/mutations.server.ts");
      const hold = await server.ssrLoadModule("/src/lib/commerce/proof-hold.server.ts");
      const owner = { userId: "pg-test-owner", role: "owner" };
      const invoiceId = randomUUID();
      await studio.saveStudio(
        {
          id: invoiceId,
          kind: "invoice",
          version: 0,
          orderId: null,
          body: {
            customerName: "REC Studio verification TEST ONLY",
            customerEmail: "delivered+rec-studio@resend.dev",
            billingAddress: "",
            shippingAddress: "",
            lines: [
              {
                id: randomUUID(),
                kind: "product",
                title: "TEST Richardson 112 custom hat",
                quantity: 1,
                unitAmount: 1200,
                specifications: "3 x 2 inch laser-cut leatherette; TEST ONLY",
                productKey: "",
              },
            ],
            shipping: 0,
            tax: 0,
            discount: 0,
            dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
            terms: "TEST ONLY - no production or shipment",
            notes: "Not a real customer order",
            availabilityConfirmed: true,
            totalsConfirmed: true,
            requiresProof: true,
          },
        },
        owner,
      );
      const invoice = await studio.actOnStudio(
        { id: invoiceId, version: 1, action: "issue" },
        owner,
      );
      const invoiceToken = invoice.path.split("/").at(-1);
      const view = await studio.viewStudio(invoiceToken);
      const orderId = view.document.order_id;
      const photo = await media.uploadMedia(
        {
          name: "TEST owned brand artwork.jpg",
          alt: "Test only REC Mama Made proof",
          data:
            "data:image/jpeg;base64," +
            readFileSync("public/brand/rec-mama-made-app-logo.jpg").toString("base64"),
        },
        owner,
      );
      const proofs = [];
      const response = async (p, action, message = "") =>
        studio.answerProof({
          token: p.path.split("/").at(-1),
          version: (await studio.viewStudio(p.path.split("/").at(-1))).document.version,
          action,
          name: "TEST CUSTOMER",
          email: "delivered+rec-studio@resend.dev",
          message,
          confirmed: true,
        });
      const advance = async () =>
        mutations.mutate(
          "order.update",
          {
            id: orderId,
            version: (await core.orderById(sql, orderId)).version,
            stage: "engraving",
          },
          owner,
        );
      assert.equal((await hold.proofReadiness(sql, orderId)).blocked, true);
      await assert.rejects(advance, /Full verified payment/);
      for (let v = 1; v <= 2; v++) {
        const id = randomUUID();
        await studio.saveStudio(
          {
            id,
            kind: "proof",
            version: 0,
            orderId,
            body: {
              title: "TEST Richardson 112 patch proof v" + v,
              notes: "TEST ONLY - do not produce",
              details: [
                {
                  label: "Patch dimensions",
                  value: "3 x 2 inches; laser-cut leatherette; no stitching",
                },
              ],
              mediaIds: [photo.id],
              expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            },
          },
          owner,
        );
        const p = await studio.actOnStudio({ id, version: 1, action: "issue" }, owner);
        proofs.push({ id, path: p.path });
        await response(
          p,
          v === 1 ? "changes" : "approve",
          v === 1 ? "Move patch slightly lower." : "",
        );
      }
      assert.equal(await studio.viewStudio(proofs[0].path.split("/").at(-1)), null);
      assert.equal((await hold.proofReadiness(sql, orderId)).blocked, false);
      await assert.rejects(advance, /payment|paid|balance/i);
      check(
        "Separate proof v1 revision and current v2 approval persist; stale link revoked and unpaid production remains held",
      );
      const texting = await server.ssrLoadModule("/src/lib/commerce/studio-text.server.ts");
      await texting.saveStudioContact({ id: invoiceId, version: 0, phone: "5045550123" }, owner);
      const connection = new pg.Client({ connectionString: url });
      await connection.connect();
      try {
        assert.equal(
          (await connection.query("select phone from commerce_customer_contacts")).rows[0].phone,
          "+15045550123",
        );
        assert.equal((await texting.readStudioContact(proofs[1].id, owner)).phone, "+15045550123");
        assert.equal(
          JSON.stringify(await studio.viewStudio(invoice.path.split("/").at(-1))).includes(
            "15045550123",
          ),
          false,
        );
      } finally {
        await connection.end();
      }
      check(
        "Private customer phone survives independent PostgreSQL reconnection, is reused by proof and absent from customer document data",
      );
      for (const doc of [
        { id: invoiceId, kind: "invoice" },
        ...proofs.map((p) => ({ ...p, kind: "proof" })),
      ]) {
        const file = await studio.studioBinary(doc.id, owner, null, "pdf");
        const pdf = await PDFDocument.load(file.bytes);
        assert.equal(pdf.getPage(0).getWidth(), 612);
        assert.equal(pdf.getPage(0).getHeight(), 792);
        writeFileSync(`${evidenceDir}/${doc.id}.pdf`, file.bytes);
      }
      check(
        "Invoice and both versioned proof PDFs reload from PostgreSQL as valid separate Letter documents",
      );
      const snapshot = await sql.query(
        "select id,state,response,proof_version,encode(pdf,'hex') pdf from commerce_studio_documents order by id",
      );
      writeFileSync(
        evidenceDir + "/session.private.json",
        JSON.stringify({
          invoiceId,
          invoicePath: invoice.path,
          orderId,
          proofs,
          snapshotHash: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
        }),
      );
      writeFileSync(
        evidenceDir + "/results.json",
        JSON.stringify(
          {
            outcome: "PASS",
            databaseEngine: (await client.query("select version() v")).rows[0].v,
            checks,
            historicalFingerprints: before,
            externalPaymentsVerified: false,
            externalEmailVerified: false,
          },
          null,
          2,
        ),
      );
      console.log(JSON.stringify({ checks, outcome: "PASS" }));
    } finally {
      await server?.close();
      await client.end();
      delete process.env.DATABASE_URL;
    }
  },
);
