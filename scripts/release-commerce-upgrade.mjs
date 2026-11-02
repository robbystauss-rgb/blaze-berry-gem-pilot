// Explicit operational release only. Normal application builds never invoke it.
// Offsite restore evidence must be verified by the operator before setting the
// commit-bound backup fields; the additional SQL snapshot is not an offsite copy.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEXT_BASELINE, TEXT_MIGRATIONS } from "./release-studio-text.mjs";
import { ownerReleaseConfiguration, OWNER_RELEASE_TARGET } from "./release-owner-completion.mjs";
import { runReleaseDatabase } from "./release-database.mjs";

export const COMMERCE_TARGET = "commerce-reliability-2026-10";
export const COMMERCE_BASELINE = [...TEXT_BASELINE, ...TEXT_MIGRATIONS];
export const COMMERCE_MIGRATIONS = [
  "0018_manual_payment_receipts.sql",
  "0019_customer_design_vault.sql",
];

function scope(env) {
  if (!["receipts", "core"].includes(env.REC_COMMERCE_RELEASE_SCOPE))
    throw Error("Release refused: choose the receipts or core release scope explicitly.");
  return env.REC_COMMERCE_RELEASE_SCOPE;
}

export function commerceReleaseConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== COMMERCE_TARGET) return null;
  const selected = scope(env);
  const config = ownerReleaseConfiguration({ ...env, REC_MIGRATION_TARGET: OWNER_RELEASE_TARGET });
  if (
    env.REC_COMMERCE_BACKUP_VERIFIED_SHA !== config.sha ||
    !/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{7,159}$/.test(env.REC_COMMERCE_BACKUP_REFERENCE || "")
  )
    throw Error(
      "Release refused: a verified restorable offsite backup must be bound to this commit.",
    );
  return { ...config, schema: config.schema + "_" + selected };
}

export function commerceReleasePlan(entries, applied, selected) {
  scope({ REC_COMMERCE_RELEASE_SCOPE: selected });
  const known = [...COMMERCE_BASELINE, ...COMMERCE_MIGRATIONS];
  const permitted = selected === "receipts" ? known.slice(0, -1) : known;
  const required = selected === "receipts" ? COMMERCE_BASELINE : known.slice(0, -1);
  const sqlEntries = entries.filter((name) => name.endsWith(".sql"));
  if (
    required.some((name) => !applied.includes(name)) ||
    permitted.some((name) => !entries.includes(name)) ||
    sqlEntries.some((name) => !known.includes(name)) ||
    applied.some((name) => !permitted.includes(name)) ||
    new Set(applied).size !== applied.length ||
    permitted.some(
      (name, index) =>
        applied.includes(name) &&
        permitted.slice(0, index).some((prior) => !applied.includes(prior)),
    )
  )
    throw Error(
      "Release refused: commerce migration history or files differ from the reviewed scope.",
    );
  return permitted.filter((name) => !applied.includes(name)).map((name) => ({ name, path: name }));
}

export function runCommerceRelease(options = {}) {
  const env = options.env || process.env;
  return runReleaseDatabase({
    ...options,
    env,
    configuration: commerceReleaseConfiguration,
    plan: (entries, applied) => commerceReleasePlan(entries, applied, scope(env)),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runCommerceRelease().catch((error) => {
    console.error(
      "[commerce-release]",
      /^(Approved release|Release refused|Snapshot permissions)/.test(error?.message || "")
        ? error.message
        : "Database operation refused; no private details logged.",
    );
    process.exitCode = 1;
  });
