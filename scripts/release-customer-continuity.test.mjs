import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  CUSTOMER_TARGET,
  CUSTOMER_BASELINE,
  CUSTOMER_MIGRATIONS,
  customerReleaseConfiguration,
  customerReleasePlan,
  runCustomerRelease,
} from "./release-customer-continuity.mjs";
const sha = "c".repeat(40);
const env = {
  REC_MIGRATION_TARGET: CUSTOMER_TARGET,
  VERCEL_ENV: "production",
  DATABASE_NEON_PROJECT_ID: "damp-glitter-64854598",
  REC_RELEASE_COMMIT_SHA: sha,
  VERCEL_GIT_COMMIT_SHA: sha,
  DATABASE_URL: "postgres://test-only.invalid/not-connected",
  REC_COMMERCE_BACKUP_VERIFIED_SHA: sha,
  REC_COMMERCE_BACKUP_REFERENCE: "br-TEST-recovery",
};
const entries = [...CUSTOMER_BASELINE, ...CUSTOMER_MIGRATIONS];
test("customer release is opt-in, commit-bound, backup-bound and limited to migration 0020", async () => {
  const connect = () => {
    throw Error("Must not connect");
  };
  assert.deepEqual(await runCustomerRelease({ env: {}, connect }), { skipped: true });
  assert.equal(
    customerReleaseConfiguration(env).schema,
    "rec_release_backup_" + sha.slice(0, 16) + "_customer",
  );
  for (const patch of [
    { VERCEL_ENV: "preview" },
    { DATABASE_NEON_PROJECT_ID: "other" },
    { REC_RELEASE_COMMIT_SHA: "a".repeat(40) },
    { REC_COMMERCE_BACKUP_VERIFIED_SHA: "a".repeat(40) },
    { REC_COMMERCE_BACKUP_REFERENCE: "" },
  ])
    assert.throws(
      () => customerReleaseConfiguration({ ...env, ...patch }),
      /Approved release|Release refused/,
    );
  assert.deepEqual(
    customerReleasePlan(entries, CUSTOMER_BASELINE).map((p) => p.name),
    CUSTOMER_MIGRATIONS,
  );
  assert.deepEqual(customerReleasePlan(entries, entries), []);
  for (const [files, history] of [
    [entries.slice(0, -1), CUSTOMER_BASELINE],
    [[...entries, "0021_unreviewed.sql"], CUSTOMER_BASELINE],
    [entries, CUSTOMER_BASELINE.slice(1)],
    [entries, [...CUSTOMER_BASELINE, CUSTOMER_BASELINE[0]]],
    [entries, [...CUSTOMER_BASELINE, "unreviewed.sql"]],
  ])
    assert.throws(() => customerReleasePlan(files, history), /Release refused/);
});
test("customer release snapshots history privately, leaves issued records untouched and retries safely", async () => {
  const db = new PGlite();
  await db.waitReady;
  const client = {
    query: async (text, params) =>
      params ? db.query(text, params) : (await db.exec(text)).at(-1) || { rows: [] },
  };
  try {
    await db.exec(
      "create table _migrations(name text primary key,applied_at timestamptz default now())",
    );
    for (const name of CUSTOMER_BASELINE) {
      await db.exec(await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"));
      await db.query("insert into _migrations(name) values($1)", [name]);
    }
    await db.exec(
      "insert into commerce_orders(id,customer_name,customer_email,source,subtotal,total) values('TEST-original','TEST ONLY','test@example.invalid','test_fixture',900,900)",
    );
    const before = await db.query(
      "select to_jsonb(o) original from commerce_orders o where id='TEST-original'",
    );
    const logs = [];
    const options = { env, connect: async () => client, log: (...v) => logs.push(v.join(" ")) };
    const result = await runCustomerRelease(options);
    assert.equal(result.applied, 1);
    assert.deepEqual(await runCustomerRelease(options), { applied: 0 });
    assert.deepEqual(
      await db.query("select to_jsonb(o) original from commerce_orders o where id='TEST-original'"),
      before,
    );
    assert.ok(
      (
        await db.query(
          `select bool_and(verified) verified from ${result.snapshot.schema}.__manifest`,
        )
      ).rows[0].verified,
    );
    assert.equal(logs.join("").includes("test@example.invalid"), false);
    assert.equal(logs.join("").includes(env.DATABASE_URL), false);
  } finally {
    await db.close();
  }
});
