// Explicit future release only. A normal build never opens a database for 0016.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RETIREMENT_BASELINE, RETIREMENT_MIGRATIONS } from "./release-catalog-retirement.mjs";
import { ownerReleaseConfiguration, OWNER_RELEASE_TARGET } from "./release-owner-completion.mjs";
import { runReleaseDatabase } from "./release-database.mjs";
import { pendingMigrations } from "./migration-plan.mjs";
export const STUDIO_TARGET = "signature-documents-2026-10";
export const STUDIO_BASELINE = [...RETIREMENT_BASELINE, ...RETIREMENT_MIGRATIONS];
export const STUDIO_MIGRATIONS = ["0016_signature_documents.sql"];
export function studioReleaseConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== STUDIO_TARGET) return null;
  return ownerReleaseConfiguration({ ...env, REC_MIGRATION_TARGET: OWNER_RELEASE_TARGET });
}
export function studioReleasePlan(entries, applied) {
  const known = [...STUDIO_BASELINE, ...STUDIO_MIGRATIONS];
  if (
    STUDIO_BASELINE.some((n) => !applied.includes(n)) ||
    applied.some((n) => !known.includes(n)) ||
    known.some((n) => !entries.includes(n)) ||
    new Set(applied).size !== applied.length
  )
    throw Error(
      "Release refused: Studio documents require the exact fifteen-file baseline and reviewed scope.",
    );
  const pending = pendingMigrations(entries, applied);
  if (pending.some((p) => !STUDIO_MIGRATIONS.includes(p.name)))
    throw Error("Release refused: Studio migration scope exceeded.");
  return pending;
}
export function runStudioRelease(options = {}) {
  return runReleaseDatabase({
    ...options,
    configuration: studioReleaseConfiguration,
    plan: studioReleasePlan,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runStudioRelease().catch((e) => {
    console.error(
      "[studio-release]",
      /^(Approved release|Release refused|Snapshot permissions)/.test(e.message)
        ? e.message
        : "Database operation rejected.",
    );
    process.exitCode = 1;
  });
