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

Deployment status: prepared, awaiting the remote build and publication checks. No deployment success is claimed by this preparation record.

Rollback target is the previous deployment above. Preserve additive tables and payment/audit references; never drop financial records. If any upgraded checkout has accepted payment, retain a compatible webhook receiver or replay provider events before reverting the order-capture code.

Actual historic imports, verified stock counts/recipes and invoice sender setup remain owner activation tasks. No test orders, local inventory fixtures, live charges or customer messages are part of the release.
