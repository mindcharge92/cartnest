# Authentication, Authorization, and Security Standard

**Related ADR:** ADR-004  
**Status:** Living implementation standard  
**Updated:** 5 September 2026

## 1. Security Authority

Fastify is the authoritative security boundary for CartNest application APIs. Next.js may render different experiences from session state, but every protected operation is authenticated and authorized again by the backend.

No UI condition, hidden button, route redirect, or client-supplied vendor/store identifier is proof of authorization.

## 2. Identity and Platform Roles

Baseline platform roles:

| Role | Scope |
| --- | --- |
| `USER` / customer context | own profile, cart, checkout, orders, reviews |
| `VENDOR_OWNER` business context | own vendor/store administration and delegated staff |
| `VENDOR_STAFF` business context | granted capabilities inside assigned vendor/store scope |
| `ADMIN` | marketplace operations and moderation |
| `SUPER_ADMIN` | highly privileged platform administration |

The persisted platform role distinguishes ordinary users from platform administrators. Vendor-owner/staff authority is established later through `VendorMember`, explicit permissions, and resource ownership. Roles never replace ownership checks.

## 3. Accepted Browser Session Baseline

CartNest uses:

- **15-minute signed access credential**;
- **30-day rotating refresh session**;
- Secure, HttpOnly cookies for access and refresh secrets;
- server-side refresh-session records and revocation;
- hashed refresh secrets at rest;
- explicit CSRF protection for cookie-authenticated state changes;
- credentialed CORS restricted to approved origins.

A signed access credential is not sufficient by itself. The backend also verifies that its backing server-side session exists, belongs to the user, has not expired, and has not been revoked. This allows logout, logout-all, security recovery, suspension, and refresh-replay response to invalidate access before the JWT's natural expiry.

## 4. Passwords

CartNest uses Argon2id as the P2 password-hashing baseline.

Rules:

- password hashes only; never reversible password encryption;
- password values are never logged;
- hashing parameters are centralized and reviewable;
- account passwords are required to satisfy the current contract minimum before hashing;
- password-reset tokens are short-lived and single-use;
- successful password reset revokes existing sessions;
- recovery endpoints do not reveal whether an account identifier exists.

Hash parameters may be strengthened over time. Rehash-on-authentication may be introduced when parameters change.

## 5. Access Credentials

Access credentials:

- are signed by the API;
- carry a user ID, backing session ID, platform role, MFA-satisfied state, issuer, audience, issue time, and expiry;
- expire after 15 minutes;
- are stored in HttpOnly cookies for the browser flow;
- are rejected when signature/claims are invalid;
- are rejected when user status is suspended/disabled;
- are rejected when the backing refresh/session record has been revoked, expired, or cannot be resolved.

Access/refresh credentials must never be placed in `localStorage` or other long-lived browser-readable storage.

## 6. Refresh Sessions and Rotation

Refresh credentials are high-entropy opaque values. CartNest persists only a cryptographic hash of the raw refresh value.

Each refresh:

1. validates the presented credential by hash;
2. verifies the current session is active and unexpired;
3. creates a replacement session/credential;
4. revokes the previous session as rotated;
5. issues a new short-lived access credential;
6. rotates the browser refresh cookie.

If a previously rotated credential is presented again, treat it as a replay/security event and revoke the affected active sessions according to the implemented session-family policy.

Concurrent refresh handling must not result in two accepted replacement sessions.

## 7. Logout and Security Recovery

`logout` revokes the current refresh session and clears browser auth cookies.

`logout-all` revokes all active sessions for the user.

Password reset revokes all active sessions after the password is replaced. Session revocation must be effective for both future refreshes and access-token verification.

## 8. CSRF

Because browser authentication relies on cookies, state-changing requests require CSRF protection.

Current browser baseline:

- `SameSite=Lax` cookies;
- Secure cookies in production;
- trusted Origin validation;
- readable CSRF cookie containing a high-entropy token;
- matching `x-csrf-token` request header on authenticated unsafe methods;
- constant-time token comparison.

CORS is not a substitute for CSRF protection.

## 9. CORS and Browser Origins

Credentialed CORS allows only configured trusted frontend origins.

Never deploy:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

Unexpected browser origins on state-changing requests are rejected. Deployment configuration must list exact frontend origins rather than broad wildcard trust.

## 10. Rate Limiting

Abuse-prone authentication routes carry route-level rate limits, including registration, login, refresh, password reset, identifier verification, MFA operations, and OAuth initiation.

Production tuning may combine IP, account identity, route, and risk signals. Rate limiting is defense in depth, not a replacement for password hashing, MFA, or audit monitoring.

## 11. Password Reset and Identifier Verification

Reset and verification actions use signed, purpose-bound, expiring action tokens plus a server-side one-time consumption record.

A token must fail when:

- signature/issuer/audience is invalid;
- purpose does not match the endpoint;
- token is expired;
- its one-time server record does not exist;
- the server record has already been consumed;
- the server record has expired.

Actual email/SMS delivery is a notification-provider responsibility. Development token exposure, when explicitly enabled, is test-only and prohibited as a production delivery strategy.

## 12. Google OpenID Connect

Google authentication uses the authorization-code flow with:

- discovery against Google's OpenID issuer;
- PKCE;
- signed short-lived transaction state;
- OAuth `state` validation;
- OIDC nonce validation;
- configured redirect URI;
- verified Google email requirement.

An existing CartNest password account with the same email is **not silently linked** to a new Google identity. The user must authenticate to the existing CartNest account and explicitly start the account-linking flow.

OAuth cannot bypass vendor KYC, platform RBAC, resource ownership, or privileged MFA.

## 13. MFA

TOTP MFA is the P2 privileged-authentication baseline.

- `ADMIN` and `SUPER_ADMIN` require MFA before production privileged access;
- customer/vendor MFA is optional initially;
- TOTP secrets are encrypted at rest using authenticated encryption;
- enrollment is confirmed with a valid authenticator code;
- privileged session state records whether MFA has been satisfied;
- the MFA grant is bounded to the authenticated user/session and expires;
- MFA verification/recovery events are audited.

MFA recovery for privileged users must never silently downgrade security.

## 14. Authorization Evaluation

Protected actions evaluate all applicable layers:

```text
authenticated identity
+ active server session
+ platform role
+ privileged MFA when required
+ vendor membership / granular permission
+ resource ownership
+ business-state policy
```

P2 establishes platform-role and MFA guard primitives. P3 adds vendor membership, permission, store scope, and ownership helpers.

## 15. Vendor Isolation

Every vendor-scoped repository operation must receive or derive authorized scope.

Bad:

```text
SELECT product WHERE id = request.params.id
```

without ownership validation.

Required pattern:

```text
principal
  -> resolve active VendorMember
  -> verify permission
  -> resolve permitted vendor/store scope
  -> load/mutate resource inside that scope
```

## 16. Admin Security

ADMIN/SUPER_ADMIN controls include:

- MFA before privileged production access;
- no shared accounts;
- server-side role enforcement;
- server-side session revocation;
- strong audit logging;
- re-authentication for additional high-risk actions when a later policy requires it;
- explicit operational reasons for sensitive overrides where applicable.

Admin impersonation is not part of MVP.

## 17. Secrets

Secrets include:

- auth-signing keys;
- MFA-encryption key;
- Google OAuth secret;
- payment provider credentials;
- database credentials;
- object-storage credentials;
- email/SMS credentials.

Rules:

- environment/secret manager only;
- never commit real secrets;
- never expose them with `NEXT_PUBLIC_*`;
- production auth/MFA keys must be high-entropy values, not repository examples;
- rotate compromised credentials;
- use least-privilege provider credentials.

## 18. Audit and Security Logging

Audit at minimum:

- account registration;
- login success/failure as policy permits;
- refresh-token replay detection;
- logout/logout-all;
- password reset request/completion;
- identifier verification;
- Google account linking;
- MFA enrollment/challenge/recovery;
- platform role/permission changes;
- vendor approval/suspension;
- high-risk administrative and financial actions.

Never log raw passwords, refresh tokens, access tokens, MFA secrets, OAuth client secrets, payment secrets, or KYC documents.

## 19. API Response Security

Explicit response DTOs are allowlists. Never expose:

- password hashes;
- raw session/refresh secrets;
- MFA encrypted/plain secrets except the one-time enrollment response intentionally shown to the enrolling authenticated user;
- provider credentials;
- internal moderation/risk data to unauthorized roles;
- arbitrary Prisma records.

Validation failures and authentication errors use the standard CartNest API error envelope with a request ID.

## 20. Required Security Tests

- [ ] valid registration/login persistence path;
- [ ] invalid credentials denied;
- [ ] expired access credential denied;
- [ ] revoked backing session invalidates access credential;
- [ ] refresh rotation succeeds once;
- [ ] refresh replay detected and active sessions revoked according to policy;
- [ ] logout/logout-all invalidates sessions;
- [ ] password-reset token replay blocked;
- [ ] CSRF mismatch blocked;
- [ ] untrusted credentialed browser origin blocked;
- [ ] customer fails admin platform-role guard;
- [ ] privileged action requires MFA;
- [ ] OAuth state/nonce/PKCE checks fail closed;
- [ ] Google identity cannot silently take over existing password account;
- [ ] response DTOs omit secrets;
- [ ] high-risk security transitions create audit records.

Tests already committed at unit/contract level do not substitute for the remaining PostgreSQL-backed integration tests.
