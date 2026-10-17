// Separate, commit-pinned owner-authorized release. The retired 0008/0009
// approval keeps its original scope; this opt-in never initializes a database.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASELINE_MIGRATIONS,
  RELEASE_MIGRATIONS,
  releaseConfiguration,
  runReleaseDatabase,
} from "./release-database.mjs";
import { pendingMigrations } from "./migration-plan.mjs";
export const OWNER_RELEASE_TARGET = "owner-completion-2026-10";
export const OWNER_BASELINE = [...BASELINE_MIGRATIONS, ...RELEASE_MIGRATIONS];
export const OWNER_MIGRATIONS = [
  "0010_owner_operations.sql",
  "0011_content_revisions.sql",
  "0012_quotes.sql",
  "0013_owner_tasks.sql",
  "0014_order_organization.sql",
];
export function ownerReleaseConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== OWNER_RELEASE_TARGET) return null;
  if (env.VERCEL_ENV !== "production" || env.DATABASE_NEON_PROJECT_ID !== "damp-glitter-64854598")
    throw Error("Approved release requires the verified production database and environment.");
  if (
    !/^[a-f0-9]{40}$/.test(env.REC_RELEASE_COMMIT_SHA || "") ||
    env.REC_RELEASE_COMMIT_SHA !== env.VERCEL_GIT_COMMIT_SHA
  )
    throw Error("Approved release requires the exact authorized commit SHA.");
  return releaseConfiguration({ ...env, REC_MIGRATION_TARGET: "production-approved" });
}
export function ownerReleasePlan(entries, applied) {
  const known = [...OWNER_BASELINE, ...OWNER_MIGRATIONS];
  if (OWNER_BASELINE.some((name) => !applied.includes(name)))
    throw Error("Release refused: all nine established baseline migrations are required.");
  if (applied.some((name) => !known.includes(name)))
    throw Error("Release refused: foreign or newer migration history.");
  if (known.some((name) => !entries.includes(name)))
    throw Error("Release refused: expected reviewed migration files are missing.");
  if (
    new Set(applied).size !== applied.length ||
    known.some(
      (name, i) =>
        applied.includes(name) && known.slice(0, i).some((prior) => !applied.includes(prior)),
    )
  )
    throw Error("Release refused: duplicate or gapped migration history.");
  const pending = pendingMigrations(entries, applied);
  if (pending.some(({ name }) => !OWNER_MIGRATIONS.includes(name)))
    throw Error("Release refused: migrations exceed this owner completion release.");
  return pending;
}
export function runOwnerRelease(options = {}) {
  return runReleaseDatabase({
    ...options,
    configuration: ownerReleaseConfiguration,
    plan: ownerReleasePlan,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runOwnerRelease().catch((error) => {
    console.error(
      "[owner-release] Failed:",
      /^(Approved release|Release refused|Snapshot permissions)/.test(error?.message || "")
        ? error.message
        : `Database operation rejected${error?.code ? ` (SQLSTATE ${error.code})` : ""}.`,
    );
    process.exitCode = 1;
  });
}
