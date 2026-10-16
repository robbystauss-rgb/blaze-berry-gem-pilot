import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  configurationReadiness,
  runReleaseSchemaAudit,
  safeMigrationNames,
} from "./release-schema-audit.mjs";
import { runReleaseDatabase, BASELINE_MIGRATIONS } from "./release-database.mjs";

const env = {
  VERCEL_ENV: "preview",
  REC_RELEASE_SCHEMA_AUDIT: "read-only",
  DATABASE_URL: "postgres://sensitive-url-never-connected.invalid/private",
  BETTER_AUTH_SECRET: "private-auth-value-that-must-never-be-printed",
  BETTER_AUTH_URL: "https://recmamamade.com",
  ADMIN_MFA_ENCRYPTION_KEY: "c".repeat(64),
  STRIPE_SECRET_KEY: "sk_test_PRIVATE_FIXTURE",
};

test("read-only diagnosis requires its exact flag and separate production authorization", async () => {
  let connected = false;
  const connect = () => {
    connected = true;
    throw new Error("must not connect");
  };
  for (const invalid of [
    { ...env, REC_RELEASE_SCHEMA_AUDIT: "" },
    { ...env, VERCEL_ENV: "production" },
    { ...env, VERCEL_ENV: "production", REC_MIGRATION_TARGET: "production" },
    { ...env, VERCEL_ENV: "development", REC_MIGRATION_TARGET: "production-approved" },
  ])
    await assert.rejects(
      () => runReleaseSchemaAudit({ env: invalid, connect, log() {} }),
      /refused/,
    );
  assert.equal(connected, false);
  const readiness = configurationReadiness(env);
  assert.ok(Object.values(readiness).every((value) => typeof value === "boolean"));
  assert.equal(readiness.databaseConfigured, true);
  assert.equal(readiness.stripeTestMode, true);
  assert.deepEqual(safeMigrationNames(["0001_auth.sql", "secret/path/private"]), [
    "0001_auth.sql",
    "[invalid migration filename redacted]",
  ]);
});

test("audit reports only schema metadata, readiness booleans and sanitized migration filenames", async () => {
  const db = new PGlite();
  await db.waitReady;
  const queries = [];
  const logs = [];
  const client = {
    async query(text, params) {
      queries.push(text);
      return params ? db.query(text, params) : (await db.exec(text)).at(-1) || { rows: [] };
    },
  };
  try {
    await db.exec(`create table _migrations(name text);
      insert into _migrations values ('0001_auth.sql'),('0002_commerce.sql'),('PRIVATE ROW VALUE');
      create table private_customer_fixture(email text, original bytea);
      insert into private_customer_fixture values ('NEVER PRINT THIS CUSTOMER', '\\x00ff');
      create schema legacy;
      create table legacy._migrations(name text);
      insert into legacy._migrations values ('0001_auth.sql');`);
    const report = await runReleaseSchemaAudit({
      env,
      connect: async () => client,
      expectedMigrations: BASELINE_MIGRATIONS,
      log: (...values) => logs.push(values.join(" ")),
    });
    assert.equal(report.histories.length, 2);
    const history = report.histories.find(({ schema }) => schema === "public");
    assert.equal(history.missingExpected.length, 5);
    assert.ok(history.applied.includes("[invalid migration filename redacted]"));
    assert.ok(
      report.columns.some(
        (column) => column.table === "private_customer_fixture" && column.column === "original",
      ),
    );
    const output = logs.join("\n");
    for (const privateValue of [
      env.DATABASE_URL,
      env.BETTER_AUTH_SECRET,
      env.ADMIN_MFA_ENCRYPTION_KEY,
      env.STRIPE_SECRET_KEY,
      "PRIVATE ROW VALUE",
      "NEVER PRINT THIS CUSTOMER",
    ])
      assert.equal(output.includes(privateValue), false);
    assert.equal(queries[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(queries.at(-1), "ROLLBACK");
    assert.ok(
      queries.every((query) => /^(BEGIN .*READ ONLY|SELECT |SET LOCAL |ROLLBACK)/i.test(query)),
    );
    queries.length = 0;
    await assert.rejects(
      () =>
        runReleaseDatabase({
          env: { ...env, VERCEL_ENV: "production", REC_MIGRATION_TARGET: "production-approved" },
          connect: async () => client,
          log: (...values) => logs.push(values.join(" ")),
        }),
      /intentional deployment stop after read-only schema audit/,
    );
    assert.ok(
      queries.every((query) => /^(BEGIN .*READ ONLY|SELECT |SET LOCAL |ROLLBACK)/i.test(query)),
    );
    assert.equal(
      (await db.query("select count(*)::int as n from private_customer_fixture")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select to_regclass('public.commerce_documents') as name")).rows[0].name,
      null,
    );
  } finally {
    await db.close();
  }
});
