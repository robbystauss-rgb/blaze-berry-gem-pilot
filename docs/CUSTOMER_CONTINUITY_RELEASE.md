# Customer document continuity

This follow-through release extends the existing Customer 360, quote editor and Signature Studio Invoice. It does not create a second customer database or change issued financial snapshots.

## Implemented

- Find an existing customer or create a persistent profile inside a quote or unlinked invoice. Edit contact details in a focus-managed dialog while retaining the document draft.
- Explicitly persist the selected customer ID on private drafts. Invoice issue and accepted estimates retain that same ID on the new order. Name/email resemblance alone never establishes the association.
- Surface linked estimates and unissued invoices in the customer's existing order/current-work view, including reviewed merge lineage.
- Reuse the profile phone for native invoice/proof sharing before an order has been issued. Editing that phone updates the same versioned customer record. Opening a device message composer does not claim delivery.
- A phone-only customer can be saved immediately and routed to the existing internal phone-order flow. Existing document paths retain their genuine-email requirement. No invented addresses, account invitations or automatic messages.
- Reject stale, archived, merged or unauthorized profile selections. Customer IDs are omitted from public document responses. Sensitive owner search inputs travel in POST bodies.
- Replace two remaining raw load-error displays, add the builder's accessible page heading, and explicitly preserve verified PostgreSQL TLS behavior as driver defaults evolve.

## Verification

Local verification includes three authenticated service integration cases; persistent browser creation, contact editing, invoice save/reload, profile reuse in an estimate and Customer 360 discovery; mobile 320/390px and desktop layouts; the existing CRM, Studio, owner operations, financial/proof gates and default regression suites; typecheck, lint and production build. Browser evidence stays in ignored artifacts and screenshots. Disposable PostgreSQL CI additionally exercises invoice issue and estimate acceptance with explicit customer identity, no duplicate profile and no public ID leakage.

The existing hat interaction sample remains a lab measurement: 90 drag frames on desktop and phone-sized headless Chrome, about 16.8ms at the 95th percentile, no observed long tasks. It is not field Core Web Vitals or a physical crown measurement.

## Schema and release

Migration `0020_customer_document_links.sql` adds two nullable customer foreign keys and two lookup indexes. Existing issued quotes/documents retain their original bodies, amounts, artwork, proofs, payment rows and contact snapshots. There is no speculative historical backfill.

Use the standalone `scripts/release-customer-continuity.mjs` operational runner. It requires the verified production project/environment, matching full source/release SHA, a recovery reference verified against that SHA and the complete nineteen-migration baseline. It applies only 0020; unexpected files/history are refused. Normal builds never run it. The atomic transaction also creates and verifies a restricted same-database snapshot. Repeated execution is a no-op.

A fresh provider recovery branch and separately readable rehearsal child were verified against production before applying 0020 on the child. Order, payment, item/artwork and document hashes remained identical after rehearsal (excluding only the new nullable document association). This is same-provider recovery, not an independently hosted offsite export. Do not overwrite, reset or delete either recovery copy during release.

Deploy only the tested tree after both CI jobs pass. Apply the additive migration before serving the new code, then verify the production alias, builder rendering, private-media denial and runtime errors. To roll back application behavior, restore the preceding production deployment while retaining the harmless nullable columns, indexes and snapshots. Do not drop schema or restore the whole database over subsequent customer activity. Any data restore requires a reviewed recovery operation.

## Evidence still required from the business

The affected order requires a genuine independently verified Venmo amount, receipt date/time and reference before recording payment. Its live ledger details remain private. The external payment is an owner attestation; the application cannot manufacture processor verification.

Real crown-reference measurements and sharper originals for thirteen limited-detail photos remain owner/source requirements. Estimated previews stay labeled. Richardson 112PM remains inactive. Public self-service vault editing, resumable large guest uploads and cost/margin reporting remain the brief's follow-on backlog; no unsupported policies, manufacturing services, price tiers or marketing messages are introduced by this release.
