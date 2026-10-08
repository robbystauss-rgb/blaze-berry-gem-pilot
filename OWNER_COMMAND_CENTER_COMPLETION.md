# Operations completion — 2026-10-08

The owner authorized finishing and publishing the remaining work. This extends the initial implementation and release reports; it does not claim that unavailable business inputs or external verification are complete.

## Additional implemented operations

- Full filtered CSV export, including all matching pages within a consistent database snapshot. Section permissions apply independently of reporting permission. Payment exports preserve transaction references and actual fees; inventory includes available stock, including unknown counts. Spreadsheet formula injection is escaped. Exports above 50,000 records require narrower filters and never silently truncate. Backend audit records export actor/count without copying customer data into logs.
- Private production files, with revision/approval notes, actor and timestamp. Repeated uploads use an idempotent request identifier. Files are immutable, original customer artwork/specifications remain untouched, and production staff may access only assigned orders. Secure authenticated downloads reuse the existing artwork endpoint. Maximum upload size is 3 MB to fit the hosting request limit.
- Privileged-account authenticator recovery codes. Eight random codes are displayed once and stored only as hashes. Regeneration invalidates earlier codes. Recovery invalidates all device proofs and codes; a new authenticator must be enrolled and verified before merchant access resumes. Failures use the existing persistent rate limit. No owner password or authenticator secret is selected or recorded by the implementation.
- Scheduled catalog publication. An active product with a future publication timestamp is unavailable in catalog reads and checkout until that timestamp. Draft/inactive/archived products stay unavailable. Owners can remove or change a schedule; the original order snapshots and hat builder configuration are unchanged.
- Explicit provider-confirmed voiding of unpaid invoices. Provider associations are checked, idempotent void requests retain financial history, and a manual receipt is permitted only after the invoice link is confirmed void. Collected invoices cannot be voided through this operation. No invoice, message, charge or refund is sent during testing.

## Data and routes

Additive migration `0005_operations_completion.sql` adds `commerce_products.publish_at`, immutable `commerce_production_files`, hashed `commerce_mfa_recovery` and supporting indexes. Existing rows, order items, provider references and stock quantities are preserved. Retain these additions on rollback; they do not require destructive schema reversal.

Updated sections: `/admin?section=orders`, `production`, `payments`, `products`, `security`, and record exports in the authorized list sections. `/api/artwork/:id` also serves private production-file versions. `/shop`, `/product/:id` and catalog checkout enforce publication dates. Normal builds do not run database migrations.

## Validation

30 commerce integration tests pass in isolated PGLite with mocked processors. These include all prior payment/inventory/order/auth safeguards plus file immutability/assignment/idempotency, hashed recovery/replay/revocation, multi-page export/permissions/formula protection, publication scheduling, provider invoice void/manual-receipt sequencing, encrypted/idempotent webhook registration and cross-business history filtering. The existing 201 script, 55 application and 31 geometry tests also pass: 317 total.

Mobile browser checks passed for actual production-file upload, full-record CSV export, authenticator verification and recovery-code generation/clearing. Storefront desktop/mobile checks show visible content, no horizontal overflow and no console/page errors. No physical iPhone certification is claimed.

## Activation boundaries

Hosted inspection confirmed one owner and one enrolled owner authenticator. Physical inventory counts and material quantities require genuine business measurements. Stripe's connected plugin currently requests sign-in again, and the installed key returns HTTP 403 for account-branding reads. Native invoice branding and a verified sender must be established before enabling invoice sending; mock integration success does not establish email delivery. Production PayPal credentials and a separate sandbox database are not currently configured.

Migration `0006_provider_activation.sql` adds encrypted Stripe receiver registration. The owner-only payment connection action uses the existing native Stripe SDK. Signing secrets are encrypted with a distinct AES-GCM key derived from the configured secure root, never returned to the browser or audit. Registration pauses delivery until the tested receiver is deployed; activation verifies destination and event subscriptions. Existing provider endpoints remain untouched. Registration/activation is idempotent and failures remain visible. The original environment signing secret remains supported.

Historical import now verifies both REC storefront return URL and REC product branding in the actual provider records before reconciling receipts/refunds. It does not fabricate missing artwork, fulfillment status or inventory movements. The approved release operation prints aggregate counts only. Product image uploads are limited to 3 MB to fit the hosting request size.

Read-only hosted inspection is available through `scripts/commerce-readiness.mjs` with `REC_OPERATIONS_INSPECT=approved`. It prints only aggregate activation counts and public provider configuration, never secrets or customer records. Any actual deployment/provider inspection result will be recorded below after verification.

## Verified production completion

The owner-approved operations release is READY and published at https://recmamamade.com. Admin access is https://recmamamade.com/admin through the existing login. Operational source commit: `122e98609480583ca8041bb8cfd986de314c1a2b`; tree `a4c0f534f9ad981c6ccb89bb584a37118e168234`. Vercel project `prj_KdYbzGJ9NSYDHUD05yfI4b2hUXbI`, team `team_oe4lBIN5llWYWSaTj4ZWz2L4`. Staged receiver deployment `dpl_9Tm9gzxxhRLBn1Ts6LSJcXpV1Lss` was checked and promoted before enabling provider events. Post-activation deployment `dpl_9iADtFgDaA184Cx4ZaJcDAewDhJg` has the same verified code and completed approved operations. Normal `npm run build` and automatic domain assignment are restored. Subsequent documentation-only revisions do not rerun operations or migrations.

Hosted read-back confirms:

- One owner and one enrolled owner authenticator. No agent-selected password or owner impersonation was used.
- One enabled live Stripe endpoint at the exact REC webhook URL, with checkout, invoice, refund and dispute subscriptions. The two existing endpoints were preserved. Encrypted registration and provider activation were attributed to the actual invited owner under their explicit release approval.
- Fourteen actual checkout records scanned; one REC record eligible and imported; zero reconciliation errors. Other business records were excluded. The application now has one genuine historical order and one trusted receipt. Original metadata and transaction reference are preserved; unavailable historical artwork and fulfillment details are clearly marked for review. No stock allocation or deduction was applied to history.
- Zero entered inventory counts. Inventory remains setup-required until genuine counts and recipes are entered.
- Stripe account-branding retrieval returns HTTP 403 `more_permissions_required`; invoice sender/branding verification remains blocked. The connected Stripe plugin also requires reauthentication. No live invoice, refund, charge or customer email was initiated during testing or release.

Live homepage and original hat-order page pass desktop 1280×800 and mobile 390×844 checks: HTTP 200, matching prior storefront text, no overflow or browser errors. Anonymous admin renders “Merchant access required”; anonymous sessions return null; private artwork returns 401; unsigned Stripe POST returns 400. Local browser checks exercise payment-connection failure states without provider credentials. Runtime inspection found only the existing PostgreSQL SSL-mode compatibility warning, with no observed application failure. No log-drain subscription was added. Physical iPhone Safari and actual external sandbox checkout/invoice round trips remain unverified.

## Remaining infrastructure and operational inputs

Required existing environment: persistent `DATABASE_URL`, stable `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_MFA_ENCRYPTION_KEY`, enabled auth/MFA flags, existing Stripe key/account and checkout settings. Registered webhook signing secrets are encrypted in the database; keep the MFA encryption root stable. The original environment signing secret remains a compatible fallback. Invoices additionally require provider account-read permission, reviewed REC Mama Made business name/support email, `REC_INVOICE_SENDER` and `REC_INVOICE_BRANDING_VERIFIED`; do not set the verification flag before that review. PayPal production credentials and a separate staging database/provider sandbox are absent. No secrets appear in this report.

Owner business inputs: verified stock counts, explicit whole-unit component recipes, review of historical production specifications, and a verified sender. Optional unimplemented extensions remain carrier tracking/exception sync, external communication history, configurable production-stage definitions, fractional consumables and PayPal history import. Specialized hat-builder model/color/image/calibration/price configuration remains protected; ordinary catalog editing and safe builder text overlays are available. The full original definition of done is not claimed while invoice infrastructure and these stated limits remain unresolved.

## Rollback

The pre-completion owner-dashboard deployment is `dpl_JE9c7kfFwpcb2DuJgURHBq5YfVB7` (source `a64cc6de8d1fd4c89c71e274c52eb5c1139fac43`). Promote that deployment only after pausing the newly registered Stripe receiver or retaining a compatible receiver for payment events; its older receiver cannot decrypt the new database registration. Restore delivery on a compatible release and reconcile/replay any pending provider events. Preserve migrations 0005/0006, the encryption root, imported history, transaction references, audit and file records. Never delete real orders or reverse financial actions as schema rollback. Ordinary future releases use the normal build; migrations and approved operations are explicit, independent steps. The older pre-upgrade storefront rollback is documented in the initial release report.
