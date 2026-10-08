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

28 commerce integration tests pass in isolated PGLite with mocked processors. These include all prior payment/inventory/order/auth safeguards plus file immutability/assignment/idempotency, hashed recovery/replay/revocation, multi-page export/permissions/formula protection, publication scheduling, and provider invoice void/manual-receipt sequencing. The existing 201 script, 55 application and 31 geometry tests also pass: 315 total.

Mobile browser checks passed for actual production-file upload, full-record CSV export, authenticator verification and recovery-code generation/clearing. Storefront desktop/mobile checks show visible content, no horizontal overflow and no console/page errors. No physical iPhone certification is claimed.

## Activation boundaries

Owner password selection and authenticator enrollment require the invited owner to complete the private setup flow. Physical inventory counts and material quantities require genuine business measurements. Stripe's connected plugin currently requests sign-in again. Native invoice branding, configured sender and live webhook subscription must be verified before enabling invoice sending; mock integration success does not establish email delivery. Production PayPal credentials and a separate sandbox database are not currently configured.

Read-only hosted inspection is available through `scripts/commerce-readiness.mjs` with `REC_OPERATIONS_INSPECT=approved`. It prints only aggregate activation counts and public provider configuration, never secrets or customer records. Any actual deployment/provider inspection result will be recorded below after verification.
