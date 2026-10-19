// Explicit, additive release only. Normal builds never open the database.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STUDIO_BASELINE, STUDIO_MIGRATIONS } from "./release-studio-documents.mjs";
import { ownerReleaseConfiguration, OWNER_RELEASE_TARGET } from "./release-owner-completion.mjs";
import { runReleaseDatabase } from "./release-database.mjs";
import { pendingMigrations } from "./migration-plan.mjs";
export const TEXT_TARGET = "studio-native-text-2026-10";
export const TEXT_BASELINE = [...STUDIO_BASELINE, ...STUDIO_MIGRATIONS];
export const TEXT_MIGRATIONS = ["0017_studio_customer_contacts.sql"];
export function textReleaseConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== TEXT_TARGET) return null;
  return ownerReleaseConfiguration({ ...env, REC_MIGRATION_TARGET: OWNER_RELEASE_TARGET });
}
export function textReleasePlan(entries, applied) {
  const known = [...TEXT_BASELINE, ...TEXT_MIGRATIONS];
  if (
    TEXT_BASELINE.some((n) => !applied.includes(n)) ||
    applied.some((n) => !known.includes(n)) ||
    known.some((n) => !entries.includes(n)) ||
    new Set(applied).size !== applied.length
  )
    throw Error("Release refused: native texting requires the exact sixteen-file baseline.");
  const pending = pendingMigrations(entries, applied);
  if (pending.some((p) => !TEXT_MIGRATIONS.includes(p.name)))
    throw Error("Release refused: native texting migration scope exceeded.");
  return pending;
}
export function runTextRelease(options = {}) {
  return runReleaseDatabase({
    ...options,
    configuration: textReleaseConfiguration,
    plan: textReleasePlan,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runTextRelease().catch(() => {
    console.error("[studio-text-release] Database operation refused; no private details logged.");
    process.exitCode = 1;
  });
