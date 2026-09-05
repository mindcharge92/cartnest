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

Important boundary: the current backend contract accepts a verification type and optional `reference`; it does not expose a secure KYC-document upload endpoint. The frontend therefore does **not** invent a file-upload flow or persist identity documents in browser state/localStorage. BUSINESS + IDENTITY remain the current approval baseline; BANK_ACCOUNT is shown as the settlement prerequisite established by P3.

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

Owners are represented as full-access users. Staff permission checkboxes are editable only when the current member has `staff:update`. Removal is shown only with `staff:remove`, and the current user's own removal button is disabled in the UI. Backend final-owner safeguards remain authoritative.

## 11. Issues Fixed During FP3

The following previously identified issues were addressed in source:

1. **P3+ generated-client integration blocker** — closed with the contract-derived `@repo/api-client` bridge rather than duplicated DTOs/raw fetch.
2. **No vendor workspace navigation** — seller entry point and vendor workspace shell added.
3. **No vendor onboarding UI** — integrated application flow added.
4. **No KYC/status UI** — contract-supported verification flow added without inventing document handling.
5. **No multi-store UI** — store create/list/edit/lifecycle flow added.
6. **No staff/permission UI** — invitation, membership update, removal, and granular permission editor added.
7. **Invited/suspended membership treated too loosely in UI authorization** — frontend permission helper explicitly requires ACTIVE membership.
8. **Potential dead Admin navigation before FP10** — the main header exposes Seller now but intentionally does not expose `/admin` until the admin frontend exists.

## 12. Remaining Non-Code/External Issues

### GitHub Actions startup failure

Actions continues to create synthetic runs with:

```text
path: BuildFailed
conclusion: startup_failure
jobs: 0
```

The committed `.github/workflows/ci.yml` is structurally normal and no job is ever scheduled, so there is no job log proving a repository command failed. This remains an account/platform Actions-startup issue rather than a demonstrated TypeScript/test failure. It cannot be truthfully marked fixed from source code alone.

### Runtime evidence

Because Actions does not start, the following remain unverified by execution:

```text
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
browser/API integration
responsive browser QA
```

### OpenAPI generation

The generated `schema.ts` snapshot is still stale. FP3 is unblocked by the shared-contract bridge, but the preferred long-term state remains a successfully regenerated OpenAPI client once execution is available.

## 13. FP3 Exit-Gate State

```text
Vendor onboarding UI                     IMPLEMENTED
Vendor list/multi-membership UI           IMPLEMENTED
Vendor workspace                          IMPLEMENTED
KYC/reference/status UI                   IMPLEMENTED
Store create/list/edit/lifecycle           IMPLEMENTED
Staff invitation                          IMPLEMENTED
Granular permission editing               IMPLEMENTED
Contract-derived typed integration        IMPLEMENTED
Loading/empty/error/success states         IMPLEMENTED
Responsive/keyboard-oriented source        IMPLEMENTED
Frontend permission logic test            COMMITTED
Runtime build/test evidence               NOT EXECUTED
Browser/API integration evidence          NOT EXECUTED
```

## 14. Next Frontend Phase

**FP4 — public marketplace catalog, categories/search/filtering, product detail, vendor products, normalized option/variant builder, Cloudflare R2 media upload, and moderation-aware product state.**
