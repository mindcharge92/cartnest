# Frontend FP3 — Vendor Onboarding, Stores, KYC, Staff, and Permissions

**Status:** Source baseline implemented; browser/runtime execution evidence pending  
**Updated:** 5 September 2026

## 1. Scope

FP3 implements the vendor-facing frontend against the P3 Fastify/domain boundary. It does not create a second vendor-authentication model: the web application continues to use the P2 CartNest session and the backend remains authoritative for membership, permissions, vendor ownership, store ownership, KYC state, and lifecycle transitions.

Implemented routes:

```text
/vendor
/vendor/onboarding
/vendor/:vendorId
/vendor/:vendorId/kyc
/vendor/:vendorId/stores
/vendor/:vendorId/stores/:storeId
/vendor/:vendorId/staff
```

## 2. Generated-Client Gap Fixed for FP3

The checked-in OpenAPI-generated client snapshot still represents only the P2 API surface because repository execution/CI has not successfully regenerated it.

FP3 does **not** solve that by duplicating request/response interfaces in the frontend and does not scatter raw `fetch` calls through components.

A contract-derived bridge was added in `@repo/api-client`:

```text
apps/web feature
      ↓
apps/web/lib/api.ts
      ↓
@repo/api-client
  ├── ContractRequestClient
  └── VendorApi
      ↓
@repo/contracts DTO types
      ↓
Fastify /api/v1
```

The bridge:

- imports DTO types directly from `@repo/contracts`;
- centralizes JSON transport and typed API errors;
- accepts the same browser fetch wrapper used by the generated client;
- therefore preserves `credentials: include` and CSRF-header injection;
- introduces no Prisma/provider DTOs into `apps/web`;
- avoids explicit `undefined` fetch-body assignment under the repository's `exactOptionalPropertyTypes` TypeScript baseline;
- is explicitly an interim typed integration path until `pnpm api:generate` can execute and the generated OpenAPI client is current again.

This closes the identified FP3 blocker without violating ADR-001 or the frontend engineering standard.

## 3. Seller Home

`/vendor` now lists all vendor relationships for the authenticated user.

It supports:

- multiple vendor memberships on one CartNest user;
- OWNER and STAFF role display;
- vendor approval status;
- membership status;
- opening active vendor workspaces;
- accepting an invited vendor membership;
- starting a new vendor application.

Invited memberships are not treated as active authorization by frontend permission helpers.

## 4. Vendor Onboarding

`/vendor/onboarding` integrates with:

```text
POST /api/v1/vendors
```

The form collects only fields represented by the P3 contract:

```text
displayName
legalName?
registrationNumber?
```

The frontend now checks the already-loaded authenticated session and blocks the onboarding form until at least one email/phone identifier is verified, matching the P3 backend `VERIFIED_IDENTIFIER_REQUIRED` invariant. The backend remains authoritative and repeats that validation.

The UI explicitly explains that creating a vendor does not grant selling approval.

## 5. Vendor Workspace

Every vendor page loads the authenticated server-side access model from:

```text
GET /api/v1/vendors/:vendorId
```

The reusable workspace shell receives `VendorAccessDto` and derives navigation visibility from the current `VendorMembership`.

Frontend permission logic is UX only. The browser does not treat `vendorId`, `storeId`, hidden navigation, or disabled buttons as authorization proof.

## 6. Permission-Aware Rendering

The frontend introduces a single presentation helper:

```text
hasVendorPermission(access, permission)
```

Rules:

```text
membership not ACTIVE -> false
OWNER                 -> true
STAFF                 -> explicit assigned permission only
```

This logic is covered by a frontend unit test and mirrors—without replacing—the P3 backend boundary.

## 7. Vendor Dashboard

`/vendor/:vendorId` summarizes:

- vendor status;
- active membership/role;
- store count and active store count;
- BUSINESS + IDENTITY verification progress;
- active provider-account count where the membership may view provider accounts;
- setup checklist for verification, store creation, and admin approval.

Summary calls are permission-aware so a staff user is not forced to call provider/KYC/store endpoints they are not allowed to read.

## 8. KYC / Verification

`/vendor/:vendorId/kyc` integrates:

```text
GET  /api/v1/vendors/:vendorId/verifications
POST /api/v1/vendors/:vendorId/verifications
```

The UI supports the P3 verification vocabulary:

```text
BUSINESS
IDENTITY
BANK_ACCOUNT
OTHER
```

and status history:

```text
PENDING
VERIFIED
REJECTED
EXPIRED
```

Important boundary: the current backend contract stores a verification type and reference, but it does not expose a secure KYC-document upload endpoint. Runtime policy now requires a non-blank `reference` for BUSINESS, IDENTITY, and BANK_ACCOUNT submissions; OTHER may omit it. The frontend therefore does **not** invent a file-upload flow or persist identity documents in browser state/localStorage. BUSINESS + IDENTITY remain the current approval baseline; BANK_ACCOUNT is shown as the settlement prerequisite established by P3.

### Admin review and settlement-account operations

The `/admin` workspace now includes a vendor-review surface backed by the privileged P3 routes. ADMIN and SUPER_ADMIN users with satisfied MFA can filter vendor applications, inspect verification history, verify/reject individual checks, approve/reject/suspend vendors, and manage Paystack/Flutterwave provider-account records.

Approval uses the **latest** BUSINESS and IDENTITY records and rejects expired checks. Provider-account activation requires an APPROVED vendor plus the latest current VERIFIED BANK_ACCOUNT check. Rejection, suspension, and settlement disable/suspend decisions require an auditable reason. Collection-time gateway splits remain disabled because CartNest's settlement policy is delivery-gated.

## 9. Stores

The store frontend integrates:

```text
GET   /api/v1/vendors/:vendorId/stores
POST  /api/v1/vendors/:vendorId/stores
PATCH /api/v1/stores/:storeId
POST  /api/v1/stores/:storeId/activate
POST  /api/v1/stores/:storeId/close
```

Implemented behavior:

- multiple stores per vendor;
- DRAFT creation;
- name/slug/description editing;
- responsive store listing;
- lifecycle state display;
- UI disables activation while vendor status is not APPROVED;
- backend remains authoritative and still validates the activation rule.

## 10. Staff and Granular Permissions

`/vendor/:vendorId/staff` integrates:

```text
GET    /api/v1/vendors/:vendorId/members
POST   /api/v1/vendors/:vendorId/members/invite
PATCH  /api/v1/vendors/:vendorId/members/:memberId
DELETE /api/v1/vendors/:vendorId/members/:memberId
```

The UI supports the complete current P3 permission vocabulary grouped by capability:

- stores;
- catalog;
- inventory;
- orders/fulfillment/refunds;
- staff;
- analytics/verification/provider-account visibility.

The frontend now mirrors the backend delegation rules more closely:

- a staff inviter cannot select a permission they do not hold;
- only an OWNER can change membership roles;
- a staff manager cannot edit/remove an OWNER merely because they hold `staff:update`/`staff:remove`;
- a member cannot change or remove their own membership from this screen;
- pending invitations expose permission preparation only, not role/status activation;
- demoting an OWNER to STAFF does not silently convert the owner's effective full-access DTO into an explicit full staff permission set.

Backend final-owner and permission-delegation safeguards remain authoritative.

## 11. Invitation Acceptance Boundary Fix

FP3 review exposed a backend state-machine gap: the generic member-update service previously accepted `status: ACTIVE` for an `INVITED` membership, which could bypass the intended self-acceptance endpoint.

That is now closed in `VendorService.updateMember`:

```text
INVITED membership
      +
role/status mutation through generic PATCH
      ↓
409 INVITATION_ACCEPTANCE_REQUIRED
```

Only:

```text
POST /api/v1/vendors/:vendorId/memberships/accept
```

may activate the invited user's membership. Permission preparation may still be updated while the invitation is pending. Targeted backend tests were added for activation bypass, role promotion bypass, and allowed permission preparation.

## 12. API Base-URL Consistency Fix

Frontend integration also exposed an environment mismatch. Generated/client route definitions already contain `/api/v1`, while the staging/config examples were appending `/api/v1` to `NEXT_PUBLIC_API_BASE_URL` as well.

That could create requests such as:

```text
https://api.staging.cartnest.example/api/v1/api/v1/...
```

The contract is now consistent:

```text
NEXT_PUBLIC_API_BASE_URL = API origin only
                         = https://api.staging.cartnest.example
```

Versioned endpoint paths remain owned by the API client/wrapper.

The shared web config default and both staging examples were updated accordingly.

## 13. Issues Fixed During FP3

The FP3 source pass closes the following identified issues:

1. **P3+ generated-client integration blocker** — contract-derived `@repo/api-client` bridge added instead of duplicated DTOs/raw fetch.
2. **No vendor workspace navigation** — seller entry point and vendor workspace shell added.
3. **No vendor onboarding UI** — integrated application flow added.
4. **Vendor onboarding allowed an avoidable unverified-identifier failure** — frontend precondition now mirrors the backend invariant.
5. **No KYC/status UI** — contract-supported verification flow added without inventing document handling.
6. **No multi-store UI** — store create/list/edit/lifecycle flow added.
7. **No staff/permission UI** — invitation, membership update, removal, and granular permission editor added.
8. **Invited/suspended membership treated too loosely in UI authorization** — frontend permission helper explicitly requires ACTIVE membership.
9. **Staff UI could offer permissions the actor could not delegate** — invite/editor controls now honor the actor's own permission set.
10. **Staff UI could offer owner/self mutations the API rejects** — role, self-change, owner removal, and status controls now match backend policy.
11. **Generic member update could activate an invitation without user acceptance** — backend state-machine gap fixed and targeted tests committed.
12. **Staging API URL could duplicate `/api/v1`** — frontend/config/deployment base-URL convention corrected.
13. **Admin vendor-review navigation gap** — the role-gated `/admin` entry now leads to a complete vendor/KYC review surface, including provider-account settlement operations.

## 14. Remaining Non-Code/External Issues

### GitHub Actions startup failure

Actions continues to create synthetic runs with:

```text
path: BuildFailed
conclusion: startup_failure
jobs: 0
```

The committed `.github/workflows/ci.yml` is structurally normal and no job is ever scheduled, so there is no job log proving a repository command failed. This remains an account/platform Actions-startup issue rather than a demonstrated TypeScript/test failure. It cannot be truthfully marked fixed from source code alone.

### Runtime evidence

GitHub Actions still does not start jobs, so hosted-CI evidence remains unavailable. Local validation was rerun on 2026-10-05 after the admin-vendor integration repair:

```text
API tests                         116 passed / 4 skipped
Web tests                         28 passed
Contracts tests                   70 passed
API/Web/API-client typecheck      PASS
API production build              PASS
Next.js production build          PASS
ESLint + dependency boundaries    PASS
Documentation link check          PASS
OpenAPI + generated client        REGENERATED
```

The local host uses Node 22 while the repository declares Node >=24.20.0 <26, so pnpm reports an engine warning. API/Web typechecking was also given a larger Node heap on the constrained cloud host. Browser/API E2E, responsive browser QA, provider sandbox validation, and hosted CI remain separate runtime evidence gates.

### OpenAPI generation

The OpenAPI snapshot and `packages/api-client/src/generated/schema.ts` were regenerated after the admin-vendor integration repair. The generated paths now include privileged vendor-verification and provider-account list operations, removing the stale P3+ schema gap while the shared-contract facade remains the higher-level application API.

### Secure KYC document capture

The current P3 backend contract has a verification `reference`, not a protected KYC-document upload lifecycle. FP3 intentionally does not fabricate one. If actual identity/business document collection is required for the launch policy, that needs an explicit secure backend/storage contract before the frontend adds file inputs.

## 15. FP3 Exit-Gate State

```text
Vendor onboarding UI                     IMPLEMENTED
Verified-identifier onboarding gate      IMPLEMENTED
Vendor list/multi-membership UI           IMPLEMENTED
Vendor workspace                          IMPLEMENTED
KYC/reference/status UI                   IMPLEMENTED
Store create/list/edit/lifecycle          IMPLEMENTED
Staff invitation                          IMPLEMENTED
Granular permission editing               IMPLEMENTED
Invitation state-machine hardening        IMPLEMENTED
Contract-derived typed integration        IMPLEMENTED
API base-URL consistency                  FIXED
Loading/empty/error/success states        IMPLEMENTED
Responsive/keyboard-oriented source       IMPLEMENTED
Frontend permission logic test            COMMITTED
Backend invitation policy tests           COMMITTED
Runtime build/test evidence               LOCAL PASS 2026-10-05
Browser/API integration evidence          NOT EXECUTED
```

## 16. Next Frontend Phase

**FP4 — public marketplace catalog, categories/search/filtering, product detail, vendor products, normalized option/variant builder, Cloudflare R2 media upload, and moderation-aware product state.**
