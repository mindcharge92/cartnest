# ADR-004: Authentication, Session Security, RBAC, and Resource Ownership

**Status:** Proposed baseline — validate before implementation  
**Date:** 4 September 2026  
**Authority:** Fastify backend  
**Frontend:** Next.js  
**Marketplace:** Multi-vendor

## Proposed Decision

Fastify is the authority for authentication and authorization. For browser users, use short-lived access credentials together with a revocable, rotating refresh-session mechanism delivered through Secure, HttpOnly cookies. Authorization combines coarse RBAC roles, explicit permissions, resource ownership, and business-state checks.

The frontend may hide unavailable actions for user experience, but only the backend makes security decisions.

## 1. Security Goals

The authentication/authorization design must:

- prevent account/session theft from becoming long-lived access;
- support explicit revocation;
- prevent one vendor from accessing another vendor's resources;
- support vendor staff with delegated permissions;
- distinguish marketplace administrators from vendor administrators;
- provide a reliable audit trail for high-risk actions;
- keep browser credentials away from localStorage;
- remain compatible with Next.js and the typed API client.

## 2. Roles

| Role | Meaning | Typical Capabilities |
| --- | --- | --- |
| CUSTOMER | Buyer account | browse, cart, checkout, reviews, own orders |
| VENDOR_OWNER | Primary owner of a vendor | manage stores, staff, products, inventory, vendor orders |
| VENDOR_STAFF | Delegated team member | only explicitly granted vendor/store capabilities |
| ADMIN | Marketplace operations administrator | vendor approval, moderation, payment/order oversight |
| SUPER_ADMIN | Highly privileged platform operator | security-sensitive platform administration |

A role does not itself prove ownership of a particular vendor/store/resource.

## 3. Authentication Flow

```text
Browser
  -> POST /api/v1/auth/login
  -> Fastify validates credentials
  -> server establishes short-lived access state
  -> server establishes rotating refresh session
  -> Secure + HttpOnly cookies returned

Subsequent request
  -> Fastify authenticates
  -> Fastify evaluates authorization
  -> route/use case executes
```

## 4. Password Storage

Password rules:

- store only approved password hashes;
- never store plaintext or reversible encrypted passwords;
- bcrypt is acceptable if configured with a strong work factor and retained for proposal alignment;
- Argon2id may be selected before implementation if the team wants the stronger modern default;
- password-hash choice/parameters must be centralized rather than chosen per module;
- password values must never be logged.

## 5. Access and Refresh Sessions

Proposed browser model:

| Control | Baseline |
| --- | --- |
| Access credential | short-lived |
| Refresh session | longer-lived, rotating, revocable |
| Storage | Secure, HttpOnly cookie |
| SameSite | chosen according to deployed frontend/API topology |
| Revocation | stored server-side |
| Logout | revoke refresh session and clear cookies |
| Logout all | revoke all active refresh sessions for the user |

Exact expiration durations are intentionally not fixed until deployment topology and security requirements are confirmed.

## 6. Refresh Rotation

Each successful refresh should invalidate or supersede the previous refresh secret/session state.

A replay of an already-rotated credential should be treated as a security event according to the final implementation design.

Server-side session records should support:

- user ID;
- hashed token/session identifier;
- issued-at;
- expires-at;
- revoked-at/reason;
- rotation/replacement linkage where useful;
- limited device/session metadata where justified.

## 7. Authorization Model

Authorization is evaluated using four layers:

```text
authenticated identity
        +
role / explicit permission
        +
resource ownership / vendor-store scope
        +
valid business state
```

Example:

A vendor staff member may have `product:update`, but still cannot update a product belonging to a different vendor.

## 8. Permission Examples

Vendor/store permissions:

```text
store:read
store:update
product:create
product:update
product:archive
inventory:read
inventory:adjust
order:read
order:accept
order:fulfill
staff:invite
staff:update
staff:remove
analytics:read
```

Admin permissions:

```text
vendor:review
vendor:approve
vendor:suspend
product:moderate
user:suspend
order:override
payment:read
refund:review
audit:read
```

Permission granularity can be simplified for MVP, but ownership checks remain mandatory.

## 9. Vendor and Store Ownership

Never trust `vendorId`, `storeId`, or another resource ID from the request as proof that the caller owns it.

The backend must resolve membership/ownership server-side.

Preferred query/use-case pattern:

```text
principal
  -> authorized vendor memberships
  -> permitted store scope
  -> resource lookup/action constrained to that scope
```

This prevents horizontal privilege escalation by changing URL/body IDs.

## 10. Admin Overrides

Admin operations that bypass ordinary vendor/customer restrictions must be:

- explicit;
- permission-checked;
- auditable;
- attributable to one admin identity;
- given a reason where the business process benefits from it.

Do not silently make every administrator omnipotent through generic middleware.

## 11. Next.js Responsibilities

Next.js may:

- render authenticated layouts;
- fetch current session/capabilities;
- hide irrelevant UI actions;
- redirect unauthenticated users;
- render role-appropriate buyer/vendor/admin workspaces.

Next.js must not:

- become the source of truth for authorization;
- store long-lived access/refresh secrets in localStorage;
- assume hidden UI prevents direct API calls;
- import server-only secrets.

## 12. CSRF

Because the proposed browser session uses cookies, state-changing requests require an explicit CSRF posture.

Controls may include:

- suitable `SameSite` cookie settings;
- origin/referer validation;
- anti-CSRF tokens where topology requires them.

CORS alone is not a complete CSRF control.

## 13. CORS

Credentialed API calls should accept only approved frontend origins.

Do not use a permissive wildcard origin with credentials.

## 14. Password Recovery

Password recovery should:

1. accept an identifier without revealing whether the account exists;
2. issue a single-use short-lived recovery secret;
3. store only safe verification material;
4. expire/invalidate after use;
5. allow session revocation after successful reset;
6. audit security-relevant changes.

## 15. MFA

MFA is strongly recommended before production for:

- SUPER_ADMIN;
- ADMIN;
- potentially VENDOR_OWNER accounts depending platform risk.

The exact factor/provider is deferred.

## 16. Security Events and Audit

Audit/log appropriately:

- successful/failed login events;
- password changes/resets;
- session refresh/revocation anomalies;
- role/permission changes;
- vendor staff invitations/removals;
- vendor approval/suspension;
- high-risk admin actions;
- refunds and financial overrides.

Never log passwords, raw refresh tokens, secret provider keys, or other credentials.

## 17. Rate Limiting

Protect abuse-prone endpoints such as:

- login;
- registration;
- password reset;
- verification;
- session refresh;
- checkout/payment initiation.

Rate limiting may use IP, authenticated identity, route, and risk context.

## 18. Required Tests

- [ ] unauthenticated access is rejected;
- [ ] expired/invalid sessions are rejected;
- [ ] refresh rotation works and replay is handled safely;
- [ ] vendor A cannot access vendor B resources;
- [ ] vendor staff permission restrictions are enforced;
- [ ] admin-only endpoints reject vendors/customers;
- [ ] cookie/CSRF protections are integration-tested;
- [ ] password reset token replay fails;
- [ ] privileged actions are audited.

## 19. Open Decisions Before Coding

- exact same-site vs cross-site deployment topology;
- exact access/refresh expiration durations;
- whether registration requires email, phone, or both;
- vendor staff permission granularity for MVP;
- exact MFA policy;
- OAuth/social login scope;
- password hashing choice/parameters.

## 20. Final Baseline

CartNest will use backend-authoritative authentication and authorization with revocable browser sessions, explicit RBAC/permissions, strict vendor/store ownership checks, and audited privileged operations. Frontend role-aware UI is additive UX, never the security boundary.
