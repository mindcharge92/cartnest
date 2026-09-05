# P3 — Vendor, Store, Membership, KYC, and Provider-Account Status

**Phase:** P3  
**Status:** Implementation baseline complete; runtime/CI exit-gate verification pending  
**Updated:** 5 September 2026

## 1. Scope

P3 establishes the marketplace ownership boundary that later catalog, inventory, order, fulfillment, analytics, and payment modules must use. It builds on P2 identity/session primitives and the existing Prisma models rather than creating a second vendor authentication system.

The central authorization rule is:

```text
valid CartNest session
  + server-resolved VendorMember
  + active membership state
  + OWNER or explicit permission
  + matching vendor/store resource ownership
  + valid business state
```

A `vendorId`, `storeId`, hidden button, frontend route, or client-supplied role is never proof of authorization.

## 2. Implemented Contract Surface

`@repo/contracts` now includes runtime TypeBox schemas and inferred DTOs for:

- vendor status and public/authorized vendor data;
- vendor membership role and lifecycle;
- granular vendor permissions;
- vendor KYC/verification records;
- store lifecycle;
- payment-provider account records;
- vendor application payloads;
- store create/update payloads;
- staff invite/update payloads;
- admin vendor review payloads;
- admin KYC review payloads;
- provider-account management payloads;
- vendor/store/member/provider route parameters.

The permission vocabulary established in P3 is:

```text
store:create
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
staff:read
staff:invite
staff:update
staff:remove
analytics:read
verification:manage
provider-account:read
```

An active `OWNER` has the complete vendor permission set. An active `STAFF` member has only the permissions explicitly stored on `VendorMemberPermission`.

## 3. Vendor Application Lifecycle

A user may apply to create more than one vendor/business context over the lifetime of the account, and the same CartNest user may also remain a customer or staff member of another vendor.

P3 requires at least one verified account identifier before a vendor application can be created:

```text
CartNest User
    |
    +-- verified email OR verified phone required
    |
    v
Vendor(PENDING)
    |
    +-- VendorMember(role=OWNER, status=ACTIVE)
```

Vendor creation and creation of the initial active owner membership happen transactionally.

A vendor remains unable to sell while `PENDING`, `REJECTED`, or `SUSPENDED`. P3 allows its authorized members to prepare draft operational data, but downstream selling/catalog/checkout modules must treat `Vendor.status == APPROVED` as a required business-state invariant.

## 4. KYC and Approval Baseline

The database already contained generic verification types, so P3 turns them into an executable review flow:

```text
BUSINESS
IDENTITY
BANK_ACCOUNT
OTHER
```

Each verification moves through:

```text
PENDING -> VERIFIED
        -> REJECTED

VERIFIED -> EXPIRED   # lifecycle supported by the persistence model; expiry automation comes later
```

### P3 approval policy baseline

To make the approved requirement "vendors receive stronger verification and require admin approval before selling" executable, P3 currently enforces:

- a `BUSINESS` verification in `VERIFIED` state; and
- an `IDENTITY` verification in `VERIFIED` state

before an administrator can move the vendor to `APPROVED`.

This exact pair of required KYC checks was **not a previously separate product decision**. It is a P3 implementation-policy baseline chosen to make the approved stronger-vendor-verification rule enforceable. If compliance/legal requirements later require CAC-specific fields, directors, beneficial owners, tax identifiers, or different verification tiers, this policy should be revised through normal change control without weakening the ownership boundary.

A verified `BANK_ACCOUNT` check is currently required before a recorded payment-provider settlement/subaccount can be moved to `ACTIVE`.

## 5. Administrator Review

P3 adds privileged admin operations for:

- listing vendors by optional status;
- reviewing KYC submissions;
- approving a vendor;
- rejecting a pending vendor;
- suspending an approved vendor;
- recording provider/subaccount identifiers;
- changing provider-account operational status.

These actions require:

```text
platformRole in { ADMIN, SUPER_ADMIN }
AND privileged MFA satisfied
```

Admin review and financial/provider-account state changes are audited.

## 6. Store Lifecycle

One vendor may own multiple stores.

P3 implements:

```text
Vendor
  +-- Store A
  +-- Store B
  +-- Store C
```

Stores begin as `DRAFT`.

An authorized vendor member may create and prepare stores while the vendor is still awaiting approval, but activation is blocked until the owning vendor is `APPROVED`.

```text
DRAFT --activate--> ACTIVE     only when Vendor == APPROVED
ACTIVE -----------> CLOSED
DRAFT ------------> CLOSED
```

`SUSPENDED` remains available for platform/operational policy. A closed store cannot be reactivated through the P3 vendor route.

Store slugs are treated as a marketplace-wide namespace in the current schema and are collision-checked before creation/update.

P3 exposes `VendorService.requireStorePermission(...)` as the downstream ownership primitive for later modules. P4/P5/P6 must use this or an equivalent vendor-module public boundary rather than directly trusting `storeId`.

## 7. Vendor Staff and Multi-Vendor Membership

A user may belong to multiple vendors through `VendorMember`; no single `vendorId` is stored on `User` as the source of authority.

Implemented membership lifecycle:

```text
INVITED -> ACTIVE
ACTIVE  -> SUSPENDED
ACTIVE  -> REMOVED
SUSPENDED -> ACTIVE
```

P3 staff rules include:

- only an existing CartNest user can be invited in the current baseline;
- the invited user must explicitly accept the invitation before ordinary active access is established;
- vendor owners have all vendor permissions;
- staff authority comes only from explicit permissions;
- a staff member cannot delegate a permission they do not themselves possess;
- staff cannot change an owner's membership;
- only an owner can change member roles;
- the system prevents removing/suspending/demoting the final active owner;
- self-invite, self-removal, and unsafe self-role changes are blocked by the service layer;
- membership/resource scope is resolved server-side on every protected vendor operation.

### Deferred invitation delivery

P3 persists invitation state and provides acceptance semantics. Sending invitation email/SMS to a person who does not yet have a CartNest account is deferred to the notification/onboarding phase. The current baseline intentionally returns `MEMBER_ACCOUNT_NOT_FOUND` rather than inventing an unverified external identity record.

## 8. Provider-Account Foundation

P3 uses the existing `PaymentProviderAccount` model to record the provider identity needed later for settlement:

```text
Vendor
  +-- PAYSTACK provider account/subaccount
  +-- FLUTTERWAVE provider account/subaccount
```

P3 does **not** call Paystack or Flutterwave to create real subaccounts. Actual provider provisioning, signature/API behavior, split rules, and reconciliation remain P7 responsibilities behind payment-provider adapters.

What P3 establishes is:

- one provider account per vendor/provider;
- external subaccount/reference storage;
- lifecycle `PENDING -> ACTIVE/SUSPENDED/DISABLED`;
- vendor-authorized read access;
- admin-authorized record/status management;
- verified-bank-account prerequisite for activation;
- audit records for provider-account administration.

## 9. HTTP API Added

### Vendor/member routes

```text
POST   /api/v1/vendors
GET    /api/v1/vendors/me
GET    /api/v1/vendors/:vendorId

GET    /api/v1/vendors/:vendorId/verifications
POST   /api/v1/vendors/:vendorId/verifications

GET    /api/v1/vendors/:vendorId/stores
POST   /api/v1/vendors/:vendorId/stores
PATCH  /api/v1/stores/:storeId
POST   /api/v1/stores/:storeId/activate
POST   /api/v1/stores/:storeId/close

GET    /api/v1/vendors/:vendorId/members
POST   /api/v1/vendors/:vendorId/members/invite
POST   /api/v1/vendors/:vendorId/memberships/accept
PATCH  /api/v1/vendors/:vendorId/members/:memberId
DELETE /api/v1/vendors/:vendorId/members/:memberId

GET    /api/v1/vendors/:vendorId/provider-accounts
```

### Admin routes

```text
GET  /api/v1/admin/vendors
POST /api/v1/admin/vendors/:vendorId/approve
POST /api/v1/admin/vendors/:vendorId/reject
POST /api/v1/admin/vendors/:vendorId/suspend
POST /api/v1/admin/vendor-verifications/:verificationId/review
PUT  /api/v1/admin/vendors/:vendorId/provider-accounts
POST /api/v1/admin/vendors/:vendorId/provider-accounts/:provider/status
```

State-changing browser routes use the P2 CSRF boundary. Authentication uses the P2 HttpOnly access credential and server-side backing-session validation.

## 10. Audit Events

P3 records security/business audit entries for at least:

- vendor application creation;
- KYC submission/review;
- vendor approval/rejection/suspension;
- store creation/update/activation/closure;
- member invite/accept/update/removal;
- provider-account record/status changes.

Audit metadata is intentionally descriptive and does not copy KYC document contents or provider secrets.

## 11. Tests Committed

P3 unit/contract tests cover:

- owner effective permission behavior;
- staff allow/deny permission boundaries;
- non-active membership rejection;
- owner-only authorization;
- P3 routes appearing in Fastify/OpenAPI;
- shared validation-error envelope;
- fail-closed behavior when vendor persistence is unavailable.

Database-backed integration evidence is still required for transactional and horizontal-authorization guarantees.

## 12. Required Runtime/Integration Evidence

The repository's pre-existing GitHub Actions startup failure has prevented CI jobs from running. Before P3 is exit-gate verified, execute successfully in a trusted environment:

```bash
pnpm install
pnpm infra:up
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm db:migrate:dev
pnpm api:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
```

Database-backed P3 tests must then prove:

1. a user with a verified email or phone can atomically create a `PENDING` vendor and active `OWNER` membership;
2. an unverified account cannot create a vendor application;
3. Vendor A membership cannot read or mutate Vendor B protected stores, KYC, members, or provider-account data;
4. a staff permission grants the intended action and absence of the permission denies it;
5. one user can hold memberships in multiple vendors without scope confusion;
6. an invitation is not active access until accepted;
7. the last active owner cannot be removed, suspended, or demoted;
8. a store may be drafted while vendor approval is pending but cannot become `ACTIVE`;
9. an approved vendor can activate an owned draft store;
10. vendor approval fails until required P3 KYC checks are verified;
11. customer/non-admin and admin-without-MFA callers cannot use admin vendor-review operations;
12. high-risk transitions generate audit entries;
13. a provider account cannot become `ACTIVE` without verified bank-account KYC;
14. provider account and store access remain vendor-scoped.

## 13. P3 Exit Gate Status

| Criterion | Status |
| --- | --- |
| Vendor application workflow implemented | PASS — code baseline |
| Initial owner membership created with vendor | PASS — code baseline |
| Multi-vendor user membership model used | PASS — code baseline |
| OWNER/STAFF + granular permission boundary implemented | PASS — code baseline |
| KYC submission and admin review implemented | PASS — code baseline |
| Admin approval/rejection/suspension implemented | PASS — code baseline |
| Multiple stores per vendor implemented | PASS — code baseline |
| Store activation blocked for unapproved vendor | PASS — code baseline |
| Staff invite/accept/update/remove lifecycle implemented | PASS — code baseline |
| Provider-account/subaccount persistence foundation implemented | PASS — code baseline |
| P3 TypeBox/OpenAPI route contracts committed | PASS — code baseline |
| Authorization and route contract tests committed | PASS — code baseline |
| Prisma/runtime typecheck evidence | PENDING EXECUTION |
| Database-backed horizontal-isolation proof | PENDING EXECUTION |
| OpenAPI/client regeneration evidence | PENDING EXECUTION |
| Full lint/test/build evidence | PENDING EXECUTION |

## 14. P4 Gate

P4 catalog, variants, categories, product media, and moderation must not recreate vendor/store authorization. Product creation and mutation must first resolve an authorized store through the P3 vendor boundary and must additionally enforce seller business state where public selling is involved.
