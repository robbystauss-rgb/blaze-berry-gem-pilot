# Signature Studio invoices and separate design proofs

New owner entry points are `/admin?section=invoices` and `/admin?section=proofs`. Existing order details link directly to each workspace with the order selected. Both require the existing **owner / finance** permission on every server function and file request. Managers and production staff cannot issue, email, void or publish these documents.

## Owner workflow

1. Create a custom itemized invoice, or select an eligible unpaid existing order. Existing order items and amounts remain authoritative. Enter the actual due date, shipping, tax, discount and any applicable terms; the application supplies no tax rate or new default terms. Confirm total and availability. If artwork approval is required, select its separate requirement before issue.
2. Save Draft; preview the customer document and download its PDF. Issue freezes its numbered contents and creates exactly one normal order for a custom invoice. Sequence numbers may have gaps after failed transactions; numbers are never reused.
3. Prepare Stripe payment. This reuses `commerce_invoices`, the existing Stripe integration and immutable order totals. Review the private document, then send its separate invoice email. Email submission never marks a payment received.
4. For that order, create a separate Design Proof. Upload PNG/JPEG/WebP images (up to six, 3 MB each), arrange them, record the exact physical specifications and choose expiration. Save, preview and issue; then send the separate proof email.
5. Customers can approve the exact current version or request changes with a message, name, matching customer email and explicit confirmation. A revision is a new draft/version; issuing it supersedes and revokes the earlier link and restores the artwork hold. A timely approval remains valid after link expiry. A replaced, expired, withdrawn or superseded link cannot submit a response.
6. Orders show separate payment and artwork statuses. Full verified payment and the current required approved proof are checked under the order lock before production/shipping mutations. Moving an existing approval-stage order backwards cannot remove its proof requirement. Starting a new proof after production begins is refused.

Use **Create / replace private link** to revoke an older link; the raw token is shown only at issue/rotation and retained in the restricted email payload for safe retries. Links are customer capabilities and should be kept private. Invoice link access expires after 30 days and can be renewed by the owner; this is an access expiration, not cancellation of the underlying invoice debt. A proof uses the explicitly chosen expiration.

For deliberate email resend, prepare a new delivery request. For an uncertain transport result, retry the same request; payload/idempotency checks prevent silent changed-content retries. After 23 hours, uncertain submissions require provider review. **Accepted** means provider acceptance; **Check provider delivery** reads provider evidence before showing **Delivered**. Permanent rejection and bounces remain visible. Payment, approval and revision alerts also use the existing owner notification/outbox infrastructure and deduplicate repeated events.

## Documents and history

Invoice and proof have different pages, numbers, PDF files, images, emails and state machines. The invoice contains no proof image or approval form. `pdf-lib` generates actual US Letter PDFs; no browser screenshot/print service is needed in production. The existing brand asset is embedded locally. Unsupported glyphs outside the built-in Latin PDF fonts are replaced; inspect draft PDFs for international text before issue.

The issued PDF and exact proof images are frozen in the database. Later downloads append current payment/refund history or a proof response record when applicable, preserving the original pages. The proof PDF never receives invoice payment controls. Original order artwork and production files remain separate and unchanged.

Void first requires confirmed provider void for an unpaid provider invoice. A replacement for the same order preserves its old provider row in immutable history and uses a new document-specific idempotency namespace. Delayed historical provider events cannot overwrite the active provider reference. Issued amounts are never edited in place.

Existing checkout obligations stay in their original checkout workflow; an order with a recorded checkout cannot acquire a competing invoice. New Studio billing requires an unpaid, uncanceled order. Deposits and partial-payment collection are not enabled by this feature. Existing ledger partial/refund/dispute states are displayed; reconcile exceptional provider states before further collection. Custom ad hoc lines require owner confirmation of availability; use an existing inventory-mapped order for automatic reservations.

## Configuration

No secret is exposed in merchant forms. Existing Stripe credentials, reviewed REC Mama Made branding/sender and signed webhook configuration are reused. Existing transactional email configuration is reused: `RESEND_API_KEY`, `REC_ORDER_EMAIL_FROM`, `REC_ORDER_EMAIL_TO`, `REC_ORDER_EMAIL_SENDER_VERIFIED=true`. Verify the actual sender/domain in the correct provider workspace before enabling delivery.

Stripe's own-account response can omit `business_profile`. In that case, in addition to `REC_INVOICE_BRANDING_VERIFIED=true` and the reviewed `REC_INVOICE_SENDER`, set `REC_INVOICE_STRIPE_ACCOUNT_ID` to the exact account whose public business name and support email were verified in Stripe's dashboard. The application checks that pin against the authenticated account and checks the actual provider invoice's `account_name` before finalizing/sending or returning a payment link. An explicitly returned empty/mismatched profile is refused even with a pin. Never use the pin as a substitute for reviewing the actual public settings; never enable invoice flags for an unreviewed account.

Resend sending-only credentials can submit document emails but cannot retrieve delivery status. The owner delivery check requires a credential allowed to read sent emails; restricted credentials leave the message at its actual accepted state and show an actionable permission error. Verify delivery in Resend when read access is unavailable. Do not mark messages delivered merely because sending succeeded or a recipient is a provider test sink.

Public business email/phone come from the published `commerce_content` contact settings. Optional `REC_BUSINESS_ADDRESS` supplies a verified printable address; omission leaves it absent. Optional `REC_STUDIO_ORIGIN` permits one exact HTTPS preview origin for document emails. The verified storefront and exact `VERCEL_URL` are already supported. These optional variables are not new credentials. No sample contact details or sender from a design reference are used as real settings.

Private HTML, server responses, images and PDFs use no-store/noindex/no-referrer protections. Token hashes are SHA-256 of random 256-bit capabilities. Public responses are rate limited and mutations enforce the existing origin boundary. File requests require the exact capability/document pair or owner authorization. Proof images are copied privately at issue; no public gallery publication occurs.

## Verification

Run from the checkout:

```text
npm run test:studio
npm run test:studio:postgres
npm run test:commerce
npm run test:providers
npm run test:operations
npm test
npm run typecheck
npm run lint
npm run build
```

Browser acceptance requires a clean local server and no competing Vite integration tests (their dependency optimizer can trigger browser reloads):

```text
npm run qa:studio:server
# Separate terminal; start only after the ready message:
npm run qa:studio
```

The server refuses external credentials, persistent databases and production, and blocks external fetches. Its Stripe/Resend transports are explicit fixtures injected by the QA script only; no application debug/payment endpoint exists. The browser follows actual UI/server/database paths and posts natively signed events through the real webhook receiver. This establishes application reconciliation, not external Stripe settlement or real email delivery. Ignored `artifacts/studio/` contains JSON verdicts, captured test email summaries and downloadable PDFs; `screenshots/studio/` contains desktop/mobile captures. Test-only accounts use `.invalid` addresses.

The actual built bundle can additionally be tested without any injected provider transport:

```text
node scripts/qa-built-preview.mjs
# Separate terminal, after ready:
node scripts/qa-studio-built.mjs
```

Stop built preview before rebuilding on Windows, since the loaded Sharp DLL locks output files. Real Stripe sandbox payment, externally delivered webhooks, verified sender delivery and persistent preview PostgreSQL still require their own credentials and environment. Do not treat fixture transport results as external-provider evidence.

### Persistent PostgreSQL rehearsal

`test:studio:postgres` is skipped unless `REC_STUDIO_PG_VERIFY_URL` explicitly identifies a disposable database. A localhost database must be named `rec_studio_verification_<suffix>`. The test refuses an inherited application database or payment/email credentials, and refuses a database containing any public tables. It never drops or resets a database. It applies the real fifteen-file baseline, seeds synthetic historical records, rehearses rollback of 0016, commits 0016, and exercises real document services, separate PDFs, proof revisions, approvals and unpaid production holds. It compares exact historical-record fingerprints before and after migration. Evidence goes to ignored `artifacts/studio/postgres/<database-or-project>/`.

Remote execution additionally uses `previewDatabaseConfiguration` and requires `VERCEL_ENV=preview`, distinct pinned `REC_PREVIEW_DATABASE_PROJECT_ID` / `REC_PRODUCTION_DATABASE_PROJECT_ID`, `DATABASE_NEON_PROJECT_ID` matching the preview pin, `REC_PREVIEW_DATABASE_ACTION=initialize`, and a connection using verified TLS (`sslmode=verify-full`). Use a newly provisioned empty preview database; do not point this rehearsal at an existing preview or production application database. The CI PostgreSQL job provides an isolated PostgreSQL 17 service without external credentials and runs the preserved commerce/provider regressions as well as both Studio suites.

Feature-branch Git deployment is disabled in `vercel.json` for `feat/signature-invoice-proof` so preparing the review branch does not authorize publication. Remove that exact branch hold only as part of an explicitly approved preview/release. Preview environment variables must be branch-scoped, payment mode must remain sandbox, and automated email sending must stay disabled until safe recipients and provider credentials are verified. Never copy the production database URL into Preview.

## Migration, release and rollback

`0016_signature_documents.sql` is additive: document sequences/tables, immutable image/PDF snapshots, email outbox, proof controls and provider reference history. It seeds required holds for existing `customer_approval` orders without changing historical amounts, artwork, payments or order stages. Apply it before serving the new code. Local PGLite applies it to isolated test data; production never does so automatically.

Normal builds and previous release-approval flags cannot apply this migration. After a newly authorized production release, `npm run release:studio` requires `REC_MIGRATION_TARGET=signature-documents-2026-10`, the exact approved `REC_RELEASE_COMMIT_SHA` matching `VERCEL_GIT_COMMIT_SHA`, the verified existing production database/project, and the complete fifteen-file migration baseline. The existing runner locks, snapshots and applies only 0016 transactionally; it refuses foreign/newer scope and snapshots over its established cap. Review a provider-managed restore point/offsite backup first; its same-database logical snapshot is not disaster recovery.

Before release: validate on isolated persistent preview PostgreSQL with test credentials, complete external payment/webhook/email evidence, review PDFs/settings, then obtain approval for the exact commit. Production deployment, merge and migration are separate authorized operations.

Prefer a forward fix. Leave additive tables, issued documents, provider history and audit records intact. If application rollback is necessary after issuing proofs, pause production mutations or retain the new proof gate; an older application has no knowledge of these holds. Reconcile every active Stripe obligation and required proof before reopening production. Do not drop issued records or restore a pre-release database over new orders or payments.
