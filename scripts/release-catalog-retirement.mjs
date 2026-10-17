// Separate opt-in release; normal builds never execute this retirement migration.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  OWNER_BASELINE,
  OWNER_MIGRATIONS,
  OWNER_RELEASE_TARGET,
  ownerReleaseConfiguration,
} from "./release-owner-completion.mjs";
import { runReleaseDatabase } from "./release-database.mjs";
import { pendingMigrations } from "./migration-plan.mjs";
export const RETIREMENT_TARGET = "retire-112pm-2026-10";
export const RETIREMENT_BASELINE = [...OWNER_BASELINE, ...OWNER_MIGRATIONS];
export const RETIREMENT_MIGRATIONS = ["0015_retire_112pm.sql"];
export function retirementConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== RETIREMENT_TARGET) return null;
  return ownerReleaseConfiguration({ ...env, REC_MIGRATION_TARGET: OWNER_RELEASE_TARGET });
}
export function retirementPlan(entries, applied) {
  const known = [...RETIREMENT_BASELINE, ...RETIREMENT_MIGRATIONS];
  if (
    RETIREMENT_BASELINE.some((n) => !applied.includes(n)) ||
    applied.some((n) => !known.includes(n)) ||
    known.some((n) => !entries.includes(n)) ||
    new Set(applied).size !== applied.length
  )
    throw Error(
      "Release refused: retirement requires the complete fourteen-file baseline and exact reviewed scope.",
    );
  const pending = pendingMigrations(entries, applied);
  if (pending.some((p) => !RETIREMENT_MIGRATIONS.includes(p.name)))
    throw Error("Release refused: retirement migration scope exceeded.");
  return pending;
}
export function runRetirementRelease(options = {}) {
  return runReleaseDatabase({
    ...options,
    configuration: retirementConfiguration,
    plan: retirementPlan,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runRetirementRelease().catch((e) => {
    console.error(
      "[retirement-release]",
      /^(Approved release|Release refused|Snapshot permissions)/.test(e.message)
        ? e.message
        : "Database operation rejected.",
    );
    process.exitCode = 1;
  });
