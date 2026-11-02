import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  COMMERCE_TARGET,
  COMMERCE_BASELINE,
  COMMERCE_MIGRATIONS,
  commerceReleaseConfiguration,
  commerceReleasePlan,
  runCommerceRelease,
} from "./release-commerce-upgrade.mjs";

const sha = "a".repeat(40);
const env = {
  REC_MIGRATION_TARGET: COMMERCE_TARGET,
  REC_COMMERCE_RELEASE_SCOPE: "receipts",
  VERCEL_ENV: "production",
  DATABASE_NEON_PROJECT_ID: "damp-glitter-64854598",
  REC_RELEASE_COMMIT_SHA: sha,
  VERCEL_GIT_COMMIT_SHA: sha,
  DATABASE_URL: "postgres://test-only.invalid/not-connected",
  REC_COMMERCE_BACKUP_VERIFIED_SHA: sha,
  REC_COMMERCE_BACKUP_REFERENCE: "backup-TEST-RESTORED",
};
const entries = [...COMMERCE_BASELINE, ...COMMERCE_MIGRATIONS];

test("commerce release is inert by default and requires commit, project, scope and verified backup", async () => {
  const connect = () => {
    throw Error("Must not connect");
  };
  for (const target of [undefined, "disabled", "production-approved", "studio-native-text-2026-10"])
    assert.deepEqual(await runCommerceRelease({ env: { REC_MIGRATION_TARGET: target }, connect }), {
      skipped: true,
    });
  assert.equal(
    commerceReleaseConfiguration(env).schema,
    "rec_release_backup_" + sha.slice(0, 16) + "_receipts",
  );
  for (const patch of [
    { VERCEL_ENV: "preview" },
    { DATABASE_NEON_PROJECT_ID: "different-project" },
    { REC_RELEASE_COMMIT_SHA: "b".repeat(40) },
    { REC_COMMERCE_RELEASE_SCOPE: "all" },
    { REC_COMMERCE_BACKUP_VERIFIED_SHA: "b".repeat(40) },
    { REC_COMMERCE_BACKUP_REFERENCE: "" },
  ])
    await assert.rejects(
      () => runCommerceRelease({ env: { ...env, ...patch }, connect }),
      /Approved release|Release refused/,
    );
});

test("receipts and core have separate reviewed migration scopes with no gaps or downgrade", () => {
  assert.deepEqual(
    commerceReleasePlan(entries, COMMERCE_BASELINE, "receipts").map((p) => p.name),
    [COMMERCE_MIGRATIONS[0]],
  );
  const receiptBaseline = entries.slice(0, -1);
  assert.deepEqual(
    commerceReleasePlan(entries, receiptBaseline, "core").map((p) => p.name),
    [COMMERCE_MIGRATIONS[1]],
  );
  assert.deepEqual(commerceReleasePlan(entries, receiptBaseline, "receipts"), []);
  assert.deepEqual(commerceReleasePlan(entries, entries, "core"), []);
  for (const [files, history, selected] of [
    [entries, COMMERCE_BASELINE, "core"],
    [entries, entries, "receipts"],
    [entries, COMMERCE_BASELINE.slice(1), "receipts"],
    [[...entries, "0020_unreviewed.sql"], COMMERCE_BASELINE, "receipts"],
    [entries, [...COMMERCE_BASELINE, COMMERCE_BASELINE[0]], "receipts"],
    [entries.slice(0, -1), receiptBaseline, "core"],
  ])
    assert.throws(() => commerceReleasePlan(files, history, selected), /Release refused/);
});

test("scoped releases retain original art and ledger, create private snapshots and retry without duplication", async () => {
  const db = new PGlite();
  await db.waitReady;
  const client = {
    async query(text, parameters) {
      return parameters ? db.query(text, parameters) : (await db.exec(text)).at(-1) || { rows: [] };
    },
  };
  try {
    await db.exec(
      "create table _migrations(name text primary key,applied_at timestamptz default now())",
    );
    for (const name of COMMERCE_BASELINE) {
      await db.exec(await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"));
      await db.query("insert into _migrations(name) values ($1)", [name]);
    }
    await db.exec(`insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total) values('test-original','TEST ONLY','test@example.invalid','test_fixture',900,900);
      insert into commerce_order_items(id,order_id,product_key,title,quantity,fulfilled_quantity,unit_amount,specifications,artwork,artwork_type) values('test-original-art','test-original','test','TEST ONLY',1,1,900,'{}','\\x00ff1020','image/png');
      insert into commerce_payments(id,order_id,provider,reference,kind,amount,occurred_at) values('test-receipt','test-original','manual','TEST-original-receipt','payment',900,now())`);
    const logs = [];
    const options = (patch = {}) => ({
      env: { ...env, ...patch },
      connect: async () => client,
      log: (...parts) => logs.push(parts.join(" ")),
    });
    const receipt = await runCommerceRelease(options());
    assert.equal(receipt.applied, 1);
    assert.equal(
      (await db.query("select to_regclass('commerce_customers') name")).rows[0].name,
      null,
    );
    assert.deepEqual(await runCommerceRelease(options()), { applied: 0 });
    const core = await runCommerceRelease(options({ REC_COMMERCE_RELEASE_SCOPE: "core" }));
    assert.equal(core.applied, 1);
    assert.notEqual(core.snapshot.schema, receipt.snapshot.schema);
    assert.equal(
      (
        await db.query(
          "select encode(artwork,'hex') original from commerce_order_items where id='test-original-art'",
        )
      ).rows[0].original,
      "00ff1020",
    );
    assert.equal(
      (await db.query("select amount from commerce_payments where id='test-receipt'")).rows[0]
        .amount,
      900,
    );
    assert.equal((await db.query("select count(*)::int n from commerce_customers")).rows[0].n, 1);
    assert.deepEqual(await runCommerceRelease(options({ REC_COMMERCE_RELEASE_SCOPE: "core" })), {
      applied: 0,
    });
    for (const release of [receipt, core]) {
      const rows = (
        await db.query(
          `select snapshot_table,verified from ${release.snapshot.schema}.__manifest where source_table='commerce_order_items'`,
        )
      ).rows;
      assert.equal(rows[0].verified, true);
      assert.equal(
        (
          await db.query(
            `select encode(artwork,'hex') original from ${release.snapshot.schema}."${rows[0].snapshot_table}" where id='test-original-art'`,
          )
        ).rows[0].original,
        "00ff1020",
      );
      assert.equal(
        (
          await db.query("select nspacl::text acl from pg_namespace where nspname=$1", [
            release.snapshot.schema,
          ])
        ).rows[0].acl.includes("=U/"),
        false,
      );
    }
    assert.equal(logs.join("\n").includes("test@example.invalid"), false);
    assert.equal(logs.join("\n").includes(env.DATABASE_URL), false);
  } finally {
    await db.close();
  }
});
