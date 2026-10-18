import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STUDIO_TARGET,
  STUDIO_BASELINE,
  STUDIO_MIGRATIONS,
  studioReleaseConfiguration,
  studioReleasePlan,
  runStudioRelease,
} from "./release-studio-documents.mjs";
test("Studio migration cannot inherit previous production approval", async () => {
  for (const target of [
    undefined,
    "production-approved",
    "owner-completion-2026-10",
    "retire-112pm-2026-10",
  ])
    assert.deepEqual(
      await runStudioRelease({
        env: { REC_MIGRATION_TARGET: target },
        connect() {
          throw Error("must not connect");
        },
      }),
      { skipped: true },
    );
});
test("Studio release requires exact production database and newly authorized commit", () => {
  const env = {
    REC_MIGRATION_TARGET: STUDIO_TARGET,
    VERCEL_ENV: "production",
    DATABASE_NEON_PROJECT_ID: "damp-glitter-64854598",
    REC_RELEASE_COMMIT_SHA: "a".repeat(40),
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    DATABASE_URL: "postgres://invalid.test/not-connected",
  };
  assert.equal(studioReleaseConfiguration(env).sha, "a".repeat(40));
  for (const patch of [
    { VERCEL_ENV: "preview" },
    { DATABASE_NEON_PROJECT_ID: "other" },
    { REC_RELEASE_COMMIT_SHA: "b".repeat(40) },
  ])
    assert.throws(() => studioReleaseConfiguration({ ...env, ...patch }), /Approved release/);
});
test("Studio release only applies 0016 and rejects incomplete, foreign or later migration scope", () => {
  const entries = [...STUDIO_BASELINE, ...STUDIO_MIGRATIONS];
  assert.deepEqual(
    studioReleasePlan(entries, STUDIO_BASELINE).map((p) => p.name),
    STUDIO_MIGRATIONS,
  );
  assert.deepEqual(studioReleasePlan(entries, entries), []);
  for (const [e, a] of [
    [entries, STUDIO_BASELINE.slice(1)],
    [[...entries, "0017_future.sql"], STUDIO_BASELINE],
    [entries, [...entries, "0099_foreign.sql"]],
  ])
    assert.throws(() => studioReleasePlan(e, a), /Release refused/);
});
