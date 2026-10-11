# REC Mama Made order notifications

Implemented and verified in isolated development on October 11, 2026. Email sending is **paused**, pending REC Mama Made sender verification and a server-side sending credential. No live email delivery is claimed.

## What is connected

- Recipient configured for production: **recmamamade@gmail.com**.
- Custom checkout, catalog checkout and legitimate owner draft orders queue a new-order notification. Verified Stripe/PayPal payment records and authorized manual payments queue a separate paid-order notification when the full balance has been received.
- Existing dashboard notifications and real order/payment records are reused. Duplicate checkout retries and payment events do not create duplicate email jobs.
- Branded HTML and plain-text messages contain order number and ID, timestamp, customer name/email, order source, item names, purchased and fulfillment quantities, unit and line prices, all saved customization specifications, design text, notes submitted at checkout, patch shape/size/material, hat model/color, saved placement specifications, due date, shipping address and tracking where recorded, financial breakdown, actual collected payments/refunds, processor references and fees where available.
- Original saved PNG/JPG/WebP artwork is embedded and attached. SVG/PDF artwork is attached. Future catalog orders preserve product-photo references; future customized-hat orders preserve the matching catalog front-photo reference. Product photos are separate from submitted artwork; no replacement mockup or builder re-render is generated.
- Aggregate artwork attachments are limited to 24 MB of source bytes to stay within provider message limits. Larger orders retain protected artwork access through the order link. Missing original artwork is explicitly identified; historical upload markers cannot reconstruct files.
- Emails link to the existing protected order view: `/admin?section=orders&orderId=...`. Artwork endpoints and all owner/staff permissions remain protected.
- Owner notification view shows actual queue state and sanitized provider errors. “Accepted” means the email API accepted the message; it does not claim inbox delivery.

## Reliability and security

The email snapshot takes the same order lock as payment mutations, so its totals, payment ledger and shipping information agree. New-order email headings remain neutral if payment arrives before a queued alert is sent.

New additive migration: `migrations/0007_order_email_notifications.sql`. It creates the email outbox and a processing index; it does not update existing customers, orders, prices, payments, artwork or inventory. Historical reconciliation is excluded from automatic email backfill.

The outbox insert commits with the original order/payment notification. Sending occurs after the business transaction commits. Email outages cannot roll back orders or payment records. Concurrent workers use row locks and a short lease. Exact serialized email content and attachments are frozen before the first network attempt and retries reuse the same provider idempotency key. Temporary errors are backed off; permanent provider rejections remain visible. Uncertain deliveries older than 23 hours require provider-history review, rather than risk a duplicate outside the provider's deduplication window.

Sending attempts run after checkout creation, verified payment webhooks and applicable authorized order mutations. Vercel's daily scheduler processes remaining due jobs at 12:00 UTC. An owner can also use **Notifications → Process queued emails** for jobs due for retry. The scheduler endpoint `/api/notifications/order-email` requires `CRON_SECRET` in its Authorization header. Owner-triggered retry uses an authenticated POST server function, requires owner staff permissions and records an audit event. No credentials or complete private email payloads are exposed through dashboard reads or logs.

Primary login, roles, account records, checkout integrations, builder rendering/calibration and existing financial/inventory workflows are preserved. No customer messages or real charges were generated during testing.

## Configuration still required

The connected Resend account previously had only `dxsresearch.com` verified. A separate `recmamamade.com` domain has been created with sending enabled, receiving disabled and tracking disabled. **The DNS records below still need to be added at GoDaddy**, which hosts this domain's authoritative nameservers. The available GoDaddy connector does not provide DNS editing, and no authenticated browser surface was available. Existing website A/CNAME/MX records and nameservers were not changed.

Use Auto/default TTL. Add these records without replacing unrelated records:

| Type  | Name                | Value                                                                                                                                                                                                                        | Priority |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| TXT   | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDYp38T9Y0ZCgdoKdK07OHNcXwEAh30eUtPPXIX81JBJwQdOCqiOb8PmuG2KJlFdT1WqbhPwrBUF8RCg0R1OpfpM06sWlHop9DQWruWGdWIWzmwkQsf7wIu+gKBhHAKrsx/pjF4P+yOzluxf8gJZjHG/EvfCPSLj4U+D1AlX/qxnQIDAQAB` | —        |
| MX    | `send`              | `feedback-smtp.us-east-1.amazonses.com`                                                                                                                                                                                      | 10       |
| TXT   | `send`              | `v=spf1 include:amazonses.com ~all`                                                                                                                                                                                          | —        |
| CNAME | `rsend`             | `send.forge.rmta.net`                                                                                                                                                                                                        | —        |

After DNS verification succeeds, configure a Resend sending-only API key restricted to this domain directly as a sensitive Vercel production variable. Do not paste credentials into chat, commit them, or use an unrelated business's sender. The connected MCP email account alone does not give the running website an API credential.

| Variable                          | Status / purpose                                                             |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `REC_ORDER_EMAIL_TO`              | Production configured as `recmamamade@gmail.com`                             |
| `REC_ORDER_EMAIL_FROM`            | Prepared as `orders@recmamamade.com`; optional sender choice remains pending |
| `REC_ORDER_EMAIL_SENDER_VERIFIED` | `false`; only enable after actual REC Mama Made sender verification          |
| `RESEND_API_KEY`                  | Missing; secure native website sending credential required                   |
| `CRON_SECRET`                     | Sensitive production scheduler credential configured; value not reported     |

Once configured, deploy the updated environment, send a clearly labeled owner-only test message, and verify its actual provider/inbox status before claiming notifications are active. Retained queued orders can then be processed without inventing orders or replaying historical payments. No email, API credential or paid subscription was created solely to bypass the verification requirement.

## Verification

- 37 commerce integration tests pass, including seven new order-email tests: escaped content, exact saved artwork, financial references, transaction rollback, duplicate prevention, historical-import exclusion, competing workers, same-payload retries, expired uncertainty, unverified/missing sender blocking, permanent errors and protected scheduler access.
- Existing script regressions, 55 app-data/auth tests and 31 builder/crown tests pass.
- Typecheck and production build pass; new email server/route lint passes. Full lint retains the four existing errors and 21 warnings documented before this change.
- Authenticated owner notification view inspected on desktop and 390-pixel mobile: no page overflow, clear paused state and no browser errors. Storefront smoke checks pass in development and built output with no layout divergence, overflow or console/page errors. Existing social-card brand note remains outside this task's scope.
- Financial provider tests use sandbox mocks and isolated PostgreSQL-compatible storage. Live email API acceptance/inbox delivery remains unverified because the sender and website credential are not yet configured.

## Release and rollback

Owner approval to publish was already given. Stage the exact reviewed source as a production-environment candidate while automatic domain assignment is disabled. Run the read-only release preflight and the approved additive migration before promoting. Inspect the candidate's source SHA, database migration output and public authorization checks; then promote that candidate and verify both live domain aliases. Restore normal domain assignment afterward.

For rollback, promote the previously verified deployment `dpl_D2D6dFGJUpcUyuFfEKXZEso6ZJcw` (source `6a3a8d4740e8aba9c061d27af7d3ddd5633d9ebf`). Leave the additive table and its jobs intact; do not delete orders or financial records. Keep `REC_ORDER_EMAIL_SENDER_VERIFIED=false` to pause sending. The prior deployment also preserves the Authenticator removal. Restore normal auto-assignment only after the selected rollback is verified. No schema rollback or destructive database change is required.
