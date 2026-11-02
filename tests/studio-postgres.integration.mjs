// Explicit opt-in rehearsal on an EMPTY disposable PostgreSQL database.
// Remote targets reuse the existing pinned-preview and verified-TLS safety gate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import { createServer } from "vite";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { previewDatabaseConfiguration } from "../scripts/preview-database.mjs";

const url = process.env.REC_STUDIO_PG_VERIFY_URL;
test(
  "PostgreSQL migrations, persisted phone designs, receipt retries, proofs and financial holds",
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
      for (const name of names.filter((name) => name >= "0018")) {
        await client.query("begin");
        await client.query(readFileSync("migrations/" + name, "utf8"));
        await client.query("rollback");
        await client.query("begin");
        await client.query(readFileSync("migrations/" + name, "utf8"));
        await client.query("insert into _migrations(name) values($1)", [name]);
        await client.query("commit");
      }
      assert.equal(
        (await client.query("select amount from commerce_payments where id='pg-old-payment'"))
          .rows[0].amount,
        1200,
      );
      check(
        "0018/0019 rehearse transaction rollback, apply additively and preserve original payment",
      );
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
      const studioReceipt = {
        id: orderId,
        amount: (await core.orderById(sql, orderId)).total,
        method: "venmo",
        reference: "TEST-PG-receipt-" + randomUUID(),
        reason: "TEST ONLY independently verified external receipt",
        occurredAt: new Date(Date.now() - 60000).toISOString(),
        requestId: randomUUID(),
      };
      const studioPayments = await Promise.all([
        mutations.mutate("payment.manual", studioReceipt, owner),
        mutations.mutate("payment.manual", studioReceipt, owner),
      ]);
      assert.equal(studioPayments[0].receiptId, studioPayments[1].receiptId);
      assert.ok(studioPayments.some((payment) => payment.duplicate));
      assert.equal(
        (await sql`select count(*)::int n from commerce_payments where order_id=${orderId}`)[0].n,
        1,
      );
      const studioDisputeReference = "TEST-PG-dispute-" + randomUUID();
      await sql`insert into commerce_disputes(reference,order_id,state) values(${studioDisputeReference},${orderId},'needs_response')`;
      await assert.rejects(advance, /open payment dispute/);
      await sql`update commerce_disputes set state='won' where reference=${studioDisputeReference}`;
      await advance();
      assert.equal((await core.orderById(sql, orderId)).stage, "engraving");
      check(
        "Concurrent external receipt retries persist once; an open dispute holds production until resolution while proof approval remains independent",
      );
      const texting = await server.ssrLoadModule("/src/lib/commerce/studio-text.server.ts");
      const contactBefore = await texting.readStudioContact(invoiceId, owner);
      await texting.saveStudioContact(
        { id: invoiceId, version: contactBefore.version, phone: "5045550123" },
        owner,
      );
      await assert.rejects(
        () =>
          texting.saveStudioContact(
            { id: invoiceId, version: contactBefore.version, phone: "5045550124" },
            owner,
          ),
        /phone changed/,
      );
      const connection = new pg.Client({ connectionString: url });
      await connection.connect();
      try {
        assert.equal(
          (
            await connection.query(
              "select c.phone_normalized from commerce_studio_documents d join commerce_orders o on o.id=d.order_id join commerce_customers c on c.id=o.customer_id where d.id=$1",
              [invoiceId],
            )
          ).rows[0].phone_normalized,
          "+15045550123",
        );
        assert.equal(
          (await connection.query("select count(*)::int n from commerce_customer_contacts")).rows[0]
            .n,
          0,
          "linked profile contact is not duplicated into the legacy email-keyed table",
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
      const crm = await server.ssrLoadModule("/src/lib/commerce/customers.server.ts");
      const schema = await server.ssrLoadModule("/src/lib/commerce/customer-schemas.ts");
      const customerId = randomUUID(),
        assetId = randomUUID(),
        designId = randomUUID();
      await crm.saveCustomer(
        schema.saveCustomerSchema.parse({
          id: customerId,
          version: 0,
          body: { name: "TEST PostgreSQL caller", email: null, phone: "+15045550129" },
          reviewedDuplicate: true,
        }),
        owner,
      );
      const original = await sharp({
        create: {
          width: 900,
          height: 600,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
      await crm.uploadCustomerArtwork(
        {
          id: assetId,
          customerId,
          name: "TEST ORIGINAL.png",
          data: "data:image/png;base64," + original.toString("base64"),
          provenance: "TEST ONLY owner-supplied original",
        },
        owner,
      );
      const configuration = {
        orderType: "hat",
        modelId: "112",
        variantId: "112:black",
        leatherette: "buckskin",
        patchShape: "Circle",
        patchSize: "medium",
        physicalInches: { width: 2.5, height: 2.5 },
        placement: "front-center",
        patchPosition: { version: 2, anchor: { x: 0.5, y: 0.5 } },
        patchText: "TEST",
        quantity: 2,
        notes: "TEST private preference",
        previewSnapshot: null,
      };
      await crm.saveCustomerDesign(
        {
          id: designId,
          customerId,
          version: 0,
          name: "TEST PostgreSQL exact 112",
          configuration,
          artworkAssetId: assetId,
          note: "Original intake",
        },
        owner,
      );
      const price = await crm.quotePhoneOrder({ customerId, configuration }, owner);
      const request = {
        requestId: randomUUID(),
        customerId,
        designId,
        revision: 1,
        configuration,
        artworkAssetId: assetId,
        expectedTotal: price.totalCents,
        expectedPriceRevision: price.priceRevision,
        expectedPreviewSignature: price.previewSignature,
        shipping: 0,
        tax: 0,
        chargesReviewed: true,
      };
      const drafts = await Promise.all([
        crm.createPhoneOrder(request, owner),
        crm.createPhoneOrder(request, owner),
      ]);
      assert.equal(drafts[0].id, drafts[1].id);
      const receipt = {
        id: drafts[0].id,
        requestId: randomUUID(),
        amount: price.totalCents,
        method: "venmo",
        reference: "TEST PG " + randomUUID(),
        reason: "Independently verified TEST receipt only",
        occurredAt: new Date().toISOString(),
      };
      const payments = await Promise.all([
        mutations.mutate("payment.manual", receipt, owner),
        mutations.mutate("payment.manual", receipt, owner),
      ]);
      assert.equal(
        (await sql`select count(*)::int n from commerce_payments where order_id=${drafts[0].id}`)[0]
          .n,
        1,
      );
      assert.ok(payments.some((result) => result.duplicate));
      assert.equal((await crm.readCustomer(customerId, owner)).profile.email, null);
      assert.deepEqual(Buffer.from((await crm.customerArtwork(assetId, owner)).bytes), original);
      const disputeReference = "TEST-PG-dispute-" + randomUUID();
      await sql`insert into commerce_disputes(reference,order_id,state) values(${disputeReference},${drafts[0].id},'needs_response')`;
      await assert.rejects(
        async () =>
          mutations.mutate(
            "order.update",
            {
              id: drafts[0].id,
              version: (await core.orderById(sql, drafts[0].id)).version,
              stage: "ready_for_production",
            },
            owner,
          ),
        /open payment dispute/,
      );
      await sql`update commerce_disputes set state='won' where reference=${disputeReference}`;
      await assert.rejects(
        async () =>
          mutations.mutate(
            "order.update",
            {
              id: drafts[0].id,
              version: (await core.orderById(sql, drafts[0].id)).version,
              stage: "ready_for_production",
            },
            owner,
          ),
        /proof|approval/i,
      );
      const persisted = await client.query(
        "select o.customer_email,encode(i.artwork,'hex') original from commerce_orders o join commerce_order_items i on i.order_id=o.id where o.id=$1",
        [drafts[0].id],
      );
      assert.equal(persisted.rows[0].customer_email, null);
      assert.equal(persisted.rows[0].original, original.toString("hex"));
      check(
        "Phone-only profile, private source and exact design persist through independent PostgreSQL connection; concurrent draft and receipt retries create one record; new proof remains required",
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
