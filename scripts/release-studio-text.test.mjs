import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TEXT_TARGET,
  TEXT_BASELINE,
  TEXT_MIGRATIONS,
  textReleaseConfiguration,
  textReleasePlan,
  runTextRelease,
} from "./release-studio-text.mjs";
test("Native text migration requires its own explicit exact-commit production authorization", async () => {
  for (const target of [
    undefined,
    "disabled",
    "signature-documents-2026-10",
    "production-approved",
  ])
    assert.deepEqual(
      await runTextRelease({
        env: { REC_MIGRATION_TARGET: target },
        connect() {
          throw Error("Must not connect");
        },
      }),
      { skipped: true },
    );
  const env = {
    REC_MIGRATION_TARGET: TEXT_TARGET,
    VERCEL_ENV: "production",
    DATABASE_NEON_PROJECT_ID: "damp-glitter-64854598",
    REC_RELEASE_COMMIT_SHA: "a".repeat(40),
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    DATABASE_URL: "postgres://invalid.test/not-connected",
  };
  assert.equal(textReleaseConfiguration(env).sha, "a".repeat(40));
  for (const patch of [
    { VERCEL_ENV: "preview" },
    { REC_RELEASE_COMMIT_SHA: "b".repeat(40) },
    { DATABASE_NEON_PROJECT_ID: "wrong" },
  ])
    assert.throws(() => textReleaseConfiguration({ ...env, ...patch }), /Approved release/);
});
test("Native text release can apply only additive 0017 on the full sixteen-file baseline", () => {
  const entries = [...TEXT_BASELINE, ...TEXT_MIGRATIONS];
  assert.deepEqual(
    textReleasePlan(entries, TEXT_BASELINE).map((x) => x.name),
    TEXT_MIGRATIONS,
  );
  assert.deepEqual(textReleasePlan(entries, entries), []);
  for (const [e, a] of [
    [entries, TEXT_BASELINE.slice(1)],
    [[...entries, "0018_future.sql"], TEXT_BASELINE],
    [entries, [...entries, "0099_foreign.sql"]],
    [entries, [...TEXT_BASELINE, TEXT_BASELINE[0]]],
  ])
    assert.throws(() => textReleasePlan(e, a), /Release refused/);
});
