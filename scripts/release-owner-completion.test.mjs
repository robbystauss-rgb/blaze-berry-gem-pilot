import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  OWNER_RELEASE_TARGET,
  OWNER_BASELINE,
  OWNER_MIGRATIONS,
  ownerReleaseConfiguration,
  ownerReleasePlan,
  runOwnerRelease,
} from "./release-owner-completion.mjs";
const entries = [...OWNER_BASELINE, ...OWNER_MIGRATIONS],
  directory = new URL("../migrations/", import.meta.url),
  env = {
    REC_MIGRATION_TARGET: OWNER_RELEASE_TARGET,
    VERCEL_ENV: "production",
    DATABASE_NEON_PROJECT_ID: "damp-glitter-64854598",
    REC_RELEASE_COMMIT_SHA: "a".repeat(40),
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    DATABASE_URL: "postgres://isolated.invalid/not-connected",
  };
async function fixture(work) {
  const db = new PGlite();
  await db.waitReady;
  try {
    await db.exec(
      "create table _migrations(name text primary key, applied_at timestamptz default now())",
    );
    for (const name of OWNER_BASELINE) {
      await db.exec(await readFile(new URL(name, directory), "utf8"));
      await db.query("insert into _migrations(name) values ($1)", [name]);
    }
    const client = {
      async query(sql, params) {
        return params ? db.query(sql, params) : (await db.exec(sql)).at(-1) || { rows: [] };
      },
    };
    await work(db, { env, connect: async () => client, log() {} });
  } finally {
    await db.close();
  }
}
test("owner release has a distinct exact flag, production database and commit boundary", async () => {
  let connected = false;
  for (const target of [
    undefined,
    "disabled",
    "production",
    "production-approved",
    OWNER_RELEASE_TARGET + " ",
  ]) {
    assert.deepEqual(
      await runOwnerRelease({
        env: { ...env, REC_MIGRATION_TARGET: target },
        connect() {
          connected = true;
          throw Error("must not connect");
        },
      }),
      { skipped: true },
    );
  }
  assert.equal(connected, false);
  for (const change of [
    { VERCEL_ENV: "preview" },
    { DATABASE_NEON_PROJECT_ID: "young-bread-58896379" },
    { REC_RELEASE_COMMIT_SHA: "b".repeat(40) },
    { REC_RELEASE_COMMIT_SHA: undefined },
  ])
    assert.throws(() => ownerReleaseConfiguration({ ...env, ...change }), /Approved release/);
  assert.equal(ownerReleaseConfiguration(env).sha, env.VERCEL_GIT_COMMIT_SHA);
});
test("only the five reviewed additive files follow the complete nine-file baseline", () => {
  assert.deepEqual(
    ownerReleasePlan(entries, OWNER_BASELINE).map((p) => p.name),
    OWNER_MIGRATIONS,
  );
  assert.deepEqual(ownerReleasePlan(entries, entries), []);
  for (const applied of [
    OWNER_BASELINE.slice(1),
    [...OWNER_BASELINE, "0099_foreign.sql"],
    [...OWNER_BASELINE, OWNER_MIGRATIONS[1]],
    [...OWNER_BASELINE, OWNER_BASELINE[0]],
  ])
    assert.throws(() => ownerReleasePlan(entries, applied), /Release refused/);
  assert.throws(() => ownerReleasePlan(entries.slice(0, -1), OWNER_BASELINE), /missing/);
  assert.throws(() => ownerReleasePlan([...entries, "0015_future.sql"], OWNER_BASELINE), /exceed/);
});
test("actual 0009 to 0014 upgrade atomically preserves original bytes and money with a private verified snapshot", async () => {
  await fixture(async (db, options) => {
    await db.exec(
      "create table historical_fixture(id text primary key, original bytea, total integer, info jsonb)",
    );
    const original = new Uint8Array([0, 255, 4, 0, 128]);
    await db.query("insert into historical_fixture values ('immutable-fixture', $1, 12345, $2)", [
      original,
      JSON.stringify({ private: true, options: "original" }),
    ]);
    const result = await runOwnerRelease(options);
    assert.equal(result.applied, 5);
    assert.equal((await db.query("select count(*)::int as n from _migrations")).rows[0].n, 14);
    const row = (await db.query("select * from historical_fixture")).rows[0];
    assert.deepEqual(row.original, original);
    assert.equal(row.total, 12345);
    const manifest = (
      await db.query(
        `select * from ${result.snapshot.schema}.__manifest where source_table='historical_fixture'`,
      )
    ).rows[0];
    assert.equal(manifest.verified, true);
    assert.deepEqual(
      (await db.query(`select * from ${result.snapshot.schema}."${manifest.snapshot_table}"`))
        .rows[0],
      row,
    );
    assert.equal(
      (
        await db.query("select has_schema_privilege('public',$1,'USAGE') as permitted", [
          result.snapshot.schema,
        ])
      ).rows[0].permitted,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from information_schema.columns where table_name='commerce_orders' and column_name in ('priority','tags')",
        )
      ).rows[0].n,
      2,
    );
    assert.equal((await runOwnerRelease(options)).applied, 0);
  });
});
test("a failure in the fifth migration rolls back all changes and the snapshot", async () => {
  const target = await mkdtemp(join(tmpdir(), "rec-owner-release-"));
  try {
    for (const name of entries)
      await writeFile(join(target, name), await readFile(new URL(name, directory)));
    await writeFile(join(target, OWNER_MIGRATIONS.at(-1)), "select missing_release_function();");
    await fixture(async (db, options) => {
      await assert.rejects(runOwnerRelease({ ...options, directory: target }));
      assert.equal((await db.query("select count(*)::int as n from _migrations")).rows[0].n, 9);
      assert.equal(
        (await db.query("select to_regclass('commerce_inventory_imports') as name")).rows[0].name,
        null,
      );
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
    assert.ok(resolve(target).startsWith(resolve(tmpdir()) + sep));
    assert.ok(target.split(sep).at(-1).startsWith("rec-owner-release-"));
    await rm(target, { recursive: true });
  }
});
