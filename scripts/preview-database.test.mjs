import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { previewDatabaseConfiguration, runPreviewDatabase } from "./preview-database.mjs";
import { inspectMigrationCompatibility } from "./migration-safety.mjs";
const env = {
  VERCEL_ENV: "preview",
  REC_PREVIEW_DATABASE_ACTION: "inspect",
  REC_PREVIEW_DATABASE_PROJECT_ID: "isolated-fixture",
  REC_PRODUCTION_DATABASE_PROJECT_ID: "production-not-connected",
  DATABASE_NEON_PROJECT_ID: "isolated-fixture",
  DATABASE_URL: "postgres://test:never-used@test.neon.tech/db?sslmode=require",
};
const fixture = async (work) => {
  const db = new PGlite();
  await db.waitReady;
  const client = {
    async query(text, params) {
      return params ? db.query(text, params) : ((await db.exec(text)).at(-1) ?? { rows: [] });
    },
  };
  try {
    await work(db, client);
  } finally {
    await db.close();
  }
};
test("preview refuses production, missing pins, reused project and live credentials before any connection", async () => {
  let connected = false;
  for (const patch of [
    { VERCEL_ENV: "production" },
    { REC_PREVIEW_DATABASE_PROJECT_ID: "" },
    { DATABASE_NEON_PROJECT_ID: "production-not-connected" },
    { STRIPE_SECRET_KEY: "sk_live_never_used" },
    { PAYPAL_CLIENT_SECRET: "not-real", PAYPAL_ENVIRONMENT: "live" },
    { RESEND_API_KEY: "not-real" },
    { REC_ORDER_EMAIL_SENDER_VERIFIED: "true" },
  ])
    await assert.rejects(
      () =>
        runPreviewDatabase({
          env: { ...env, ...patch },
          connect: async () => {
            connected = true;
            throw Error("must not connect");
          },
        }),
      /Preview refused/,
    );
  assert.equal(connected, false);
  assert.match(previewDatabaseConfiguration(env).connectionString, /sslmode=verify-full/);
  assert.doesNotThrow(() =>
    previewDatabaseConfiguration({ ...env, STRIPE_SECRET_KEY: "sk_test_fixture" }),
  );
});
test("unrelated legacy preview history is rejected without creating or changing tables", async () =>
  fixture(async (db, client) => {
    await db.exec(
      "create table _migrations(name text primary key);insert into _migrations values('0002_checkout.sql');create table keep_this(id text);insert into keep_this values('untouched');",
    );
    await assert.rejects(
      () => runPreviewDatabase({ env, connect: async () => client, log() {} }),
      /different application/,
    );
    assert.equal((await db.query("select id from keep_this")).rows[0].id, "untouched");
    assert.equal(
      (await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n,
      2,
    );
  }));
test("untracked public data and non-prefix history fail closed", async () =>
  fixture(async (db, client) => {
    await db.exec("create table untracked(id text)");
    await assert.rejects(
      () => inspectMigrationCompatibility(client, ["0001_a.sql"]),
      /without matching/,
    );
    await db.exec(
      "drop table untracked;create table _migrations(name text);insert into _migrations values('0002_b.sql')",
    );
    await assert.rejects(
      () => inspectMigrationCompatibility(client, ["0001_a.sql", "0002_b.sql"]),
      /gaps/,
    );
  }));
test("read-only inspection never initializes an empty database", async () =>
  fixture(async (db, client) => {
    const result = await runPreviewDatabase({ env, connect: async () => client, log() {} });
    assert.equal(result.changed, false);
    assert.ok(result.pending.length >= 11);
    assert.equal(
      (await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0].n,
      0,
    );
  }));
test("fresh initialization is atomic and an already-current retry changes nothing", async () =>
  fixture(async (db, client) => {
    const options = {
      env: { ...env, REC_PREVIEW_DATABASE_ACTION: "initialize" },
      connect: async () => client,
      log() {},
    };
    const first = await runPreviewDatabase(options);
    assert.ok(first.applied >= 11);
    assert.deepEqual(await runPreviewDatabase(options), { changed: false, applied: 0 });
    assert.equal((await db.query("select count(*)::int n from commerce_orders")).rows[0].n, 0);
  }));
test("failed initialization rolls back every applied file and tracking table", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rec-preview-test-"));
  try {
    await writeFile(join(directory, "0001_a.sql"), "create table transient_data(id text)");
    await writeFile(join(directory, "0002_b.sql"), "select deliberate_isolated_failure()");
    await fixture(async (db, client) => {
      await assert.rejects(() =>
        runPreviewDatabase({
          env: { ...env, REC_PREVIEW_DATABASE_ACTION: "initialize" },
          directory,
          connect: async () => client,
          log() {},
        }),
      );
      assert.equal(
        (await db.query("select count(*)::int n from pg_tables where schemaname='public'")).rows[0]
          .n,
        0,
      );
    });
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolve(directory).split(sep).at(-1).startsWith("rec-preview-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
