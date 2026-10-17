import assert from "node:assert/strict";
import { readFile, mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test, before, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  BASELINE_MIGRATIONS,
  RELEASE_MIGRATIONS,
  releaseConfiguration,
  releasePlan,
  runReleaseDatabase,
} from "./release-database.mjs";

const directory = new URL("../migrations/", import.meta.url);
const entries = [...BASELINE_MIGRATIONS, ...RELEASE_MIGRATIONS];
// This retired one-release helper is intentionally pinned to its approved files.
// Future migrations must continue to be refused rather than expanding approval.
let approvedDirectory;
before(async () => {
  approvedDirectory = await mkdtemp(join(tmpdir(), "rec-approved-release-test-"));
  for (const name of entries)
    await writeFile(join(approvedDirectory, name), await readFile(new URL(name, directory)));
});
after(async () => {
  const target = resolve(approvedDirectory);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  assert.ok(target.split(sep).at(-1).startsWith("rec-approved-release-test-"));
  await rm(target, { recursive: true, force: true });
});
const env = {
  REC_MIGRATION_TARGET: "production-approved",
  DATABASE_URL: "postgres://isolated-test.invalid/never-connected",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
};
async function fixture(work) {
  const db = new PGlite();
  await db.waitReady;
  const client = {
    async query(text, params) {
      if (params) return db.query(text, params);
      return (await db.exec(text)).at(-1) || { rows: [] };
    },
  };
  try {
    await db.exec(
      "create table _migrations(name text primary key, applied_at timestamptz default now())",
    );
    for (const name of BASELINE_MIGRATIONS) {
      await db.exec(await readFile(new URL(name, directory), "utf8"));
      await db.query("insert into _migrations(name) values ($1)", [name]);
    }
    await work(db, client);
  } finally {
    await db.close();
  }
}
const options = (client, more = {}) => ({
  env,
  directory: approvedDirectory,
  connect: async () => client,
  log() {},
  ...more,
});

test("release build helper does no connection or query without the exact owner-approved flag", async () => {
  let connected = false;
  for (const target of [
    undefined,
    "",
    "production",
    "staging",
    "development",
    "production-approved ",
  ]) {
    const result = await runReleaseDatabase({
      env: { DATABASE_URL: "private-not-read", REC_MIGRATION_TARGET: target },
      connect() {
        connected = true;
        throw new Error("must never connect");
      },
    });
    assert.deepEqual(result, { skipped: true });
  }
  assert.equal(connected, false);
  assert.throws(
    () => releaseConfiguration({ REC_MIGRATION_TARGET: "production-approved" }),
    /DATABASE_URL/,
  );
  assert.throws(
    () => releaseConfiguration({ ...env, VERCEL_GIT_COMMIT_SHA: "main; arbitrary" }),
    /full VERCEL/,
  );
  assert.equal(releaseConfiguration(env).schema, "rec_release_backup_" + "a".repeat(16));
});

test("release accepts only an established baseline and the exact two additive migrations", () => {
  assert.deepEqual(
    releasePlan(entries, BASELINE_MIGRATIONS).map(({ name }) => name),
    RELEASE_MIGRATIONS,
  );
  assert.deepEqual(releasePlan(entries, entries), []);
  assert.throws(() => releasePlan(entries, BASELINE_MIGRATIONS.slice(1)), /baseline/);
  assert.throws(() => releasePlan([...entries, "0010_unknown.sql"], BASELINE_MIGRATIONS), /scope/);
  assert.throws(() => releasePlan(entries, [...entries, "9999_newer.sql"]), /outside/);
  assert.throws(() => releasePlan(entries.slice(0, -1), BASELINE_MIGRATIONS), /missing/);
  assert.throws(
    () => releasePlan(entries, [...BASELINE_MIGRATIONS, RELEASE_MIGRATIONS[1]]),
    /out of order/,
  );
});

test("approved release snapshots private auth/artwork bytes, verifies rows and ACLs, then atomically migrates once", async () => {
  await fixture(async (db, client) => {
    await db.exec(`create role snapshot_test_reader;
      alter default privileges grant select on tables to public, snapshot_test_reader;
      create table "release original"(id text primary key, original bytea, note jsonb);
      insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt")
        values ('private-owner','Private fixture','private@example.invalid',true,now(),now());`);
    const bytes = new Uint8Array([0, 255, 16, 0, 42]);
    await db.query('insert into "release original" values($1,$2,$3)', [
      "private-art",
      bytes,
      JSON.stringify({ restricted: true, sensitive: "test only" }),
    ]);
    const result = await runReleaseDatabase(options(client));
    assert.equal(result.applied, 2);
    const schema = result.snapshot.schema;
    const manifest = (
      await db.query(`select * from ${schema}.__manifest where source_table=$1`, [
        "release original",
      ])
    ).rows[0];
    assert.equal(manifest.verified, true);
    assert.equal(String(manifest.row_count), "1");
    const backup = (
      await db.query(`select original,note from ${schema}."${manifest.snapshot_table}"`)
    ).rows[0];
    assert.deepEqual(backup.original, bytes);
    assert.deepEqual(backup.note, { restricted: true, sensitive: "test only" });
    const userManifest = (
      await db.query(`select snapshot_table from ${schema}.__manifest where source_table='user'`)
    ).rows[0];
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from ${schema}."${userManifest.snapshot_table}" where id='private-owner'`,
        )
      ).rows[0].n,
      1,
    );
    const release = (await db.query(`select * from ${schema}.__release`)).rows[0];
    assert.equal(release.commit_sha, env.VERCEL_GIT_COMMIT_SHA);
    assert.deepEqual(release.pending_migrations, RELEASE_MIGRATIONS);
    assert.equal(
      (
        await db.query(
          `select has_schema_privilege('snapshot_test_reader',$1,'USAGE') as allowed`,
          [schema],
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await db.query(
          `select has_table_privilege('snapshot_test_reader',$1,'SELECT') as allowed`,
          [`${schema}.${manifest.snapshot_table}`],
        )
      ).rows[0].allowed,
      false,
    );
    assert.equal((await db.query("select count(*)::int as n from _migrations")).rows[0].n, 9);
    assert.equal(
      (await db.query("select count(*)::int as n from commerce_promotions where code='ZADDY'"))
        .rows[0].n,
      1,
    );
    assert.deepEqual(await runReleaseDatabase(options(client)), { applied: 0 });
    // A different commit with no migrations also makes no extra snapshot.
    assert.deepEqual(
      await runReleaseDatabase(
        options(client, { env: { ...env, VERCEL_GIT_COMMIT_SHA: "b".repeat(40) } }),
      ),
      { applied: 0 },
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from pg_namespace where nspname like 'rec_release_backup_%'",
        )
      ).rows[0].n,
      1,
    );
  });
});

test("snapshot cap and missing baseline fail before schema/data mutations", async () => {
  await fixture(async (db, client) => {
    await assert.rejects(
      () => runReleaseDatabase(options(client, { maxSnapshotBytes: 1 })),
      /100 MiB cap/,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from pg_namespace where nspname like 'rec_release_backup_%'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await db.query("select count(*)::int as n from _migrations")).rows[0].n, 7);
    await db.query("delete from _migrations where name=$1", [BASELINE_MIGRATIONS[0]]);
    const diagnostic = [];
    await assert.rejects(
      () =>
        runReleaseDatabase(
          options(client, { log: (...values) => diagnostic.push(values.join(" ")) }),
        ),
      /baseline/,
    );
    assert.ok(
      diagnostic.some(
        (line) =>
          line.includes("Applied migration filenames:") && line.includes(BASELINE_MIGRATIONS[1]),
      ),
    );
    assert.ok(
      diagnostic.some(
        (line) =>
          line.includes("Missing baseline filenames:") && line.includes(BASELINE_MIGRATIONS[0]),
      ),
    );
    assert.equal(
      (await db.query("select to_regclass('public.commerce_documents') as name")).rows[0].name,
      null,
    );
  });
});

test("failure in the second migration rolls back both first migration and snapshot", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "rec-release-test-"));
  try {
    await cp(approvedDirectory, temporary, { recursive: true });
    await writeFile(
      join(temporary, RELEASE_MIGRATIONS[1]),
      "select this_is_an_intentional_isolated_test_failure();",
    );
    await fixture(async (db, client) => {
      await assert.rejects(() => runReleaseDatabase(options(client, { directory: temporary })));
      assert.equal(
        (await db.query("select to_regclass('public.commerce_documents') as name")).rows[0].name,
        null,
      );
      assert.equal((await db.query("select count(*)::int as n from _migrations")).rows[0].n, 7);
      assert.equal(
        (
          await db.query(
            "select count(*)::int as n from pg_namespace where nspname like 'rec_release_backup_%'",
          )
        ).rows[0].n,
        0,
      );
    });
  } finally {
    const resolvedTemporary = resolve(temporary);
    assert.ok(resolvedTemporary.startsWith(resolve(tmpdir()) + sep));
    assert.ok(resolvedTemporary.split(sep).at(-1).startsWith("rec-release-test-"));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("row-security filtering fails the snapshot rather than silently omitting private rows", async () => {
  await fixture(async (db, client) => {
    await db.exec(`create role release_limited;
      create table private_rls_fixture(id text);
      insert into private_rls_fixture values ('never omit this row');
      alter table private_rls_fixture enable row level security;
      create policy filtered_fixture on private_rls_fixture using (false);
      grant usage on schema public to release_limited;
      grant select on all tables in schema public to release_limited;`);
    const database = (await db.query("select current_database() as name")).rows[0].name;
    await db.exec(`grant create on database "${database.replaceAll('"', '""')}" to release_limited;
      set role release_limited;`);
    await assert.rejects(() => runReleaseDatabase(options(client)), /row-level security/i);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from pg_namespace where nspname like 'rec_release_backup_%'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal((await db.query("select count(*)::int as n from _migrations")).rows[0].n, 7);
  });
});
