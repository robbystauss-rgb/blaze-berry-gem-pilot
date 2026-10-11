# Authenticator removal — 2026-10-11

The owner explicitly requested ordinary sign-in without an Authenticator app. This focused change supersedes the MFA requirements in older command-center reports.

## Inspection and authentication

REC Mama Made uses self-hosted Better Auth at `/api/auth/*`, with email/password enabled and existing Google/X federation through the Grok broker. PostgreSQL persists deployed accounts and sessions; isolated local tests use PGLite. Better Auth's signed sessions, secure `__Host-` cookies, SameSite/origin checks, expiration, password handling, logout and existing provider configuration are unchanged. No Better Auth two-factor plugin was installed.

Authenticator was a separate merchant layer: `requireAccess` required `commerce_mfa.enabled` and a four-hour `commerce_mfa_sessions` proof, also honoring `ADMIN_REQUIRE_MFA`. The dashboard repeated that gate and offered custom TOTP enrollment/verification and recovery-code actions. Studio redirected these failures to `/admin?section=security`; owner setup sent new owners to that section. Customers used primary authentication and scoped account reads independently.

## Completed checklist and changed files

- [x] `src/lib/commerce/access.server.ts`: remove secondary-session proofs, TOTP/encryption/enrollment/challenge/recovery functions. Retain verified session identity, active merchant membership, explicit owner provisioning and permission checks.
- [x] `src/lib/commerce/api.ts`: remove MFA session flags/queries and `mfaAction`/`recoveryAction` server functions. All remaining sensitive actions retain authentication middleware and server-side permissions.
- [x] `src/components/admin/command-center.tsx`: remove compulsory challenge, setup key, code inputs, recovery prompts and MFA settings. Preserve old security bookmarks as a useful Account access page showing the authenticated role and account link.
- [x] `src/routes/studio.tsx`: remove the MFA redirect; retain ordinary login and role-denied redirects.
- [x] `src/routes/owner-setup.tsx`: retain private recipient-bound, expiring, single-use owner invitation and primary account creation/sign-in; redirect directly to `/admin` and remove enrollment instructions.
- [x] `scripts/commerce-activate.mjs`, `scripts/commerce-readiness.mjs`: remove enrollment dependencies from owner attribution/readiness. No activation or history import was run for this change.
- [x] `scripts/commerce-qa-server.mjs`: exercise existing enrolled/locked-out owner and customer fixtures with expired secondary proofs and the obsolete requirement flag deliberately set to true. This script refuses production credentials/databases and is not imported by deployed routes.
- [x] `tests/commerce.integration.mjs`: replace obsolete TOTP/recovery tests with actual Better Auth registration/login/session and merchant-permission regressions.
- [x] `scripts/migration-plan.test.mjs`: correct the existing auth-schema regression's stale list to include already-present migrations 0005/0006. No migration was added or modified.
- [x] This report and the current completion report point readers to the updated access behavior.

## Existing users and retained records

No migration, account reset, session reset, MFA record deletion, order change or credential rotation is necessary. Old encrypted factors, enrollment flags, blocked counters, secondary proofs and recovery hashes remain unused in their original tables. Existing ordinary sessions continue to work; logging in again also works without a code. Removed server functions cannot enroll, challenge, recover or reactivate the old requirement.

Historical migrations 0002/0005 and historical audit records are intentionally retained. `ADMIN_REQUIRE_MFA` no longer controls any application access and was set to **false in production**. Test fixtures deliberately retain true to guard against regressions.

**Retain the existing `ADMIN_MFA_ENCRYPTION_KEY` unchanged.** Despite its name, `webhook-config.server.ts` also derives the encryption key for the active Stripe webhook signing secret from it. `release-preflight.mjs` therefore still validates it. This remaining reference enables payment signature validation, not Authenticator access. No secret values appear in this report.

## Authorization and scope

`/admin`, Studio, private artwork/downloads and every merchant mutation still require a verified primary session and active authorized role. Owner/manager/production permissions and assignment restrictions remain intact. Customers retain only their scoped account/order access; new registration does not create a merchant role. Signed-out, forged/expired-session, inactive-staff and cross-account requests are rejected. No storefront, builder, checkout, price, business data or primary-auth helper was changed.

## Verification

- Typecheck and production build passed; asset/crown checks and auth invariant passed.
- `npm test`: 201 script regressions and 55 app-data/primary-auth tests passed.
- `npm run test:commerce`: 30 integration tests passed. New tests use real Better Auth handlers and framework request contexts. They cover retained legacy factors with an enabled flag, lockout and expired proof; unchanged recovery records; normal registration/login; no-active-role; forged/anonymous/expired sessions; cross-account IDs; manager finance/production staff restrictions; logout. Existing checkout, immutable customization, signed webhook/idempotency, invoice sandbox, inventory, owner setup and webhook-secret encryption tests continue to pass.
- `npm run test:crowns`: 31 tests passed. No hat-builder files changed.
- Browser: enrolled-owner normal login → account → dashboard/orders; refresh/direct navigation; customer normal login and own-order history; customer/anonymous denial of admin; owner/customer logout; manager orders and finance denial; private invitation registration → dashboard without enrollment, then logout and normal repeat login. These use isolated test accounts and records, never live customers.
- Desktop/390×844 phone: login and storefront smoke tests passed with no page/console errors or horizontal overflow. Production-built output matched dev. Owner mobile orders and legacy security bookmark were inspected visually and contained no Authenticator controls. Screenshots are under `C:/workspace/screenshots/mfa-*`.
- Full lint was run: **four pre-existing errors and 21 warnings remain**. Errors are unchanged empty catch blocks in app-data client/webhook handling and intentional control-character validation regexes in production-file/export validation. They were verified in the pre-change Git source and left outside this scoped change. The pre-existing share-card note is unchanged.
- Production staff browser login reaches its assigned production order and denies Staff access. **317 automated tests pass in total.**
- Live production: signed-out `/admin?section=orders` displays Merchant access required; its Sign in link opens the ordinary email/password form. Desktop/mobile login and storefront smoke tests pass with no console/page errors or overflow and match the local built output. `/api/auth/get-session` returns null to an unauthenticated request. Runtime logs show the existing PostgreSQL-driver SSL-mode compatibility warning; no application exception was observed during these checks.

The real owner's password/session was not borrowed or reset; signed-in production owner/customer actions were not impersonated. Existing-user behavior was verified with real primary authentication and previously enrolled isolated fixtures. Google/X upstream login was preserved in source, not exercised against external provider accounts. No real charge, invoice, message or production test account was created.

## Release and rollback

**Published under the owner's existing approval on 2026-10-11.** Application source: `6a3a8d4740e8aba9c061d27af7d3ddd5633d9ebf`; verified tree: `734317588b01472e26b5a2234a7b33d718b1d241`; staged and promoted deployment: `dpl_D2D6dFGJUpcUyuFfEKXZEso6ZJcw`. Both `recmamamade.com` and `www.recmamamade.com` resolved to that deployment after promotion. This report's later documentation revision changes no application code.

The exact verified tree was staged in the existing Vercel project using production runtime settings with automatic domain assignment disabled. Read-only preflight confirmed persistent PostgreSQL and required runtime configuration without exposing credentials or modifying records. The remote build and candidate login/storefront/anonymous-session checks passed before promotion. No migration, invoice activation or business-data update was run. Normal project build configuration remains `npm run build`.

Previous live deployment: `dpl_9DoWX1cYEnk6HpWi6jCKDL2dmCDS`, source `94857dc98814580364da642bf7f5584f9ea96b80`. It is a compatible emergency code rollback, but **reintroduces the old enrolled-account Authenticator gate even if ADMIN_REQUIRE_MFA is false**. A forward fix is preferable for an authentication issue. Preserve database rows and the encryption root on any rollback; do not reverse migrations or rotate keys. Use Vercel's rollback/promotion control for this exact project/deployment if an emergency rollback is authorized; verify aliases and leave automatic assignment disabled while resolving the issue. Do not use a release predating native webhook-secret encryption.
