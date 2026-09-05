# P2 — Identity, Authentication, Sessions, and Authorization Status

**Phase:** P2  
**Status:** Implementation baseline complete; runtime/CI exit-gate verification pending  
**Updated:** 5 September 2026

## Implemented backend scope

- email/phone account identity and normalization;
- Argon2id password hashing with centralized parameters;
- registration and password login;
- 15-minute signed access credential in Secure/HttpOnly cookie;
- 30-day opaque rotating refresh credential stored only as a SHA-256 hash;
- refresh replay detection that revokes active sessions when a rotated credential is reused;
- logout and logout-all revocation;
- single-use password-reset token primitive using signed short-lived action tokens plus atomic replay-consumption records;
- email/phone verification request/confirm primitives;
- Google OpenID Connect authorization-code flow with PKCE, state, nonce, controlled account linking, and verified-email requirement;
- TOTP MFA enrollment/challenge with AES-256-GCM encryption of the authenticator secret at rest;
- privileged `ADMIN`/`SUPER_ADMIN` MFA requirement primitive;
- RBAC primitives for platform roles and MFA-sensitive operations;
- strict credentialed CORS allowlist, trusted Origin checking, SameSite cookies, and double-submit CSRF validation for cookie-authenticated mutations;
- auth-route rate limits;
- security audit entries for registration, login, refresh replay, password recovery, verification, MFA, OAuth linking, logout, and session revocation;
- TypeBox request/response contracts and OpenAPI-visible auth routes;
- typed-client bootstrap snapshot for all P2 browser endpoints.

## Browser/frontend scope

- login screen;
- registration screen;
- recovery request screen;
- reset-password screen;
- typed session provider;
- automatic one-time refresh attempt when the access credential expires;
- session-expired UI state;
- authorization-aware navigation;
- account/security view;
- email/phone verification request controls;
- Google login/link entry points;
- TOTP MFA enrollment/challenge screen;
- logout and logout-all actions.

## Cookie model

```text
cartnest_access      HttpOnly  15 minutes
cartnest_refresh     HttpOnly  30 days, rotated on refresh
cartnest_csrf        readable  double-submit CSRF value
cartnest_mfa_grant   HttpOnly  bounded privileged MFA grant
cartnest_google_state HttpOnly short-lived OIDC transaction state
```

No access or refresh secret is stored in `localStorage`.

## Password recovery and verification delivery

P2 implements issuance, cryptographic verification, single-use consumption, expiry, UI entry points, and audit behavior. Actual email/SMS delivery remains owned by the notification/provider phase. For explicit local testing only, `AUTH_EXPOSE_DEVELOPMENT_TOKENS=true` exposes the generated action token in the `x-cartnest-development-token` response header; this is disabled by default and cannot be enabled as an implicit production fallback.

## Google OAuth configuration

Required when Google login is exercised:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
API_PUBLIC_BASE_URL
WEB_BASE_URL
```

The redirect URI baseline is `/api/v1/auth/google/callback`. Existing password accounts with the same Google email are not silently linked; the user must first authenticate to the existing CartNest account and use the explicit link flow.

## Security invariants

- raw refresh tokens are never persisted;
- rotated refresh credentials cannot create two valid replacement sessions under a detected race/replay path;
- reset/verification token consumption uses an atomic status transition;
- a suspended/disabled user cannot continue using a signed access credential;
- password reset revokes all active sessions;
- credentialed cross-origin browser requests are restricted to configured origins;
- CSRF tokens are required for authenticated state-changing browser operations;
- OAuth callback state is signed, short-lived, PKCE-bound, state-checked, and nonce-checked;
- privileged MFA secrets are encrypted before persistence;
- customer platform role fails admin-role authorization primitives.

## Verification still required

The repository's GitHub Actions startup problem existed before P2 and has prevented jobs from starting. Therefore the following must still be executed in a trusted environment before P2 is marked exit-gate verified:

```bash
pnpm install
pnpm db:generate
pnpm db:validate
pnpm api:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Database-backed integration tests must then prove:

1. refresh rotation succeeds exactly once;
2. reuse of a rotated refresh credential revokes active sessions;
3. logout/logout-all revocation works;
4. password-reset token replay is rejected;
5. CUSTOMER cannot cross an admin role guard;
6. privileged MFA challenge gates admin capability;
7. OAuth callback state mismatch fails;
8. audit records are written for high-risk security transitions.

## P3 gate

P3 vendor/store ownership must build on these identity primitives. Vendor ownership must never be inferred from the browser, and P3 authorization must combine authenticated identity, `VendorMember`, granular permissions, resource scope, and business state.
