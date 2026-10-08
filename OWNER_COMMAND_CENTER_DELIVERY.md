# REC Mama Made Owner Command Center — delivery report

2026-10-07 · Local implementation · Production deployment has not occurred.

The upgrade is implemented in the existing application, in the isolated `feat/owner-command-center` branch and `owner-command-center` worktree. Baseline: `7b2a0e44f2b665ad834eca9e868da7c6d1585339`. The synced `sources/` directory and the original checkout were not edited. The original storefront, catalog assets, crown geometry, patch sizing/placement/rendering, price tables, and payment providers are preserved.

**The complete live-business definition of done is still pending:** no staging database, real owner identity, processor credentials, verified invoice settings, or historical business records were available. Nothing here claims live historical sales, real stock counts, customer delivery, or production account access has been verified.

## Changes and reuse

Reused React 19, TanStack Start/Router, Tailwind, existing typography/design tokens, Better Auth and its Google/X sign-in capabilities, pg/Neon and PGLite database helpers, existing catalog/photo mappings, calibrated hat builder, server-side pricing, Stripe Checkout, PayPal/Venmo integration, and Vercel/Nitro deployment architecture. No Shopify migration, new paid subscription, raw-card storage, or storefront rebuild was introduced.

Read-only browsing of https://recmamamade.com confirmed the existing storefront and public Studio entry match the inspected repository. No live login, business mutation or checkout was attempted.

The audit found no durable application order/payment/inventory/customer ledger or backend staff portal. `/studio` was a browser-local visual review tool. It remains a separate visual review tool and is now protected; operational functions live in `/admin`.

## Implemented operations

| Area                    | Functionality connected to backend records                                                                                                                                                                                                       | Validation boundary                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Access                  | Real sessions; explicit owner provisioning; manager/production roles; server authorization on reads, mutations and files; no public merchant registration                                                                                        | Four isolated real-auth accounts exercised; actual production identities unavailable                                                  |
| Overview                | Actual receipts, refunds/net, today/7/30/90 days, date comparisons/trends, order/payment/production/stock/invoice attention counts; refresh every 60 seconds                                                                                     | Real local SQL records; no hardcoded business numbers                                                                                 |
| Orders                  | Search/status/date/pagination; original specifications and artwork; due dates, assignment, internal notes, tracking/carrier, stages, print summary and packing slip; legitimate unpaid drafts                                                    | Browser stage/note/order capture; immutable snapshot, concurrency and authorization integration tests                                 |
| Payments                | Separate collected/refund ledger and fulfillment stages; trusted processor references, fees when available; signed atomic/idempotent webhooks, pending/failed/refunded/disputed states; owner-only audited manual receipts and processor refunds | Provider responses mocked; native Stripe signature verification tested; no real charges/refunds                                       |
| Invoices                | Eligible unpaid draft review; Stripe invoice creation/finalization, hosted secure link, explicit send/resend; duplicate prevention and persistent retry references; account brand/contact checks                                                 | Mock provider integration including retries; Stripe test mode does not email customers; actual invoice sender/delivery unverified     |
| Inventory               | Unknown counts shown as setup required; genuine counts and adjustments with reasons; reserved/committed/available, incoming stock, thresholds, status/search filters, recipes and movement history                                               | Real local SQL transactions; reserve/commit/consume/release once; canceled unconsumed stock released; no invented material quantities |
| Production              | Artwork review, customer approval, ready/engraving/assembly/quality/packaging/shipping stages, assigned work, dates, notes, exact ordered options, raster artwork preview and protected source download                                          | Owner mobile changes and assigned-only staff view; original builder metadata transfer tested                                          |
| Catalog                 | Ordinary products: drafts, active/inactive/archive, duplicate, title/description/category/SEO, images upload/reorder/remove, variants/SKUs/prices/options, preview; `/shop` reads published records                                              | Browser create/upload/preview/save plus SQL activation tests; generic Stripe checkout requires credentials                            |
| Existing custom hats    | Safe model title/description overlay consumed by original catalog pages                                                                                                                                                                          | Browser save displayed on `/112`; configurations, photography, pricing and calibration protected                                      |
| Website                 | Announcement, homepage intro, featured ordinary products, contact, policy text, site SEO, version information                                                                                                                                    | Browser edit reflected on existing storefront; optimistic version checks and safe content restore tested                              |
| Customers               | Directory from actual orders, paid purchases/refunds/history/open obligations, shipping details, internal notes; own-account order access by authenticated user ID                                                                               | Customer saw only linked orders; matching an email does not grant order access                                                        |
| History                 | Backend actor/time/action/resource/before-after audit, append-only protection, filters/search, controlled website-content restore                                                                                                                | Database trigger, actor and stale restore tests                                                                                       |
| Alerts/reports          | Deduplicated in-app notifications; real receipts/refunds/trends, originally paid product/variant units, outstanding invoices, inventory and backlog; filtered current-page CSV with formula injection protection                                 | Backend metrics/dedup tests and mobile screens; page exports are explicitly labeled                                                   |
| Historical Stripe sales | Owner preview, date range/provider pagination, selected import of real paid USD checkout records and refunds; no inventory mutation or customer contact                                                                                          | Mock reconciliation/idempotency test; actual historical imports await credentials and review                                          |
| MFA                     | Encrypted TOTP enrollment, replay prevention, persistent failure lockout, per-session verification                                                                                                                                               | Cryptographic/database tests; stable encryption key and owner enrollment required for activation                                      |

Manual Venmo retains the existing payment destination. The customer first saves the actual order/specifications, then receives the existing Venmo link. The order remains unpaid until an authorized owner records verified received money. Browser QA exercised this flow without opening the external payment link or transferring money.

Draft orders can select already-configured production component recipes. Saving reserves those real units. Unknown stock must be counted before a mapped order can reserve it. Payments commit reservations; production consumes them once. Canceling releases unconsumed reservations/commitments. Consumed goods and refunds never automatically create physical stock: a verified adjustment with a reason is required.

Historical imports preserve provider amounts, payment dates and original metadata. Missing artwork, exact placement, bonus quantities and fulfillment facts are explicitly flagged. Imported records start needing historical review and are excluded from the “new orders” count until operational facts are reviewed. No fulfillment history is invented.

## Routes

- `/admin?section=overview|orders|payments|production|inventory|products|customers|website|activity|notifications|reports|staff|security`
- `/admin?section=orders&orderId=<id>` — order management
- `/login`, `/account` — existing auth mounted; customer account and role-aware staff entry
- `/studio` — existing visual review, protected with appropriate redirect states
- `/shop`, `/product/:id` (published details and saved SEO), `/info?page=contact|shipping_policy|refund_policy|privacy_policy`
- `/api/auth/*` — existing Better Auth
- `/api/artwork/:id` — private authorized original files
- `/api/catalog-image/:id` — published images or authorized draft access
- `/api/webhooks/stripe`, `/api/webhooks/paypal` — verified processor events

Sensitive data/mutations are guarded through server functions; hiding navigation is not the authorization mechanism. Production staff receive assigned work with financial and unnecessary contact data redacted.

## Migrations and storage

- `0001_auth.sql`: byte-identical copy of the existing dormant auth migration. No existing identity rows are removed or rewritten.
- `0002_commerce.sql`: additive merchant roles, orders/items, checkout references, payment/event/invoice/dispute records, notes, inventory/rules/allocations/movements, ordinary products/variants, content/assets, append-only audit, deduplicated notifications and encrypted MFA/session records; relevant indexes and constraints.
- `0003_financial_operations.sql`: additive refund request commitments, provider references and retry states.
- `0004_owner_setup.sql`: immutable single-use owner-invitation redemption record. The recipient must authenticate as the configured account and possess the private expiring invitation; existing identities/passwords are preserved.

Every migration applies transactionally and is recorded once. The explicit migration runner serializes concurrent runners with a PostgreSQL advisory lock. **Building no longer runs migrations.** `REC_MIGRATION_TARGET` gates explicit migrations. No production migration ran.

The production service needs the existing PostgreSQL/Neon database. Embedded local storage is intentionally ephemeral and shows a development warning. Financial checkout creation refuses production without durable storage. Source artwork and managed raster product assets use authorized database storage, without a new storage subscription.

## Verification results

- `npm run typecheck`: passed.
- `npm run build`: passed; original asset and crown calibration guards passed. Nitro output includes the embedded runtime files needed for local built-output previews.
- `npm test`: 201 script tests and 55 existing application/auth tests passed. The runner now actually discovers scripts on Windows; previously the quoted glob silently ran zero script tests. Generic PWA fixtures were isolated from actual REC Mama Made branding, and directory-link tests use Windows junctions.
- `npm run test:crowns`: 31 existing geometry/calibration tests passed.
- `npm run test:commerce`: 23 local integration tests passed, using actual PostgreSQL-compatible PGLite transactions and isolated Better Auth rows. Provider calls use mocks; no financial network transaction or live customer message occurred.
- Owner, manager, production and customer real local email/password logins worked. Owner business actions succeeded. Manager financial route was denied while inventory remained available. Production could access assigned work and was denied payments. Customer was denied merchant access and saw only their own linked orders.
- Phone-width owner sections all loaded without page overflow or visible error states. Order stage/notes, inventory count adjustment, product authoring/image upload/preview, catalog text editing, ordinary product publication/public detail navigation and SEO, website publishing and original-builder manual order capture were exercised through the browser.
- Desktop and 390 × 844 mobile storefront smoke checks passed in development and in the built-output preview (including the original builder): HTTP 200, no console/page errors, no horizontal overflow. Owner/admin screenshots and original builder rendering were visually inspected.
- Trusted late processor fees update the original receipt once without changing collected revenue or inventory; the duplicate-event integration check passed.

These results establish local behavior, not real-provider or production-database certification. No remaining failure is known in the executed local suites. Desktop/mobile test coverage does not certify every iOS Safari version; physical iPhone verification remains an activation check.

The smoke runner retains one pre-existing branding warning: the platform social-card fallback is used because `public/og.jpg` is absent. This does not affect dashboard operations or builder rendering; a custom social card remains outside this administration upgrade.

Local screenshots/verdicts: `C:/workspace/screenshots/rec-command-center/`. Test account credentials and temporary fixtures live only in ignored `artifacts/commerce-qa/`; they are not deployable seed data.

## Required configuration (names only; no secrets)

| Setting                                                                               | Purpose                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                        | Existing persistent PostgreSQL/Neon connection; separate staging target first                                                                                                                                                      |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`                                               | Stable secure auth signing secret and correct application origin                                                                                                                                                                   |
| `VITE_AUTH_ENABLED=true`                                                              | Keep existing real authentication enabled                                                                                                                                                                                          |
| `REC_OWNER_USER_IDS`                                                                  | Comma-separated verified existing owner auth IDs; obtain from the authenticated account screen, then provision securely                                                                                                            |
| `ADMIN_MFA_ENCRYPTION_KEY`                                                            | Stable secret 32-byte key encoded as 64 hex characters; preserve securely across releases                                                                                                                                          |
| `ADMIN_REQUIRE_MFA=true`                                                              | Require authenticator proof for privileged operations after enrollment                                                                                                                                                             |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                          | Existing Stripe account and signed webhook; use test keys for staging                                                                                                                                                              |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`, `PAYPAL_WEBHOOK_ID` | Existing PayPal integration and verified webhook; staging uses `sandbox`                                                                                                                                                           |
| `REC_INVOICE_BRANDING_VERIFIED=true`, `REC_INVOICE_SENDER`                            | Owner-reviewed REC Mama Made invoice identity/account configuration; contact must match Stripe account support email. Stripe controls actual invoice delivery/sender settings; review those in the account before enabling sending |
| `PAYMENT_SITE_URL`                                                                    | Existing checkout origin fallback                                                                                                                                                                                                  |
| Existing `GROK_AUTH_*` deployment settings                                            | Preserve configured Google/X federation where used; production OAuth remains unverified here                                                                                                                                       |
| `REC_MIGRATION_TARGET`                                                                | `development` or `staging` for explicit migration runs; `production-approved` only after explicit owner approval                                                                                                                   |

Use secure deployment environment settings. Do not paste secrets into source, browser-visible `VITE_*` variables, logs, screenshots, or chat.

For initial owner setup, `REC_OWNER_INVITE_SHA256`, `REC_OWNER_INVITE_EMAIL`, and `REC_OWNER_INVITE_EXPIRES_AT` enable the private `/owner-setup` flow. Only a digest is stored server-side. A configured recipient authenticates or chooses their own password before redeeming the invitation once. The raw invitation is provided separately to the owner; no public merchant signup or hardcoded owner password is introduced. Require MFA after redemption.

Configure Stripe subscriptions for checkout completed/async succeeded/async failed/expired, invoice state/payment events, charge refunds, refund created/updated/failed and dispute events. Configure PayPal capture completed/denied/refunded events. Test valid signatures, duplicate delivery, out-of-order retry and provider reconciliation against the staging URL. Events that cannot reconcile return retry responses rather than fabricating financial state.

## Blocked activation and remaining work

1. Connect a separate staging database; migrate and verify the actual existing owner/customer identities. Verify the deployment uses the intended existing provider accounts.
2. Run real Stripe test-mode checkout/invoice/refund/webhook round trips and PayPal sandbox equivalents. Actual sandbox credentials were absent. Stripe test invoices intentionally do not deliver email; verify REC Mama Made sender/branding through the provider configuration before any owner-authorized live send.
3. Reconcile actual historical records. The Stripe importer is implemented but has not imported real business history. A PayPal historical importer is not implemented. Designs absent from historical records cannot be reconstructed.
4. Enter owner-verified physical counts and explicit component recipes. There are no invented production stock counts or default material deductions. Review old draft/abandoned PayPal obligations and cancel those that are no longer valid; a timed abandonment worker is not implemented.
5. Existing specialized builder prices, model/color additions, calibrated image mappings and patch sizing remain protected. Safe catalog text editing is implemented; complete no-code editing of those specialized configurations is not implemented. Ordinary product variants/prices/images/options are editable.
6. Shipping carrier status sync/exceptions, customer communication history/email service, separate approved-production-file uploads, scheduled publishing, configurable production stage definitions, fractional material units, and full-dataset report export jobs are not implemented. Tracking entry, original artwork, fixed production workflow, whole-unit recipes and filtered page CSV exports work.
7. Manual payments on an outstanding processor invoice/payment link are deliberately blocked to prevent double collection. Void/paid-out-of-band reconciliation currently requires the provider dashboard; that reconciliation action is not implemented in this admin UI.
8. Validate physical iPhone Safari, deployment callbacks/cookies, PostgreSQL permissions/backup/recovery and MFA recovery procedures in staging before approval.

The live business definition of done has not been claimed. These remaining items are explicit deployment/infrastructure or feature limits rather than disconnected buttons presented as working features.

## Deployment and rollback

Ready for staging configuration and review. **Not cleared for production deployment; explicit owner approval remains required.** No push, publication, production mutation, real customer message, or real charge was performed.

1. Review the audit, migration files and isolated branch. Back up the target database and capture the current deployed version and provider webhook settings.
2. Set staging-only credentials, stable auth/MFA keys and the verified test owner ID. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run test:crowns`, `npm run test:commerce`, and `npm run build` with appropriate isolated/test configuration.
3. Set `REC_MIGRATION_TARGET=staging` and explicitly run `npm run db:migrate` against the separate staging database. Building alone cannot migrate it. Test all real sandbox flows, past-record reconciliation and phone actions.
4. Prepare the concrete staging result for owner approval. Only after explicit production authorization: back up production, explicitly approve production migration target, run additive migrations, release through the existing Vercel process, and configure/verify signed webhook endpoints. Keep the old build available.
5. If rollback is needed, preserve all commerce/auth/audit/payment tables and provider references. Do not drop tables or reverse receipts/refunds/shipments. Pause new checkout initiation if reverting the ledger capture code; retain a compatible webhook receiver or replay provider events once the corrected release is active. Restore the prior application artifact only with this payment-continuity plan. Website content can use its controlled restore action; financial and shipped-order history cannot be rolled back through that action.

## Local review

Run `npm run qa:server` for guarded, isolated test accounts and clearly labeled test fixtures at `http://localhost:8080`. This helper refuses persistent databases, production and payment credentials. It is never imported by deployment routes. Use `npm run dev` for the normal application without test business records. Use `npm run preview -- --host 127.0.0.1 --port 8081` to inspect the built artifact. Local embedded records reset on restart.
