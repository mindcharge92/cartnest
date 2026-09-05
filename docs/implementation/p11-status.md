# P11 — Hardening, Performance, Security, and NDPR Status

**Phase:** P11  
**Status:** Backend/operations source baseline implemented; runtime security, load, migration, restore, and provider evidence remain pending  
**Updated:** 5 September 2026

## 1. Scope

P11 hardens the P0–P10 backend baseline before staging/UAT. The implemented source work covers:

- restrictive API security headers;
- non-cacheable authentication/admin/privacy responses;
- generic unexpected-error responses and reduced sensitive error logging;
- privacy/data-subject export contracts and routes;
- account-erasure request workflow;
- administrator-reviewed anonymisation;
- active-business/fulfilment erasure blockers;
- NDPR-oriented retention/erasure standard;
- privacy-request persistence and database constraints;
- performance/read-path index review;
- configurable HTTP benchmark harness;
- repository secret scanning;
- dependency audit CI gate;
- PostgreSQL backup automation;
- guarded PostgreSQL restore automation;
- P11 contract/API security tests;
- production hardening composition used by the actual API server and OpenAPI generator.

Frontend low-bandwidth, image-optimization, browser CSP, and accessibility performance work remain intentionally deferred to the agreed frontend/integration pass.

## 2. Hardened API Composition

The production server now uses:

```text
buildApp (P0-P10 modules)
        ↓
buildHardenedApp
        ├── P11 response security headers
        ├── P11 generic/redacted unexpected-error handling
        └── Privacy/NDPR routes
        ↓
server.ts
```

OpenAPI generation also uses `buildHardenedApp`, so P11 privacy routes become part of the machine-readable contract once code generation can execute.

## 3. Security Headers

The P11 API response baseline adds:

```text
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains   # production only
```

The restrictive API CSP is intentionally not applied to the non-production Swagger UI route because Swagger requires browser assets/behavior and is not registered in production.

Authenticated/sensitive prefixes receive:

```text
Cache-Control: no-store
Pragma: no-cache
```

for `/api/v1/auth`, `/api/v1/privacy`, and `/api/v1/admin` responses.

The future Next.js browser application requires its own CSP because frontend script/style/payment requirements differ from a JSON API.

## 4. Unexpected Error Redaction

P11 replaces the base generic error handler in the hardened composition.

Unexpected errors are logged only with a limited classification:

```text
errorName
errorCode
statusCode
requestId
```

The handler does not intentionally log request bodies, cookies, provider payloads, or nested error objects. Client responses remain generic and do not expose internal exception messages.

Expected module errors continue to use their stable typed error envelopes.

## 5. Secret and Dependency Security Gates

Root commands now include:

```bash
pnpm security:scan
pnpm security:audit
```

`security:scan` checks tracked text source for high-confidence credential patterns including private keys, Paystack/Flutterwave secret-key forms, GitHub tokens, OpenAI keys, and AWS access-key IDs.

The CI definition now adds:

```text
secret scan
high/critical dependency audit
```

before normal lint/Prisma/codegen/typecheck/test/build gates.

These are committed gates, not a claim that the current GitHub Actions infrastructure has executed them successfully; Actions is still failing before any job is created.

## 6. Existing Authentication/Abuse Controls Reviewed

P11 retains the P2 controls already present:

- login/register/reset/verification/TOTP route-specific rate limits;
- CSRF token validation on cookie-authenticated mutations;
- CORS allowlist;
- mutating Origin validation;
- HttpOnly access/refresh/MFA cookies;
- 15-minute access lifetime;
- rotating/revocable 30-day refresh sessions;
- server-side backing-session verification;
- privileged MFA for ADMIN/SUPER_ADMIN.

A single indiscriminate global rate limit is deliberately not added at source level because customer traffic, webhooks, provider callbacks, and administrative operations have different safe limits. Endpoint/provider-specific tuning is a P12 staging exercise based on realistic traffic and provider retry behavior.

## 7. NDPR / Data Subject Export

P11 establishes:

```text
GET /api/v1/privacy/export
```

The export is authenticated, no-store, and returns a machine-readable account-data package containing the subject's relevant application data while intentionally excluding:

- password hashes;
- session/refresh token hashes;
- MFA secrets;
- provider credentials;
- other users' private data.

The source export covers account/contact data, saved addresses, vendor memberships/permissions, orders/commercial snapshots, reviews, return records, and notification preferences.

## 8. Account Erasure Workflow

Buyer endpoints:

```text
POST /api/v1/privacy/erasure-requests
GET  /api/v1/privacy/erasure-requests
```

Admin endpoints:

```text
GET  /api/v1/admin/privacy/erasure-requests
POST /api/v1/admin/privacy/erasure-requests/:privacyRequestId/process
```

Administrative processing requires:

```text
authenticated principal
        ↓
ADMIN / SUPER_ADMIN
        ↓
privileged MFA
        ↓
ANONYMIZE or REJECT
```

Every request/decision is audited.

## 9. Erasure Safety Blockers

Automatic anonymisation is blocked when the subject has any active obligation that cannot safely disappear:

```text
privileged platform role
active vendor ownership
open orders
open returns
open refunds initiated by the subject
```

A blocked request enters `REQUIRES_REVIEW` rather than pretending erasure succeeded.

This is particularly important for marketplace vendors: an active OWNER must transfer/close the business responsibility before account anonymisation can proceed.

## 10. Approved Anonymisation Effect

When an administrator approves an eligible erasure request, the P11 source transaction:

- removes AuthIdentity rows;
- removes AuthSession rows;
- removes MFA factors;
- removes saved addresses;
- removes wishlist/cart data;
- removes notification receipts/preferences;
- redacts notification recipient/payload data;
- clears review free text;
- redacts return free-text reasons;
- redacts historical delivery-address snapshots;
- removes non-owner staff memberships from active use;
- clears email, phone, normalized identifiers, password hash, and verification timestamps;
- resets platform role to USER;
- disables the account;
- retains the opaque User UUID where commercial/audit relational integrity requires a pseudonymous key;
- marks the PrivacyRequest completed;
- records an AuditLog entry.

This preserves financial/order evidence without retaining ordinary account credentials/contact data unnecessarily.

## 11. Retention Policy

The detailed policy is:

```text
docs/security/data-retention-and-erasure-standard.md
```

P11 intentionally does **not** invent legal retention periods for Nigerian financial/KYC/audit data.

Before production, business/legal review must approve numeric retention schedules for financial records, KYC, provider events, disputes/refunds, security logs, notifications, backups, and ephemeral data. Worker/operations jobs can then enforce those approved values.

## 12. Privacy Persistence

P11 introduces:

```text
packages/database/prisma/p11.prisma
```

with `PrivacyRequest` and `PrivacyRequestStatus`.

Reviewed raw PostgreSQL source adds:

- PrivacyRequest → User FK;
- processedBy → User FK;
- partial unique index permitting only one active privacy request per user.

This source belongs in the reviewed migration rather than being executed ad hoc.

## 13. Query and Index Review

The P10 admin/analytics surfaces created new range-heavy reads. P11 adds reviewed PostgreSQL index source for:

```text
Order(createdAt DESC)
VendorOrder(storeId, createdAt DESC)
Refund(createdAt DESC)
PaymentIntent(status, createdAt DESC)
```

The final index decision still requires `EXPLAIN (ANALYZE, BUFFERS)` against realistic staging data before production. P11 source indexes are candidates backed by current query shapes, not proof of production performance.

## 14. Performance Harness

Root command:

```bash
pnpm perf:benchmark
```

The Node-based harness supports configurable:

```text
base URL
path
HTTP method
request count
concurrency
headers
body
unique Idempotency-Key generation
P95 budget
error-rate budget
```

This makes it possible to run the same tool against read paths or controlled seeded checkout/payment scenarios during P12.

Default thresholds are only development smoke values. Real checkout/payment SLO/load targets must be measured and approved in staging.

## 15. Backup and Restore Automation

P11 adds:

```bash
pnpm db:backup
pnpm db:restore
```

### Backup

`postgres-backup.mjs`:

- requires `DATABASE_URL`;
- invokes `pg_dump` in custom format;
- excludes owner/ACL metadata;
- uses `PGPASSWORD` rather than embedding the password in the command arguments;
- writes timestamped dumps to `BACKUP_DIR` (default `backups/`).

### Restore

`postgres-restore.mjs`:

- requires `DATABASE_URL`;
- requires `RESTORE_FILE`;
- refuses to run unless `CONFIRM_RESTORE=YES`;
- invokes `pg_restore` with clean/if-exists/no-owner/no-acl;
- uses one transaction and exits on error.

A script existing is not a successful disaster-recovery test. P12 must execute an actual backup + restore rehearsal on isolated staging infrastructure and verify business invariants afterward.

## 16. P11 Tests Added

Source tests now cover:

- security header presence;
- no-store privacy/auth response behavior;
- generic unexpected errors not leaking their internal message to HTTP clients;
- privacy/OpenAPI route registration;
- auth required before personal-data export;
- privacy pagination contract;
- explicit reviewed anonymise/reject contract.

Existing earlier-phase tests remain relevant to P11's threat-model verification, including CSRF/CORS/session rules, vendor ownership, payment webhook integrity/idempotency, inventory concurrency, refunds, and provider state handling.

## 17. P11 Exit-Gate Assessment

The implementation plan's P11 exit gate is:

> No known critical security issue, financial invariant failure, or unrecoverable backup gap remains.

That gate **cannot yet be claimed as runtime verified** because:

- GitHub Actions still creates zero jobs;
- dependency audit has therefore not executed in trusted CI;
- Prisma P11 migration has not been applied/reviewed against PostgreSQL;
- performance/load tests have not run against staging data;
- a backup restore drill has not executed;
- external-provider resilience exercises remain staging tasks;
- frontend/low-bandwidth/image hardening is intentionally deferred until the frontend integration pass.

The correct status is therefore **P11 source baseline implemented, execution gate pending**.

## 18. Current Phase Position

```text
P0  Repository/tooling foundation            implemented source baseline
P1  Database + contracts                     implemented source baseline
P2  Identity/auth/session/authorization       implemented source baseline
P3  Vendor/store/KYC/membership               implemented source baseline
P4  Catalog/variants/media                    implemented source baseline
P5  Inventory/wishlist/cart                   implemented source baseline
P6  Checkout/orders/reservations              implemented source baseline
P7  Payments/commission/webhooks              implemented source baseline
P8  Logistics/shipments                       implemented source baseline
P9  Returns/refunds/reviews                   implemented source baseline
P10 Admin/analytics/promotions/tax/notifs      implemented source baseline
P11 Hardening/performance/security/NDPR        implemented source baseline

NEXT: P12 Staging / UAT / Recovery Rehearsals
```

P12 is where the project must stop relying on source inspection and begin producing environment-backed evidence: migrations, provider sandboxes, backup restore, security checks, load tests, operational runbooks, and UAT.
