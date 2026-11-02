// Standalone operational release. Never invoked by a normal application build.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCE_BASELINE, COMMERCE_MIGRATIONS } from "./release-commerce-upgrade.mjs";
import { ownerReleaseConfiguration, OWNER_RELEASE_TARGET } from "./release-owner-completion.mjs";
import { runReleaseDatabase } from "./release-database.mjs";

export const CUSTOMER_TARGET = "customer-continuity-2026-11";
export const CUSTOMER_BASELINE = [...COMMERCE_BASELINE, ...COMMERCE_MIGRATIONS];
export const CUSTOMER_MIGRATIONS = ["0020_customer_document_links.sql"];

export function customerReleaseConfiguration(env) {
  if (env.REC_MIGRATION_TARGET !== CUSTOMER_TARGET) return null;
  const config = ownerReleaseConfiguration({ ...env, REC_MIGRATION_TARGET: OWNER_RELEASE_TARGET });
  if (
    env.REC_COMMERCE_BACKUP_VERIFIED_SHA !== config.sha ||
    !/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{7,159}$/.test(env.REC_COMMERCE_BACKUP_REFERENCE || "")
  )
    throw Error("Release refused: verify a restorable recovery branch and bind it to this commit.");
  return { ...config, schema: config.schema + "_customer" };
}

export function customerReleasePlan(entries, applied) {
  const known = [...CUSTOMER_BASELINE, ...CUSTOMER_MIGRATIONS];
  if (
    CUSTOMER_BASELINE.some((name) => !applied.includes(name)) ||
    known.some((name) => !entries.includes(name)) ||
    entries.some((name) => name.endsWith(".sql") && !known.includes(name)) ||
    applied.some((name) => !known.includes(name)) ||
    new Set(applied).size !== applied.length
  )
    throw Error(
      "Release refused: customer continuity files or migration history differ from review.",
    );
  return CUSTOMER_MIGRATIONS.filter((name) => !applied.includes(name)).map((name) => ({
    name,
    path: name,
  }));
}

export function runCustomerRelease(options = {}) {
  return runReleaseDatabase({
    ...options,
    configuration: customerReleaseConfiguration,
    plan: customerReleasePlan,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  runCustomerRelease().catch((error) => {
    console.error(
      "[customer-release]",
      /^(Approved release|Release refused|Snapshot permissions)/.test(error?.message || "")
        ? error.message
        : "Database operation refused; no private details logged.",
    );
    process.exitCode = 1;
  });
