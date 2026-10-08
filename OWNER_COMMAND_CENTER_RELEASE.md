# REC Mama Made release

The owner authorized deployment and publication on 2026-10-07 after reviewing the local implementation. This supersedes the earlier instruction to await production approval; the earlier delivery report remains the implementation/validation record.

Target: existing Vercel project `rec-mama-made-staging` (`prj_KdYbzGJ9NSYDHUD05yfI4b2hUXbI`), team `robbystauss-6160`. Despite its name, this is the verified project serving `recmamamade.com` and `www.recmamamade.com`.

Previous production: `dpl_3LSpsVtzGnx9nvnvawLE2cKqqXeM`, commit `7b2a0e44f2b665ad834eca9e868da7c6d1585339`.

Release preparation:

- Existing persistent database and Stripe settings retained; no payment account, pricing, shipping or tax change made.
- Stable auth signing and MFA encryption keys configured securely in Vercel. Admin MFA required.
- Owner provided their account email. A private, expiring single-use invitation permits that recipient to authenticate and choose their own password where needed. Passwords and existing accounts are never overwritten by setup.
- Four additive migrations are explicitly authorized for this release. An explicit read-only preflight verifies persistent storage before migration; normal builds still cannot migrate production.
- Automatic domain assignment held during release checks, preserving the previous live deployment until promotion.
- Local validation: typecheck/build, 201 script + 55 existing application + 31 geometry/calibration + 23 commerce tests passed. Owner-invitation checks cover invalid tokens, wrong recipients, expiry, duplicate redemption, immutable history and account preservation.

## Published result

- URL: https://recmamamade.com
- Target: production
- Status: READY; the live domain alias was explicitly verified against this deployment.
- Published deployment: `dpl_JE9c7kfFwpcb2DuJgURHBq5YfVB7`
- Deployment URL: https://rec-mama-made-staging-e1qznrhel-robbystauss-6160.vercel.app
- Published GitHub/main commit: `a64cc6de8d1fd4c89c71e274c52eb5c1139fac43`
- Source tree: `f61545e786396ef570da134d070984ce35f1104a`, identical to the locally validated implementation.
- Framework: existing React/TanStack Start with Nitro, Node 24.
- Vercel build duration: approximately 21 seconds (about 44 seconds from build initialization to READY).
- Read-only PostgreSQL preflight succeeded and found no existing public tables. All four additive migrations applied successfully. No prior customer/order/inventory rows were overwritten.
- Normal project build command restored to `npm run build`; domain auto-assignment restored. The remote `main` branch contains the release source. The subsequent automatic main build also reached READY with the same commit.

## Post-publication checks

- Live homepage and original hat builder: HTTP 200 at desktop 1280 × 800 and mobile 390 × 844; no console/page errors or horizontal overflow. Published builder imagery and placement were visually inspected.
- Anonymous `/admin` shows “Merchant access required”; no merchant data is exposed.
- `/login`, `/owner-setup`, `/shop`, `/api/auth/get-session`: HTTP 200 without database/runtime failures; unsigned session read returned null.
- Unauthenticated private artwork read returned 401. Unsigned Stripe webhook payload returned 400, without any financial record created.
- Runtime scan: one pg connection-string deprecation/security warning logged to stderr; no application failure was observed. The current pg version treats the existing SSL mode as verify-full. Explicit `sslmode=verify-full` remains a future configuration cleanup. No external log drains were configured or added.
- Owner invitation redemption was tested locally on mobile with an isolated account: password chosen by the test user, single-use redemption, real owner role and redirect to Security. The live owner must finish their own setup and authenticator enrollment; no agent-selected owner password or fake production identity was created.

The private setup link was opened for the owner and saved in ignored local `artifacts/commerce-qa/PRIVATE_OWNER_SETUP.md`. The raw token is not in Git, this report, deployment files or public website content. It expires after 48 hours and can be used once by the configured recipient.

No real charge, refund, customer email, provider invoice send, fake order or test inventory count was created in production. Existing Stripe credentials and webhook secret were preserved. A live provider round trip and webhook subscription inspection remain unverified: the connected Stripe app required reauthentication. Invoice branding/sender settings are deliberately not asserted as verified. Provider setup and historical reconciliation remain activation work.

Rollback target is the previous deployment above. Preserve additive tables and payment/audit references; never drop financial records. If any upgraded checkout has accepted payment, retain a compatible webhook receiver or replay provider events before reverting the order-capture code.

Actual historic imports, verified stock counts/recipes and invoice sender setup remain owner activation tasks. No test orders, local inventory fixtures, live charges or customer messages are part of the release.
