# Direct checkout launch notes

## Updated merchant instruction

The owner explicitly requested live checkout with automatic tax collection deferred. Set `CHECKOUT_TAX_MODE=not_collected` only for this chosen policy. Quotes then include products and shipping with zero tax collected; the UI says "Not collected", and each saved quote records the policy. This is not a tax exemption or settlement of the merchant's tax obligations. Existing automatic-tax quotes retain their tax calculation and reconciliation behavior. To re-enable automatic calculation, set `CHECKOUT_TAX_MODE=automatic` and complete the Tax settings described below. Missing or invalid modes never silently fall back to zero tax.

The original automatic-tax setup requirements below apply only to automatic mode. The remaining live credentials, isolated production database, signed webhook delivery, sandbox validation and fulfillment requirements still apply in both modes.

This change is based on production commit `3c6944a1a91b7f936fd6c324bd84a8403dd83e1b`. It preserves the existing catalog, quantity discounts, bonus-hat promotion, configurator steps and proof requirement. Payment does not approve artwork or authorize engraving.

## Current status

Patch previews use only the original swatch as their material background. External marketplace references are removed. Stripe embedded checkout and PayPal Checkout (eligible Venmo funding) are implemented, but payment activation is intentionally gated pending account configuration and end-to-end sandbox verification. No real charge was made.

## Environment configuration

Use separate preview and production databases and provider credentials. Never expose secret keys through client-prefixed environment variables or commit them.

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | Private PostgreSQL database; build applies migrations/0002_checkout.sql |
| CHECKOUT_ORIGIN | Exact HTTPS storefront origin; local sandbox may use localhost |
| PAYMENT_MODE | sandbox for preview, live for production |
| STRIPE_ACCOUNT_ID | Sandbox acct_1STvswPFxCT15pGD; live acct_1STvsoA3fdGBN0lc (El's Hat Shack, approved by owner) |
| STRIPE_SECRET_KEY | Matching server-side key with Checkout, account-read and Tax permissions |
| STRIPE_PUBLISHABLE_KEY | Matching publishable key |
| STRIPE_WEBHOOK_SECRET | Secret for this environment's endpoint |
| CHECKOUT_HAT_TAX_CODE | Confirm appropriate Stripe Tax product classification for hats |
| CHECKOUT_PATCH_TAX_CODE | Confirm appropriate classification for separate patches |
| CHECKOUT_TAX_CONFIGURED | true only after business address, classifications and applicable registrations are configured |
| PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET | Corresponding sandbox or live REST app credentials |
| PAYPAL_MERCHANT_ID | Intended business merchant account |
| PAYPAL_WEBHOOK_ID | Webhook registered for this REST app/environment |

The connected live Stripe account currently reports pending Tax settings, no head-office address and no tax registrations. Do not invent these or register jurisdictions without the business's facts. The implementation requires active Tax settings and at least one active registration; merchants legitimately without registrations need an explicitly reviewed policy change before activation.

Stripe webhook: `/api/checkout?action=stripe-webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.

PayPal webhook: `/api/checkout?action=paypal-webhook`, event `PAYMENT.CAPTURE.COMPLETED`. Configure PayPal/Venmo eligibility for the US business. SDK funding eligibility controls display; the profile URL is not an automated payment method.

Register payment domains and enable desired card/wallet methods in the matching Stripe account. Preview refuses live mode and production refuses sandbox mode. Missing setup disables payment instead of presenting a working-looking button.

## Shipping and tax

Shipping is a merchant estimate, not a carrier quote. It uses USPS Ground Advantage retail July 12, 2026 Zone 8/9 rates from https://pe.usps.com/text/dmm300/Notice123.htm, with assumed six-ounce hats, half-ounce patches, packing weight and packaging cost. Parcels hold at most twelve fulfilled hats or twenty-four patches; promotional hats count toward shipping. The result rounds up to the next fifty cents. Examples: one hat $10, two hats $14.50, twelve fulfilled hats $23, thirteen fulfilled hats $33, one patch $9.50. Actual dimensions/weights can change costs; merchant absorbs any difference. Recheck rates and real packed parcels before launch.

Product totals come from the original catalog pricing function on the server. Stripe Tax calculates tax using the delivery address and configured product codes, including shipping. Both processors charge the same stored total. Successful payments create a Stripe Tax transaction; refunds currently require matching manual tax reversal in Stripe Tax as well as the processor refund.

## Fulfillment and operations required before launch

Paid orders and the immutable build/artwork snapshot are stored privately in `rec_checkout`, with `proof_status=awaiting-proof`. No new admin dashboard, shop notification or automatic proof email is included. Confirm a staff workflow to retrieve paid orders and send the existing digital proof before accepting live orders. Restrict database access and establish retention/backups for customer addresses and artwork. Expired temporary artwork uploads and rate-limit rows require periodic cleanup; do not delete paid-order records as part of that cleanup.

Guest status access uses a random capability token stored hashed in the database, with no public customer-data endpoint. Provider reservations and stable request IDs prevent charging the same saved order through two processors. An unconfirmed payment remains pending; users should check its status before starting another order.

## Verification before production

Completed locally: production build, TypeScript check, catalog asset verification (646 hat view references and all 31 material swatches), checkout unit/security tests, desktop/mobile development and production smoke checks, review-flow interaction and promotion-total check. Browser smoke reported no errors, overflow or dev/build content differences. Payment tests use mocked providers, not charges.

Still required with configured preview credentials/database: real sandbox success, decline, cancel, wallet/eligible Venmo, webhook replay, interrupted return, duplicate click, database migration and shop fulfillment retrieval. Use sandbox cards/accounts only. Then rerun build/typecheck/test:checkout and preview checks before promoting. Existing template branding tests expect obsolete names, and two existing symlink tests cannot run on this Windows host; these are separate from checkout tests.

Do not merge/promote with the activation requirements unresolved. Production remains on its existing deployment until validation is complete.
