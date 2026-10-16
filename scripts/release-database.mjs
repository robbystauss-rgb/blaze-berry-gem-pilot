#!/usr/bin/env node
/**
 * ONE-RELEASE opt-in, not an automatic production migrator. Without the exact
 * approval flag this module never opens a connection. The logical data snapshot
 * stays inside the same database: it is NOT an offsite/disaster-recovery backup.
 */
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";
import { applyMigrationFiles } from "./migration-runner.mjs";

export const BASELINE_MIGRATIONS = [
  "0001_auth.sql",
  "0002_commerce.sql",
  "0003_financial_operations.sql",
  "0004_owner_setup.sql",
  "0005_operations_completion.sql",
  "0006_provider_activation.sql",
  "0007_order_email_notifications.sql",
];
export const RELEASE_MIGRATIONS = ["0008_owner_publishing.sql", "0009_hat_photo_snapshots.sql"];
export const MAX_SNAPSHOT_BYTES = 100 * 1024 * 1024;
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';

export function releaseConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== "production-approved") return null;
  if (!env.DATABASE_URL?.trim()) throw new Error("Approved release requires DATABASE_URL.");
  if (!/^[a-f0-9]{40}$/i.test(env.VERCEL_GIT_COMMIT_SHA || ""))
    throw new Error("Approved release requires a full VERCEL_GIT_COMMIT_SHA.");
  const sha = env.VERCEL_GIT_COMMIT_SHA.toLowerCase();
  return {
    databaseUrl: env.DATABASE_URL,
    sha,
    schema: "rec_release_backup_" + sha.slice(0, 16),
  };
}

export function releasePlan(entries, applied) {
  const known = new Set([...BASELINE_MIGRATIONS, ...RELEASE_MIGRATIONS]);
  if (BASELINE_MIGRATIONS.some((name) => !applied.includes(name)))
    throw new Error("Release refused: all seven baseline migrations must already be applied.");
  if (applied.some((name) => !known.has(name)))
    throw new Error("Release refused: database contains migration history outside this release.");
  if (RELEASE_MIGRATIONS.some((name) => !entries.includes(name)))
    throw new Error("Release refused: expected additive migration files are missing.");
  const pending = pendingMigrations(entries, applied);
  if (pending.some(({ name }) => !RELEASE_MIGRATIONS.includes(name)))
    throw new Error("Release refused: pending migrations exceed the approved 0008/0009 scope.");
  if (applied.includes(RELEASE_MIGRATIONS[1]) && !applied.includes(RELEASE_MIGRATIONS[0]))
    throw new Error("Release refused: migration history is out of order.");
  return pending;
}

async function privatizeSnapshot(client, schema) {
  const namespace = identifier(schema);
  await client.query(`REVOKE ALL ON SCHEMA ${namespace} FROM PUBLIC`);
  await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${namespace} FROM PUBLIC`);
  // Global default privileges can grant new tables to other roles. Remove such
  // explicit grants too; only the snapshot owner retains access (and DB admins).
  const { rows } = await client.query(
    `SELECT DISTINCT a.grantee::text AS grantee, pg_get_userbyid(a.grantee) AS role
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE n.nspname=$1 AND a.grantee<>0 AND a.grantee<>c.relowner`,
    [schema],
  );
  for (const row of rows)
    await client.query(
      `REVOKE ALL ON ALL TABLES IN SCHEMA ${namespace} FROM ${identifier(row.role)}`,
    );
  const permissions = await client.query(
    `SELECT count(*)::text AS unwanted
       FROM (
         SELECT a.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
          WHERE n.nspname=$1 AND a.grantee<>n.nspowner
         UNION ALL
         SELECT a.grantee FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE n.nspname=$1 AND a.grantee<>c.relowner
       ) permissions`,
    [schema],
  );
  if (permissions.rows[0].unwanted !== "0")
    throw new Error("Snapshot permissions could not be restricted to its database owner.");
}

async function createSnapshot(client, config, pending, maxSnapshotBytes) {
  const schema = identifier(config.schema);
  const existing = await client.query("SELECT oid FROM pg_namespace WHERE nspname=$1", [
    config.schema,
  ]);
  // Reuse is only possible after a prior atomic release committed (normally the
  // no-pending path catches that first). A leftover schema is never overwritten.
  if (existing.rows.length)
    throw new Error(
      "Release refused: snapshot schema already exists while migrations are pending.",
    );
  const { rows: tables } = await client.query(
    `SELECT c.oid::text AS oid, c.relname AS name,
            pg_total_relation_size(c.oid)::text AS bytes
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
      ORDER BY c.relname`,
  );
  if (!tables.length) throw new Error("Release refused: no public source tables were found.");
  const bytes = tables.reduce((sum, table) => sum + BigInt(table.bytes), 0n);
  if (bytes > BigInt(maxSnapshotBytes))
    throw new Error("Release refused: logical snapshot source exceeds the approved 100 MiB cap.");
  const protectedTables = tables.map((table) => `public.${identifier(table.name)}`).join(", ");
  // ACCESS SHARE allows normal writes while protecting source table structure.
  // REPEATABLE READ gives every copied table one consistent MVCC snapshot.
  await client.query(`LOCK TABLE ${protectedTables} IN ACCESS SHARE MODE`);
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC`);
  await client.query(`CREATE TABLE ${schema}.__manifest (
    source_schema text NOT NULL, source_table text NOT NULL, snapshot_table text PRIMARY KEY,
    row_count bigint NOT NULL, source_bytes bigint NOT NULL, columns jsonb NOT NULL,
    verified boolean NOT NULL CHECK(verified)
  )`);
  await client.query(`CREATE TABLE ${schema}.__release (
    commit_sha text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
    mvcc_snapshot text NOT NULL, pending_migrations jsonb NOT NULL,
    source_bytes bigint NOT NULL, table_count integer NOT NULL
  )`);
  for (const table of tables) {
    const source = `public.${identifier(table.name)}`;
    const targetName = "table_" + table.oid;
    const target = `${schema}.${identifier(targetName)}`;
    // ONLY prevents duplicate rows for inheritance/partitioned relations; every
    // physical child relation is enumerated and captured independently above.
    await client.query(`CREATE TABLE ${target} AS SELECT * FROM ONLY ${source}`);
    const counts = await client.query(`SELECT
      (SELECT count(*)::text FROM ONLY ${source}) AS source_count,
      (SELECT count(*)::text FROM ${target}) AS backup_count`);
    const different = await client.query(`SELECT EXISTS(
      (SELECT to_jsonb(t) FROM ONLY ${source} t EXCEPT ALL SELECT to_jsonb(t) FROM ${target} t)
      UNION ALL
      (SELECT to_jsonb(t) FROM ${target} t EXCEPT ALL SELECT to_jsonb(t) FROM ONLY ${source} t)
    ) AS differs`);
    if (counts.rows[0].source_count !== counts.rows[0].backup_count || different.rows[0].differs)
      throw new Error("Release refused: logical snapshot verification failed.");
    const columns = await client.query(
      `SELECT a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type,
              a.attnotnull AS not_null, a.attidentity AS identity,
              pg_get_expr(d.adbin,d.adrelid) AS default_expression
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=$1::oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [table.oid],
    );
    await client.query(
      `INSERT INTO ${schema}.__manifest
       (source_schema,source_table,snapshot_table,row_count,source_bytes,columns,verified)
       VALUES ('public',$1,$2,$3,$4,$5::jsonb,true)`,
      [
        table.name,
        targetName,
        counts.rows[0].backup_count,
        table.bytes,
        JSON.stringify(columns.rows),
      ],
    );
  }
  await client.query(
    `INSERT INTO ${schema}.__release
     (commit_sha,mvcc_snapshot,pending_migrations,source_bytes,table_count)
     VALUES ($1,txid_current_snapshot()::text,$2::jsonb,$3,$4)`,
    [config.sha, JSON.stringify(pending.map(({ name }) => name)), bytes.toString(), tables.length],
  );
  await privatizeSnapshot(client, config.schema);
  return { tables: tables.length, bytes: bytes.toString(), schema: config.schema };
}

/** Injection is for isolated tests; callers must not pass a production fixture. */
export async function runReleaseDatabase({
  env = process.env,
  connect,
  directory = migrationsDir,
  log = console.log,
  maxSnapshotBytes = MAX_SNAPSHOT_BYTES,
} = {}) {
  const config = releaseConfiguration(env);
  if (!config) return { skipped: true }; // Deliberately no DB query or connection.
  const entries = await readdir(directory);
  let pool;
  let client;
  try {
    if (connect) client = await connect();
    else {
      pool = new pg.Pool({
        connectionString: config.databaseUrl,
        max: 1,
        connectionTimeoutMillis: 15000,
      });
      client = await pool.connect();
    }
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    // Never silently back up a row-filtered subset when a deployment role is
    // subject to RLS: PostgreSQL rejects such reads with row_security disabled.
    await client.query("SET LOCAL row_security=off");
    // Same key as db:migrate, with transaction ownership safe for pooled PG.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rec-mama-made:migrations'))");
    const migrationTable = await client.query("SELECT to_regclass('public._migrations') AS name");
    if (!migrationTable.rows[0].name)
      throw new Error("Release refused: existing public._migrations history is required.");
    const applied = (await client.query("SELECT name FROM public._migrations")).rows.map(
      ({ name }) => name,
    );
    const pending = releasePlan(entries, applied);
    if (!pending.length) {
      await client.query("COMMIT");
      log("[release-database] Approved release schema already current; no snapshot or changes.");
      return { applied: 0 };
    }
    const snapshot = await createSnapshot(client, config, pending, maxSnapshotBytes);
    await applyMigrationFiles(client, {
      migrationsDir: directory,
      pending,
      transactionPerFile: false,
      log: () => {}, // Do not claim a migration committed before the outer COMMIT.
    });
    await client.query("COMMIT");
    log(
      `[release-database] Committed ${pending.length} additive migrations; verified private same-database snapshot ${snapshot.schema} (${snapshot.tables} tables).`,
    );
    return { applied: pending.length, snapshot };
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client?.release?.();
    await pool?.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReleaseDatabase().catch((error) => {
    // Driver diagnostics may contain SQL values/connection details. Only emit a
    // fixed release error or an SQLSTATE; never customer rows or credentials.
    const safe = /^(Approved release|Release refused|Snapshot permissions)/.test(
      error?.message || "",
    );
    console.error(
      "[release-database] Failed:",
      safe
        ? error.message
        : `Database operation rejected${error?.code ? ` (SQLSTATE ${error.code})` : ""}.`,
    );
    process.exitCode = 1;
  });
}
