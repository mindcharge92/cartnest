# ADR-004: Authentication, Session Security, RBAC, and Resource Ownership

**Status:** Accepted  
**Accepted:** 5 September 2026  
**Authority:** Fastify backend  
**Frontend:** Next.js  
**Marketplace:** Multi-vendor

## Decision

Fastify is the authority for authentication and authorization. CartNest uses short-lived access credentials with rotating, revocable refresh sessions delivered through Secure, HttpOnly cookies. Authorization combines roles, granular permissions, vendor/store ownership, and valid business state.

Approved baseline:

- access credential lifetime: **15 minutes**;
- refresh session lifetime: **30 days**;
- ADMIN/SUPER_ADMIN MFA: **required before production**;
- vendor/customer MFA: optional initially;
- account contact model: email + phone, with workflow-based verification;
- Google social login: supported for MVP but not required for core auth completion;
- vendor KYC/verification: stronger than customer registration;
- one user may be customer, vendor owner, and/or staff of another vendor.

## 1. Roles

| Role | Meaning | Typical Capabilities |
| --- | --- | --- |
| `CUSTOMER` | Buyer | cart, checkout, own orders, delivered-purchase reviews |
| `VENDOR_OWNER` | Vendor owner | stores, staff, catalog, inventory, fulfillment, vendor analytics |
| `VENDOR_STAFF` | Delegated member | explicit permissions within assigned vendor/store scope |
| `ADMIN` | Marketplace operations | vendor approval, moderation, operational/financial oversight |
| `SUPER_ADMIN` | Security-sensitive platform operator | highly privileged administration |

Role alone never proves ownership.

## 2. Authentication Flow

```text
Browser -> POST /api/v1/auth/login
        -> Fastify verifies credentials
        -> 15-minute access credential
        -> 30-day rotating refresh session
        -> Secure + HttpOnly cookies

Request -> authenticate -> authorize -> execute use case
```

## 3. Identity and Registration

CartNest supports email and phone as account identifiers/contact channels.

Rules:

- normalized email uniqueness where email is present;
- normalized phone uniqueness where phone is present;
- one identifier may be sufficient for initial signup according to the UI flow;
- verification state is stored separately from whether a field merely exists;
- account discovery/recovery endpoints must not leak whether an identifier exists;
- same account can later acquire vendor memberships.

Google OAuth may create/link a CartNest identity through a controlled account-linking flow. OAuth must not bypass vendor KYC, MFA, RBAC, or ownership checks.

## 4. Password Security

Password credentials must:

- use an approved adaptive password hash;
- never be logged or reversibly encrypted;
- centralize hashing parameters;
- support password reset with single-use short-lived tokens;
- revoke relevant sessions after password reset/security recovery according to policy.

bcrypt remains acceptable for proposal alignment if configured with a reviewed work factor. The implementation may use Argon2id if adopted before credential code is finalized.

## 5. Access and Refresh Sessions

| Control | Accepted Baseline |
| --- | --- |
| access credential | 15 minutes |
| refresh session | 30 days |
| storage | Secure, HttpOnly cookies |
| rotation | required |
| revocation | server-side capability required |
| logout | revoke active refresh session and clear cookies |
| logout all | revoke all user sessions |
| password reset | session revocation according to security policy |

Refresh secrets/session identifiers must be stored safely, preferably hashed where applicable.

A replayed rotated refresh credential is a security event and should revoke the affected session family or trigger the final replay policy.

## 6. CSRF and Cookie Security

Cookie authentication requires an explicit CSRF posture.

Use a combination appropriate to deployment topology:

- `Secure`;
- `HttpOnly`;
- suitable `SameSite`;
- approved origin validation;
- anti-CSRF token where necessary.

CORS is not a replacement for CSRF protection. Credentialed CORS must allow only approved origins.

## 7. Authorization Model

Every protected operation evaluates:

```text
authenticated principal
  + role / permission
  + vendor/store/resource ownership
  + business-state validity
```

Example: a staff member with `product:update` may update only a product belonging to a store within an authorized vendor membership.

## 8. Vendor Membership and Multiple Vendors

A user may belong to multiple vendors.

`VendorMember` therefore represents an explicit relationship rather than placing one `vendorId` directly on `User`.

The backend resolves memberships server-side. Never trust a request `vendorId`/`storeId` as proof of authorization.

## 9. Granular Permissions

Vendor permissions include concepts such as:

```text
store:read
store:update
product:create
product:update
product:archive
inventory:read
inventory:adjust
order:read
order:process
order:fulfill
refund:request
staff:invite
staff:update
staff:remove
analytics:read
```

Admin permissions include:

```text
vendor:review
vendor:approve
vendor:suspend
product:moderate
category:manage
user:suspend
order:override
payment:read
refund:review
audit:read
```

Permissions are configurable/assignable; ownership remains mandatory even when a permission is present.

## 10. Vendor KYC and Approval

Vendor accounts have a verification lifecycle separate from ordinary login.

A vendor cannot sell publicly until required verification data is supplied and the vendor reaches an admin-approved state.

Suggested lifecycle:

```text
DRAFT -> PENDING_REVIEW -> APPROVED
                     -> REJECTED
APPROVED -> SUSPENDED -> APPROVED
```

KYC documents/fields must be treated as sensitive data with restricted access and retention policy.

## 11. MFA

MFA is required for `ADMIN` and `SUPER_ADMIN` before production access.

Vendor/customer MFA is optional initially but the identity model must support enrollment later.

Recovery for MFA-protected privileged accounts must be auditable and must not silently downgrade account security.

## 12. Next.js Responsibilities

Next.js may render role-aware UI, redirect unauthenticated users, and call Fastify using the typed API client.

Next.js must not:

- be the final authorization authority;
- store long-lived bearer/refresh credentials in localStorage;
- infer ownership from hidden buttons;
- access Prisma/database directly for marketplace business operations.

## 13. Admin Impersonation

Admin impersonation is **not part of MVP**. Support workflows must use audited administrative views/actions instead.

If impersonation is ever introduced, it requires a new security ADR covering consent, banners, audit, prohibited actions, credential boundaries, and session separation.

## 14. Audit Events

Audit at minimum:

- login/recovery anomalies;
- password reset and session revocation;
- MFA enrollment/recovery for privileged roles;
- role/permission changes;
- vendor membership changes;
- vendor approval/suspension;
- admin financial/order overrides;
- high-risk refund actions.

Never log passwords, raw refresh tokens, MFA secrets, OAuth secrets, payment provider secrets, or KYC documents.

## 15. Required Tests

- unauthenticated access denied;
- expired access credential denied;
- refresh rotation works;
- replayed refresh credential is safely handled;
- logout/logout-all revokes sessions;
- vendor A cannot access vendor B;
- multi-vendor memberships resolve correctly;
- vendor staff permission boundaries enforced;
- admin-only routes reject vendors/customers;
- privileged MFA enforcement works;
- CSRF/cookie protections are integration-tested;
- OAuth linking cannot bypass existing account security.

## Final Decision

CartNest uses backend-authoritative, revocable browser sessions with 15-minute access and 30-day refresh lifetimes; roles plus granular permissions; explicit multi-vendor membership; strict resource ownership; vendor KYC/approval; required privileged MFA; and auditable security-sensitive actions.
