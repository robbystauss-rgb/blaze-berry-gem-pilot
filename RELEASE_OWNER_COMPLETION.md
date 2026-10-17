# Owner operations release: migrations 0010–0014

`scripts/release-owner-completion.mjs` is a separate opt-in release helper. The
retired `production-approved` helper still permits only 0008/0009; its approval
does not extend to these migrations.

Normal builds make no database connection through either release helper. This
release requires all of the following server-side build configuration:

- `REC_MIGRATION_TARGET=owner-completion-2026-10`
- `REC_RELEASE_COMMIT_SHA` equal to the full Git SHA being built
- `VERCEL_ENV=production`, the verified production Neon project ID, and the
  existing secured `DATABASE_URL`

Never copy production connection strings or service keys into Git, CLI arguments,
screenshots, or customer-facing settings. Preview databases are explicitly refused.

The helper requires the complete nine-file established migration baseline and
rejects foreign, duplicated, gapped, missing, or future migration history. It uses
the existing transaction/advisory lock, verifies a private consistent same-database
snapshot of every public table, and applies only the five reviewed additive files
atomically. A failed migration rolls back both schema changes and the snapshot.
An already-upgraded database makes no new snapshot or data changes.

The snapshot preserves original bytes, financial history and existing records; it
is **not an offsite disaster-recovery backup**. Keep independent provider backups
and recovery arrangements. The helper refuses snapshots above its 100 MiB cap
rather than silently omitting data.

Stage and verify the production build before promoting its domains. Check the
build log for the committed five-file migration transaction, then disable the
one-release flag. No sample orders, public gallery content, promotions, refunds,
charges or customer emails are created by these migrations.

If an application rollback is necessary, return traffic to the previous known-good
deployment. These additive tables/columns can remain while the previous application
runs. Preserve new quote/task/audit/order records; do not drop tables or restore a
snapshot over later business activity. A build failure after the migration transaction
commits leaves the additive schema in place and can be retried safely.

Verification: `node --test --test-concurrency=1 scripts/release-owner-completion.test.mjs scripts/release-database.test.mjs`.
