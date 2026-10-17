#!/usr/bin/env node
/** Explicit isolated-preview inspection/initialization. Never copies production data. */
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";
import { applyMigrationFiles } from "./migration-runner.mjs";
import { inspectMigrationCompatibility } from "./migration-safety.mjs";

export function previewDatabaseConfiguration(env) {
  if (!["inspect", "initialize"].includes(env.REC_PREVIEW_DATABASE_ACTION))
    throw Error("Preview refused: explicitly choose inspect or initialize.");
  if (env.VERCEL_ENV !== "preview") throw Error("Preview refused: VERCEL_ENV must be preview.");
  if (
    !env.REC_PREVIEW_DATABASE_PROJECT_ID ||
    !env.REC_PRODUCTION_DATABASE_PROJECT_ID ||
    env.DATABASE_NEON_PROJECT_ID !== env.REC_PREVIEW_DATABASE_PROJECT_ID ||
    env.DATABASE_NEON_PROJECT_ID === env.REC_PRODUCTION_DATABASE_PROJECT_ID
  )
    throw Error(
      "Preview refused: verify a distinct, pinned Neon preview project before connecting.",
    );
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw Error("Preview refused: a configured database connection is required.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".neon.tech") ||
    !url.username ||
    !url.password ||
    !["require", "verify-full"].includes(url.searchParams.get("sslmode"))
  )
    throw Error("Preview refused: use an authenticated Neon connection with verified TLS.");
  if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY))
    throw Error("Preview refused: live Stripe credentials must not be present.");
  if ((env.PAYPAL_CLIENT_SECRET || env.PAYPAL_CLIENT_ID) && env.PAYPAL_ENVIRONMENT !== "sandbox")
    throw Error("Preview refused: PayPal must explicitly use sandbox.");
  if (env.REC_ORDER_EMAIL_SENDER_VERIFIED === "true" || env.RESEND_API_KEY)
    throw Error("Preview refused: automatic outbound email must be disabled for initialization.");
  url.searchParams.set("sslmode", "verify-full");
  return {
    connectionString: url.toString(),
    initialize: env.REC_PREVIEW_DATABASE_ACTION === "initialize",
  };
}
export async function runPreviewDatabase({
  env = process.env,
  connect,
  directory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations"),
  log = console.log,
} = {}) {
  const config = previewDatabaseConfiguration(env);
  const entries = await readdir(directory),
    known = pendingMigrations(entries, []).map((m) => m.name);
  let pool, client;
  try {
    if (connect) client = await connect();
    else {
      pool = new pg.Pool({
        connectionString: config.connectionString,
        max: 1,
        connectionTimeoutMillis: 15000,
      });
      client = await pool.connect();
    }
    await client.query(config.initialize ? "BEGIN" : "BEGIN READ ONLY");
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    if (config.initialize)
      await client.query("SELECT pg_advisory_xact_lock(hashtext('rec-mama-made:migrations'))");
    const plan = await inspectMigrationCompatibility(client, known);
    if (!config.initialize) {
      await client.query("ROLLBACK");
      log(
        "[preview-database] Read-only inspection complete.",
        JSON.stringify({
          applied: plan.applied,
          pending: plan.pending,
          tableCount: plan.tables.length,
        }),
      );
      return { ...plan, changed: false };
    }
    if (plan.applied.length && plan.pending.length)
      throw Error(
        "Preview refused: initialization only accepts an empty database or an already-current schema. Existing test data requires a reviewed upgrade.",
      );
    if (plan.pending.length) {
      await client.query(
        "CREATE TABLE IF NOT EXISTS public._migrations (name text primary key, applied_at timestamptz not null default now())",
      );
      await applyMigrationFiles(client, {
        migrationsDir: directory,
        pending: pendingMigrations(entries, []),
        transactionPerFile: false,
        log: () => {},
      });
    }
    await client.query("COMMIT");
    log(
      "[preview-database] Isolated schema ready.",
      JSON.stringify({
        applied: plan.pending.length,
        customerDataCopied: false,
        outboundEmailDisabled: true,
      }),
    );
    return { changed: !!plan.pending.length, applied: plan.pending.length };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release?.();
    await pool?.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runPreviewDatabase().catch((error) => {
    console.error(
      "[preview-database]",
      /^(Preview|Migration) refused:/.test(error.message)
        ? error.message
        : "Database operation failed; no connection details were logged.",
    );
    process.exitCode = 1;
  });
