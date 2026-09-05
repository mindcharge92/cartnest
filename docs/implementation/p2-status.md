# P2 — Identity, Authentication, Sessions, and Authorization Status

**Phase:** P2  
**Status:** Implementation baseline complete; runtime/CI exit-gate verification pending  
**Updated:** 5 September 2026

## Implemented backend scope

- email/phone account identity and normalization;
- Argon2id password hashing with centralized parameters;
- registration and password login;
- 15-minute signed access credential in a Secure/HttpOnly cookie;
- server-side validation of the access credential's backing session, so logout, logout-all, password reset, refresh rotation, suspension, and replay revocation can invalidate access before JWT expiry;
- 30-day opaque rotating refresh credential stored only as a SHA-256 hash;
- concurrency-aware refresh rotation and replay detection that revokes active sessions when a rotated credential is reused;
- logout and logout-all revocation;
- single-use password-reset token primitive using signed short-lived action tokens plus atomic replay-consumption records;
- email/phone verification request/confirm primitives;
- Google OpenID Connect authorization-code flow with PKCE, state, nonce, controlled account linking, and verified-email requirement;
- TOTP MFA enrollment/challenge with AES-256-GCM encryption of the authenticator secret at rest;
- privileged `ADMIN`/`SUPER_ADMIN` MFA requirement primitive;
- RBAC primitives for platform roles and MFA-sensitive operations;
- strict credentialed CORS allowlist, trusted Origin checking, SameSite cookies, and double-submit CSRF validation for cookie-authenticated mutations;
- auth-route rate limits;
- standard CartNest validation/error envelopes for contract failures;
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
- logout and logout-all actions;
- browser API transport sends credentials and CSRF headers without placing access/refresh secrets in JavaScript storage.

## Cookie model

```text
cartnest_access       HttpOnly  15 minutes
cartnest_refresh      HttpOnly  30 days, rotated on refresh
cartnest_csrf         readable  double-submit CSRF value
cartnest_mfa_grant    HttpOnly  bounded privileged MFA grant
cartnest_google_state HttpOnly  short-lived OIDC transaction state
```

No access or refresh secret is stored in `localStorage`.

## Password recovery and verification delivery

P2 implements issuance, cryptographic verification, single-use consumption, expiry, UI entry points, and audit behavior. Actual email/SMS delivery remains owned by the notification/provider phase. For explicit local testing only, `AUTH_EXPOSE_DEVELOPMENT_TOKENS=true` exposes the generated action token in the `x-cartnest-development-token` response header; this is disabled by default and is not a production delivery mechanism.

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
- access credentials are rejected when their backing server-side session is revoked, expired, absent, or belongs to another user;
- rotated refresh credentials cannot create two accepted replacement sessions under the implemented race/replay handling;
- reset/verification token consumption uses an atomic state transition;
- a suspended/disabled user cannot continue using a signed access credential;
- password reset revokes all active sessions;
- credentialed cross-origin browser requests are restricted to configured origins;
- CSRF tokens are required for authenticated state-changing browser operations;
- OAuth callback state is signed, short-lived, PKCE-bound, state-checked, and nonce-checked;
- privileged MFA secrets are encrypted before persistence;
- customer platform role fails admin-role authorization primitives;
- validation errors use the standard API error envelope rather than framework-default error bodies.

## Tests committed in P2

Unit/contract tests now cover:

- Argon2id password hash verification;
- access credential signing/verification;
- phone normalization;
- MFA-secret encryption round trip;
- opaque token hashing;
- customer rejection from an admin-only role guard;
- privileged MFA guard behavior;
- registration of auth paths into OpenAPI;
- contract-validation error envelope;
- auth-unavailable behavior when the persistence service is absent;
- current-session rejection without an access cookie.

Database-backed integration tests remain required for session rotation/replay and persistence-level audit guarantees.

## Verification still required

The repository's GitHub Actions startup problem existed before P2 and continues after P2. The latest P2 attempt for commit `c47741041a1d88804a49b5ddf8dce09eaffe4c8a` was GitHub Actions run `33958833561`. GitHub reported `startup_failure` with `path: BuildFailed` and created **zero jobs**, so no repository command executed.

The following must therefore still be executed successfully in a trusted environment before P2 is marked exit-gate verified:

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

Database-backed integration evidence must then prove:

1. refresh rotation succeeds exactly once;
2. reuse of a rotated refresh credential revokes active sessions;
3. revoked backing sessions invalidate access credentials;
4. logout/logout-all revocation works;
5. password-reset token replay is rejected;
6. CUSTOMER cannot cross an admin role guard;
7. privileged MFA challenge gates admin capability;
8. OAuth callback state mismatch fails;
9. security audit records are written for high-risk transitions.

## P3 gate

P3 vendor/store ownership must build on these identity primitives. Vendor ownership must never be inferred from the browser, and P3 authorization must combine authenticated identity, `VendorMember`, granular permissions, resource scope, and business state.
