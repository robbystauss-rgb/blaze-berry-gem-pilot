# Commerce upgrade — review and release holds

Baseline: `bbb2f83bf57726bbc4aaa7cb62d80dc041a50c5d` (main inspected 2026-10-30).
Feature branch: `codex/commerce-reliability-customer-vault`.

## P0: external payment receipt

VERIFIED: the original form accepted a required-only verification note while the
server required five trimmed characters. Its error handler displayed the Zod
message verbatim. A new request UUID was generated on every submit and the server
validated but discarded that UUID. Existing deduplication used only the external
reference. Studio documents and Stripe invoices occupy different tables. Pending
checkout conflicts had no owner action in the workspace. Invoice creation could
also be in flight before a provider id had been assigned.

IMPLEMENTED on this branch: shared readable validation, explicit external method,
integer-cent parsing, local-time entry, tab refresh recovery, retry-stable request
ids, receipt fingerprint validation, normalized reference checks, transaction
locks, ledger-derived receipt summary, private method/actor/time/note audit, and
provider-confirmed unpaid Stripe checkout expiry. External receipts do not mark
Stripe/PayPal checkouts paid. An expired checkout webhook cannot cancel an order
whose checkout has already been explicitly reconciled. Refund orders require
finance review before collecting again. No prices or proof approvals change.

VERIFIED locally: 50 existing commerce tests and 20 provider-boundary tests pass.
Six dedicated payment tests cover validation, simultaneous/retried receipts,
partial/full payments, immutable prices, permission and excess-amount failures,
invoice creation/checkout conflicts, provider expiry and independent proof holds.
The 390 × 844 browser journey checks inline errors, form recovery, payment save,
refresh persistence, no horizontal overflow and no page errors. Screenshots and
test output are in ignored `screenshots/manual-payment/` (synthetic data only).

NEEDS VERIFICATION: live order #4 has not been read or changed. This workspace
has no configured production database/provider access; Work browser access is
disabled. No independent Venmo receipt has been provided. Local checks do not
establish whether that live order has a payment or another blocking obligation.

Owner confirmation after an approved release: open order #4; review collected,
refunded and remaining totals and existing receipts first. Independently verify
the actual Venmo amount, time and transaction id. Resolve any active Stripe
invoice using the explicit unpaid-invoice void action, or reconcile/expire an
eligible checkout. Paid, processing or uncertain obligations require provider
review. Enter the actual receipt and a verification note. Confirm one receipt,
correct remaining balance and unchanged artwork approval hold after refresh.
Do not record a second receipt if payment history already contains it.

## Release control

## P1: persistent customer profiles, phone orders and private Design Vault

IMPLEMENTED: stable customer ids; name/optional email/phone/preferences/tags;
name/phone/email/customer/order-number search; duplicate review; owner-reviewed
profile linking with original ownership retained; archive/restore and private
record export. New order intake joins the same customer records. Phone contacts
feed the existing Studio text composer, without claiming SMS delivery.

Original artwork is immutable private database media with original bytes,
SHA-256, MIME, dimensions, provenance and separate raster preview. Saved designs
contain exact catalog model/colorway ids, nominal physical dimensions, material,
shape, text, normalized placement, quantity, instructions and immutable revisions.
Historical artwork can be retained from the Order Workspace without reuploading.
No vault artwork becomes public gallery media or a public account automatically.

The phone-order stepper uses the existing published price book, promotion and
inventory checks, existing order/items/ledger, server-generated frozen photo
snapshots, Signature Studio invoice, separate proof controls and native text
sharing. Every new phone order requires a new current proof; historic paid totals
and approvals remain unchanged. Phone-only customers can retain an unissued
order with NULL email. Invoice/proof issuing keeps the existing genuine-email
requirement. Changing a profile never rewrites issued customer documents.

VERIFIED: eight durable integration journeys, including full profile → source
art → saved design → phone draft → issued secure invoice → rotated proof →
manual receipt → approval → production, plus current-price repeat ordering and
separate-process reopening. A separate populated-database migration test verifies
0019 preserves original financial/artwork rows and separates shared-email people.
Real Chrome checks at 390×844 and 1440×1000 create a caller with no email, upload
source art, save exact 112/Black/circle choices, prefill a repeat, retain revisions,
log out/in from a fresh browser context, search by phone and reject customer and
production-role media downloads. Evidence is ignored under
`screenshots/customer-vault/`; fixtures are synthetic and no messages were sent.

Identity linking: public signup does not claim a profile using an email/phone.
Only a staff-administration permission can create the explicit account association
after an independently documented identity review and a verified existing account.
Linked account order visibility uses that association. Self-service vault editing,
automatic approval reuse and marketing consent are not enabled by a profile tag.

Migration `0019_customer_design_vault.sql` adds CRM tables, order/customer linkage
and optional order email. Historical profiles are backfilled per order, never
silently grouped by email. Production requires the existing durable Postgres;
`REC_TEST_DATABASE_DIR` is an isolated development-only PGlite persistence hook
which refuses production/Vercel. It is not a production-storage substitute.

Rollback after 0019: retain new tables and all source/revision/ledger records.
The old app does not safely support phone-only NULL-email drafts. Keep owner
order/document operations on the corrected application, or disable those
operations until compatibility is reviewed. Do not reintroduce NOT NULL while
phone-only drafts exist, and do not fabricate addresses or drop their records.

NEEDS VERIFICATION: Neon concurrency under a representative staging database,
actual owner/customer data linking review, measured physical crown references,
and device-native SMS composition on a physical iPhone. Local browser tests
emulate an iPhone viewport and do not establish real carrier delivery.

## Production release hold

NO-GO for production until approval and live-order/provider verification.
Nothing is merged, deployed or sent to real customers by this work.

Migration `0018_manual_payment_receipts.sql` is additive. Before approval, obtain
a verified offsite Postgres backup with restore test; inspect applied migration
history and test the exact release against an isolated copy. Apply no production
migration from a developer/preview build. Existing release scripts are opt-in;
their approved migration scopes must be reviewed separately for this release.

Rollback: revert application commits, retain additive columns and all recorded
financial rows. Never roll back by deleting receipts/audit/history. Old code can
read the expanded schema but loses the new receipt UX; disable manual recording
until the reviewed correction is restored. Reconcile any in-flight provider
action before re-enabling collection. Smoke-test role access, one sandbox partial
receipt, duplicate retry, active-link blocking, invoice/proof secure-link
separation and unpaid/unapproved production holds before any real receipt.

## Owner workspace milestone

IMPLEMENTED on the feature branch: grouped owner navigation, real active attention counts and filtered production views, three independent order states, next safe action, primary financial summary, versioned production-file sizes, linked document/order timeline, and readable publishing/gallery/pricing failures. No synthetic revenue or new messaging service.

VERIFIED: eight task/readiness integration tests, including all-time versus active counts, paid/unapproved versus paid/approved queues, and rejection of unpaid Ready for production. Browser comparisons against commit d3c5125 at 390px and 1440px have no horizontal overflow or page errors. Local evidence: screenshots/owner-workspace/{before,after}. Other staff continue to receive server-redacted financial/audit fields. Existing order, inventory, quotes and proof modules remain authoritative.

## Separate review artifacts

P0 is independently reviewable in [draft PR #10](https://github.com/robbystauss-rgb/blaze-berry-gem-pilot/pull/10), head b6a86c223b87bd4b74b949f1f100b93f49b5749a. Its receipt milestone is 4b23a76efc44c5336492a2ff2ea6b9505c04de9a. It needs migration 0018 only. Both GitHub CI jobs, including disposable PostgreSQL, passed for that exact head. Vercel returned zero deployments for it. The isolated checkout also passed typecheck, six payment tests and both default regression groups. It remains a draft and is not merged or live.

The broader branch retains the same tested Git trees. GitHub publication used the connected account because command-line Git credentials were unavailable; commit metadata changed while tree contents were verified identical:

| Milestone | Original local commit | Published equivalent |
|---|---|---|
| Receipt ledger correction | d4d8178 | 4b23a76efc44c5336492a2ff2ea6b9505c04de9a |
| Customer profiles, vault and phone drafts | d3c5125 | ba8d451e948e4cce4fc063c01b190e7990f93f57 |
| Owner readiness/workspace | af35b6c | 42e3e8f2d175cf6f53c5f0553ff8b3365ec00a97 |
| Studio, image delivery and connected intake/gallery | 9449a02 | f4419cd7d1fd2af438957adfd47ac0373b4883c9 |

Release sequence after explicit approval: back up and rehearse 0018, verify the P0 sandbox/provider cases, coordinate the compatible receipt-only application release, then privately reconcile order #4. Review/approve 0019 and the wider application separately after isolated Neon rehearsal, backfill identity review and photo review. If P0 merges first, refresh the wider PR against that approved main before release. Neither a PR nor passing CI authorizes production migration, merge, deployment or customer messaging.

The final evidence report is [COMMERCE_UPGRADE_EVIDENCE.md](COMMERCE_UPGRADE_EVIDENCE.md). Local browser artifacts stay in ignored screenshots/ and artifacts/ directories; source customer art and test session credentials are never attached to public PRs.

The broader PostgreSQL rehearsal passed at 27d6bca0f3a67bd51f90ebf00f0ce360e542b014. A final financial-readiness regression aligns the stage endpoint with the queue: an open dispute cannot advance a fully funded order, and resolving that dispute does not approve artwork or add a receipt. Consult the exact latest PR head checks before approval.

## Authorized publication and operational migration gate

The owner subsequently authorized publishing the completed upgrades in the task conversation. Release permission is granted; restorable backup and deployment verification are still required. A production read-only preflight verified the established seventeen-file migration history and identified only 0018/0019 as pending. Its diagnostic build intentionally stopped before serving an application. No business records were changed.

`npm run release:commerce` is a separate operational command and is never invoked by an ordinary build. It requires the existing verified production project, an exact commit match, a verified offsite-backup reference bound to that commit, and an explicit scope. The receipts scope applies only 0018 on the full 0017 baseline. The core scope applies only 0019 after 0018. Each uses the existing atomic transaction, restricted logical snapshot and migration-history checks. Snapshot names distinguish the two scopes. Unknown, gapped, duplicate or newer histories are rejected; repeat execution does not duplicate a migration or snapshot.

The logical snapshot is an additional same-database recovery aid, not an offsite backup. Do not set the verified-backup fields until the operator has verified an actual restorable backup. Database management access was not available through the connected deployment tools and browser control was disabled during preflight. Do not copy credentials into source, build commands or logs to work around that access gap.
