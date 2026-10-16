#!/usr/bin/env node
/** Explicit read-only diagnosis. Never applies SQL migrations. */
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
export const safeMigrationNames = (names) =>
  names.map((name) =>
    /^\d{4}_[a-z0-9_-]+\.sql$/i.test(name) ? name : "[invalid migration filename redacted]",
  );

export function configurationReadiness(env) {
  let canonicalAuthOrigin = false;
  try {
    canonicalAuthOrigin = new URL(env.BETTER_AUTH_URL).origin === "https://recmamamade.com";
  } catch {
    // Report only a boolean; never print a configured URL or credential.
  }
  return {
    previewEnvironment: env.VERCEL_ENV === "preview",
    productionEnvironment: env.VERCEL_ENV === "production",
    productionApprovalFlag: env.REC_MIGRATION_TARGET === "production-approved",
    databaseConfigured: !!env.DATABASE_URL?.trim(),
    authSecretConfigured: !!env.BETTER_AUTH_SECRET?.trim(),
    authSecretLengthValid: (env.BETTER_AUTH_SECRET?.length || 0) >= 32,
    authOriginConfigured: !!env.BETTER_AUTH_URL?.trim(),
    canonicalAuthOrigin,
    mfaEncryptionKeyConfigured: !!env.ADMIN_MFA_ENCRYPTION_KEY?.trim(),
    mfaEncryptionKeyFormatValid: /^[a-f0-9]{64}$/i.test(env.ADMIN_MFA_ENCRYPTION_KEY || ""),
    stripeConfigured: !!env.STRIPE_SECRET_KEY?.trim(),
    stripeTestMode: /^sk_test_/.test(env.STRIPE_SECRET_KEY || ""),
    stripeWebhookConfigured: !!env.STRIPE_WEBHOOK_SECRET?.trim(),
    paypalClientConfigured: !!env.PAYPAL_CLIENT_ID?.trim(),
    paypalSecretConfigured: !!env.PAYPAL_CLIENT_SECRET?.trim(),
    validCommitSha: /^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || ""),
  };
}

export async function runReleaseSchemaAudit({
  env = process.env,
  expectedMigrations = [],
  connect,
  log = console.log,
} = {}) {
  if (env.REC_RELEASE_SCHEMA_AUDIT !== "read-only")
    throw new Error("Schema audit refused: explicit read-only diagnostic flag is required.");
  if (
    env.VERCEL_ENV !== "preview" &&
    !(env.VERCEL_ENV === "production" && env.REC_MIGRATION_TARGET === "production-approved")
  )
    throw new Error(
      "Schema audit refused: use a preview build or an explicitly approved production target.",
    );
  const readiness = configurationReadiness(env);
  log("[release-schema-audit] Configuration readiness:", JSON.stringify(readiness));
  if (!readiness.databaseConfigured)
    throw new Error("Schema audit refused: preview DATABASE_URL is not configured.");
  let pool;
  let client;
  try {
    if (connect) client = await connect();
    else {
      pool = new pg.Pool({
        connectionString: env.DATABASE_URL,
        max: 1,
        connectionTimeoutMillis: 15000,
      });
      client = await pool.connect();
    }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL statement_timeout='15s'");
    const schemas = (
      await client.query(
        "SELECT nspname AS schema FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY nspname",
      )
    ).rows.map(({ schema }) => schema);
    log("[release-schema-audit] Schema names:", JSON.stringify(schemas));
    const tables = (
      await client.query(
        `SELECT n.nspname AS schema,c.relname AS table,c.relkind AS kind
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
            AND c.relkind IN ('r','p','v','m','f') ORDER BY n.nspname,c.relname`,
      )
    ).rows;
    log("[release-schema-audit] Table presence:", JSON.stringify(tables));
    const columns = (
      await client.query(
        `SELECT n.nspname AS schema,c.relname AS table,a.attname AS column
           FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
            AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
          ORDER BY n.nspname,c.relname,a.attnum`,
      )
    ).rows;
    // One line per relation avoids Vercel truncating a single oversized line.
    for (const table of tables)
      log(
        "[release-schema-audit] Column presence:",
        JSON.stringify({
          schema: table.schema,
          table: table.table,
          columns: columns
            .filter((column) => column.schema === table.schema && column.table === table.table)
            .map(({ column }) => column),
        }),
      );
    const histories = [];
    for (const table of tables.filter(
      (table) => table.table === "_migrations" && ["r", "p"].includes(table.kind),
    )) {
      const hasName = columns.some(
        (column) =>
          column.schema === table.schema &&
          column.table === table.table &&
          column.column === "name",
      );
      if (!hasName) {
        histories.push({ schema: table.schema, nameColumnPresent: false });
        continue;
      }
      const applied = (
        await client.query(
          `SELECT name FROM ${identifier(table.schema)}.${identifier(table.table)} ORDER BY name`,
        )
      ).rows.map(({ name }) => name);
      const history = {
        schema: table.schema,
        nameColumnPresent: true,
        applied: safeMigrationNames(applied),
        missingExpected: safeMigrationNames(
          expectedMigrations.filter((name) => !applied.includes(name)),
        ),
      };
      histories.push(history);
    }
    log("[release-schema-audit] Migration file history:", JSON.stringify(histories));
    if (!histories.some((history) => history.schema === "public"))
      log("[release-schema-audit] Public migration history absent; no repair was attempted.");
    await client.query("ROLLBACK");
    log(
      "[release-schema-audit] Read-only diagnosis complete; no schema or business records changed.",
    );
    return { readiness, schemas, tables, columns, histories };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release?.();
    await pool?.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  Promise.resolve()
    .then(async () => {
      const expectedMigrations = (await readdir(directory)).filter((name) => name.endsWith(".sql"));
      await runReleaseSchemaAudit({ expectedMigrations });
      console.error(
        "[release-schema-audit] Intentional deployment stop after read-only diagnosis.",
      );
      process.exitCode = 2;
    })
    .catch((error) => {
      console.error(
        "[release-schema-audit] Failed:",
        /^Schema audit refused:/.test(error?.message || "")
          ? error.message
          : `Read-only database diagnosis rejected${/^[A-Z0-9]{5}$/.test(error?.code || "") ? ` (SQLSTATE ${error.code})` : ""}.`,
      );
      process.exitCode = 1;
    });
}
