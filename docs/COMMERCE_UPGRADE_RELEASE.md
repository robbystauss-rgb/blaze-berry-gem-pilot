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
