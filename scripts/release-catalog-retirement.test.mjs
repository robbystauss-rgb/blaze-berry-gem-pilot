import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETIREMENT_TARGET,
  RETIREMENT_BASELINE,
  RETIREMENT_MIGRATIONS,
  retirementConfiguration,
  retirementPlan,
  runRetirementRelease,
} from "./release-catalog-retirement.mjs";
test("retirement release cannot connect without its new explicit approval target", async () => {
  for (const flag of [undefined, "disabled", "production-approved", "owner-completion-2026-10"]) {
    assert.deepEqual(
      await runRetirementRelease({
        env: { REC_MIGRATION_TARGET: flag },
        connect() {
          throw Error("must not connect");
        },
      }),
      { skipped: true },
    );
  }
});
test("retirement release is pinned to the reviewed production project and commit", () => {
  const env = {
    REC_MIGRATION_TARGET: RETIREMENT_TARGET,
    VERCEL_ENV: "production",
    DATABASE_NEON_PROJECT_ID: "damp-glitter-64854598",
    REC_RELEASE_COMMIT_SHA: "a".repeat(40),
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    DATABASE_URL: "postgres://invalid.test/not-connected",
  };
  assert.equal(retirementConfiguration(env).sha, "a".repeat(40));
  for (const patch of [
    { VERCEL_ENV: "preview" },
    { DATABASE_NEON_PROJECT_ID: "other-project" },
    { REC_RELEASE_COMMIT_SHA: "b".repeat(40) },
  ])
    assert.throws(() => retirementConfiguration({ ...env, ...patch }), /Approved release/);
});
test("only 0015 can follow the established baseline; later and foreign migrations fail closed", () => {
  const entries = [...RETIREMENT_BASELINE, ...RETIREMENT_MIGRATIONS];
  assert.deepEqual(
    retirementPlan(entries, RETIREMENT_BASELINE).map((p) => p.name),
    RETIREMENT_MIGRATIONS,
  );
  assert.deepEqual(retirementPlan(entries, entries), []);
  assert.throws(() => retirementPlan(entries, RETIREMENT_BASELINE.slice(1)), /Release refused/);
  assert.throws(
    () => retirementPlan([...entries, "0016_future.sql"], RETIREMENT_BASELINE),
    /scope exceeded/,
  );
  assert.throws(() => retirementPlan(entries, [...entries, "0099_foreign.sql"]), /Release refused/);
});
