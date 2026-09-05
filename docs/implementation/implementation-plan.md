# CartNest Exact Implementation Plan

**Status:** Approved execution baseline  
**Last updated:** 5 September 2026  
**Applies to:** repository scaffolding through production launch  
**Primary stack:** Next.js + Fastify + Turborepo + PostgreSQL/Prisma + TypeBox + OpenAPI + typed API client

## 1. Purpose

This document defines the exact order in which CartNest should be built. It converts the product specification, approved decision register, ADRs, API design, security standard, and data model into implementation phases with explicit dependencies and quality gates.

The purpose is to prevent feature-first development from creating architectural drift. A phase is not complete because screens exist or endpoints return data; it is complete only when its contracts, database changes, authorization, tests, observability, documentation, and failure behavior satisfy the exit gate.

## 2. Governing Rules

1. Accepted ADRs and `docs/product/approved-product-decisions.md` take precedence over framework defaults.
2. Every public API shape is authored through shared TypeBox contracts.
3. Prisma models are persistence models, not frontend DTOs.
4. Fastify is authoritative for authentication, authorization, ownership, price calculation, inventory, and payment state.
5. Any high-risk mutation must be idempotent where retries could create duplicate economic or inventory effects.
6. Every schema change is introduced through a reviewed Prisma migration.
7. New external-provider code is hidden behind an adapter boundary.
8. Every phase adds tests at the level appropriate to the risk.
9. Background jobs and provider events must be replay-safe.
10. Production deployment is blocked until the production-readiness gate is satisfied.

## 3. Target Repository After Scaffolding

```text
apps/
  web/                       # Next.js buyer/vendor/admin application
  api/                       # Fastify HTTP application
  worker/                    # background/event worker process

packages/
  contracts/                 # TypeBox schemas + inferred DTOs
  api-client/                # generated/mechanically derived typed client
  database/                  # Prisma schema/client/migrations
  config/                    # typed environment/configuration
  ui/                        # reusable UI primitives
  testing/                   # shared factories/test helpers
  eslint-config/
  typescript-config/

docs/
  product/
  architecture/
  engineering/
  api/
  data/
  implementation/
  integrations/
  operations/
  security/
```

## 4. Phase Dependency Graph

```text
P0 Repository Foundation
        |
        v
P1 Database + Contracts Foundation
        |
        v
P2 Identity + Sessions + Authorization
        |
        v
P3 Vendor + Store + KYC
        |
        v
P4 Catalog + Variants + Media
        |
        v
P5 Inventory + Wishlist + Cart
        |
        v
P6 Checkout + Parent/Vendor Orders
        |
        v
P7 Payments + Commission + Webhooks
        |
        v
P8 Logistics + Shipment Tracking
        |
        v
P9 Returns + Refunds + Reviews
        |
        v
P10 Admin + Analytics + Notifications
        |
        v
P11 Hardening + Performance + Security
        |
        v
P12 Staging + UAT + Recovery Drills
        |
        v
P13 Production Launch
```

Some UI work may proceed in parallel after its API contracts are stable, but database/security/financial dependencies must not be bypassed.

---

## 5. Phase 0 — Repository and Tooling Foundation

### Objectives

Create the monorepo and make architecture rules executable.

### Deliverables

- initialize pnpm workspace and Turborepo;
- create `apps/web`, `apps/api`, `apps/worker`;
- create the shared packages listed above;
- establish TypeScript strict mode;
- establish shared ESLint/formatting rules;
- configure root scripts for `dev`, `build`, `lint`, `typecheck`, `test`;
- configure environment validation package;
- create Docker development baseline for PostgreSQL and Redis;
- create GitHub Actions baseline;
- add dependency-boundary rules;
- add conventional `.env.example` files without secrets;
- add health-check skeletons;
- establish test runner and fixtures;
- pin the initial supported Node.js and package-manager versions.

### Required CI checks

```text
install
lint
typecheck
test
build
```

### Exit gate

- fresh clone can be installed and built from documented commands;
- web, API, and worker start locally;
- CI passes on an empty vertical slice;
- frontend cannot import database/server packages;
- secret files are ignored;
- documentation links are valid.

---

## 6. Phase 1 — Database and Contract Foundation

### Objectives

Establish the persistence layer and API-contract infrastructure before feature routes multiply.

### Deliverables

- adopt the exact initial Prisma schema from the Prisma specification;
- configure Prisma ORM v7 style `prisma.config.ts`;
- generate Prisma client into `packages/database/src/generated/prisma`;
- create the first migration sequence;
- seed only safe development/reference data;
- configure TypeBox + Fastify type provider;
- configure OpenAPI and Swagger UI;
- establish common contracts:
  - identifiers;
  - timestamps;
  - Money;
  - pagination;
  - error envelope;
  - success metadata where needed;
- establish typed-client generation flow;
- create repository transaction helper;
- add `AuditLog`, `OutboxEvent`, `IdempotencyRecord` infrastructure.

### Tests

- migration applies to an empty PostgreSQL database;
- migration rollback/recovery process is documented;
- contract package compiles independently;
- OpenAPI generation is deterministic;
- typed client regenerates and typechecks;
- database package cannot be imported into `apps/web`.

### Exit gate

The team can implement one route from TypeBox contract -> Fastify -> service -> Prisma -> response DTO -> OpenAPI -> typed client without duplicate types.

---

## 7. Phase 2 — Identity, Authentication, Sessions, and Authorization

### Scope

Implement customer/admin identity before vendor ownership depends on it.

### Backend deliverables

- user registration with email + phone data model;
- one initially verified identifier policy;
- password hashing;
- login/logout/logout-all;
- 15-minute access credential;
- 30-day rotating refresh session;
- refresh-token/session replay handling;
- password reset;
- email/phone verification primitives;
- Google OAuth identity linking/login;
- ADMIN/SUPER_ADMIN MFA capability;
- current-session endpoint;
- RBAC + permission primitives;
- audit events;
- auth rate limiting;
- CSRF/CORS policy according to deployment topology.

### Frontend deliverables

- register/login/recovery screens;
- authenticated application shell;
- typed current-session state;
- authorization-aware navigation;
- session-expired behavior.

### Exit gate

- token/session secrets never use localStorage;
- refresh rotation and revocation are integration-tested;
- CUSTOMER cannot call admin endpoints;
- MFA-protected admin flow is testable;
- OAuth state/redirect handling is protected;
- security audit records are produced.

---

## 8. Phase 3 — Vendor, Store, Membership, KYC, and Provider Accounts

### Deliverables

- vendor application workflow;
- vendor verification/KYC records;
- admin approve/reject/suspend actions;
- multiple stores per vendor;
- user membership in multiple vendors;
- OWNER and STAFF membership roles;
- granular permission records;
- store create/update/activation;
- vendor staff invitation/add/remove lifecycle;
- provider-account/subaccount records for future settlement;
- vendor/store ownership helpers used by every downstream module.

### Required invariants

- vendor cannot sell while unapproved;
- vendor A cannot read/write vendor B protected resources;
- store belongs to exactly one vendor;
- a user may simultaneously be customer, owner, and staff in different contexts;
- privileged moderation changes are audited.

### Exit gate

A verified vendor owner can create a store and delegate a restricted staff account without any horizontal-authorization leak.

---

## 9. Phase 4 — Catalog, Variants, Categories, Media, and Moderation

### Deliverables

- admin-controlled categories and hierarchy;
- products;
- normalized product options and option values;
- variants;
- per-store SKU uniqueness;
- variant price in integer minor units;
- risk-based product moderation;
- Cloudflare R2 upload-intent endpoint;
- direct presigned upload;
- media completion/activation;
- product/store media ordering and alt text;
- buyer catalog/detail endpoints;
- search/filter/sort baseline;
- vendor product management screens.

### Exit gate

- product with normalized variants can be created by the correct store only;
- duplicate SKU within one store is rejected;
- same SKU in another store is permitted;
- invalid media ownership is rejected;
- buyer responses expose no internal moderation/vendor-only fields;
- catalog queries are indexed and paginated.

---

## 10. Phase 5 — Inventory, Wishlist, and Cart

### Deliverables

- `InventoryItem` per variant;
- stock adjustment ledger;
- concurrency-safe stock update primitive;
- authenticated wishlist;
- one active cart per user enforced with database migration support;
- multi-store cart items;
- cart quantity validation;
- checkout-preview endpoint that reprices and revalidates without mutating order state.

### Exit gate

- vendor cannot adjust another store's inventory;
- cart can contain variants from multiple stores;
- frontend-stored price is never trusted;
- concurrent stock adjustments do not produce invalid quantity;
- wishlist/cart ownership is enforced.

---

## 11. Phase 6 — Checkout, Inventory Reservation, and Multi-Vendor Orders

### Deliverables

- 15-minute reservation lifecycle;
- idempotent checkout endpoint;
- price and product snapshots;
- parent `Order`;
- one `VendorOrder` per store represented in checkout;
- immutable `OrderItem` snapshots;
- commission/tax/delivery calculation hooks;
- initial payment intent creation boundary;
- cancellation state machine;
- order history/detail APIs;
- vendor-order queue/dashboard;
- automatic vendor acceptance by default unless explicit manual-processing rule applies.

### Transaction requirement

The following must be atomic or safely compensatable:

```text
validate stock
reserve inventory
create Order
create VendorOrders
create OrderItems
persist financial snapshots
create logical PaymentIntent
```

### Exit gate

- same checkout idempotency key cannot create two orders;
- two buyers cannot reserve the same final unit successfully;
- one parent order decomposes correctly by store;
- cancellation releases reservations when appropriate;
- vendor sees only its VendorOrder slice.

---

## 12. Phase 7 — Payments, Commission, Gateway Fees, and Provider Webhooks

### Deliverables

- Paystack adapter as default provider;
- Flutterwave adapter as secondary provider;
- provider routing service;
- PaymentIntent and PaymentAttempt state machines;
- provider references;
- payment initialization API;
- Paystack webhook endpoint;
- Flutterwave webhook endpoint;
- signature verification;
- server-side verification before fulfillment value is granted;
- provider event inbox/deduplication;
- payment reconciliation jobs;
- configurable platform default commission;
- vendor/category commission overrides;
- commission snapshot on VendorOrder/payment allocation;
- vendor-bears-gateway-fee MVP policy;
- payment allocation records;
- provider subaccount/split support where approved accounts exist.

### Safe fallback rule

```text
definite non-charge failure -> retry/fallback may proceed
unknown or processing       -> reconcile first
success                     -> never retry
```

### Exit gate

- forged webhook cannot mark an order paid;
- amount/currency/reference mismatch cannot mark an order paid;
- duplicate webhook has no duplicate effect;
- timeout/unknown state cannot automatically cause a second provider charge;
- payment allocation reconciles exactly to captured amount;
- successful payment commits stock exactly once.

---

## 13. Phase 8 — Logistics and Shipment Tracking

### Deliverables

- logistics provider interface;
- GIGL adapter;
- manual/self-delivery adapter;
- quote/fee abstraction;
- shipment creation;
- multiple shipments per VendorOrder;
- tracking synchronization;
- shipment events;
- delivery confirmation;
- customer and vendor tracking views;
- shipment-sync background jobs.

### Exit gate

- delivery fee belongs to VendorOrder scope;
- provider status maps into CartNest status without leaking provider enums to public API;
- GIGL outage does not corrupt order state;
- manual shipment remains usable independently;
- `DELIVERED` is auditable and becomes the trigger for review eligibility and settlement eligibility.

---

## 14. Phase 9 — Returns, Refunds, and Reviews

### Deliverables

- ReturnRequest;
- ReturnItem;
- return state machine;
- cancellation-vs-return boundary;
- partial/full refund request;
- refund provider execution;
- refund reconciliation;
- vendor refund permissions within policy;
- admin override/review;
- delivered-purchase product review;
- delivered VendorOrder store review;
- moderation and anti-abuse controls.

### Exit gate

- refund cannot exceed remaining refundable value;
- repeated refund command cannot double-refund;
- returned items can restock only through explicit inventory adjustment policy;
- non-purchaser cannot submit a verified product review;
- store review requires delivered VendorOrder.

---

## 15. Phase 10 — Admin, Analytics, Promotions, Tax, and Notifications

### Deliverables

- admin user/vendor/store/product/order/payment/refund views;
- moderation workflows;
- platform analytics read models;
- vendor analytics read models;
- configurable VAT/tax rate;
- platform-controlled promotion/coupon baseline;
- email/SMS/in-app notification orchestration;
- notification templates and preferences where applicable;
- dead-letter/retry operational screens or queries;
- financial/reconciliation operational views.

### Exit gate

Admin tooling can explain the state of an order/payment/refund without direct database access, and privileged changes generate audit entries.

---

## 16. Phase 11 — Hardening, Performance, Security, and NDPR

### Workstream

- dependency/security scans;
- threat-model verification;
- authorization matrix tests;
- rate-limit tuning;
- query/index review;
- checkout/payment load test;
- low-bandwidth frontend audit;
- image optimization;
- structured log redaction test;
- PII/data-retention review;
- right-to-erasure/anonymization workflow;
- provider secret rotation procedure;
- backup automation;
- restore test;
- resilience tests for provider outage and duplicate events.

### Exit gate

No known critical security issue, financial invariant failure, or unrecoverable backup gap remains.

---

## 17. Phase 12 — Staging, UAT, and Operational Rehearsal

### Required staging exercises

- production-like deployment from CI;
- clean migration from previous release;
- rollback rehearsal;
- database restore rehearsal;
- expired reservation cleanup;
- Paystack test payment/webhook/refund;
- Flutterwave test payment/webhook/refund;
- GIGL test/sandbox path where credentials permit;
- R2 upload/delete lifecycle;
- admin MFA recovery procedure;
- simulated provider outage;
- simulated worker failure/dead-letter;
- basic load test;
- usability/UAT session.

### Exit gate

Production runbook steps have been executed in staging rather than only written down.

---

## 18. Phase 13 — Production Launch

### Launch sequence

1. freeze schema-changing work;
2. confirm backups and restore point;
3. confirm production secrets/provider callbacks;
4. run CI release pipeline;
5. apply migrations through controlled migration job;
6. deploy API/worker/web;
7. run smoke tests;
8. verify login, catalog, checkout, provider webhooks, media and shipment paths;
9. monitor elevated-alert dashboard;
10. release traffic progressively if deployment topology permits;
11. document launch version/commit/migration IDs.

### Launch-blocking conditions

- migration failure;
- inability to verify payment webhooks;
- broken authorization boundary;
- unavailable current database backup;
- failed smoke checkout;
- worker cannot process critical queues;
- unexplained financial reconciliation difference.

---

## 19. Definition of Done for Every Feature

A feature is done only when applicable items are complete:

- contract/schema;
- authorization/ownership policy;
- use case/domain behavior;
- persistence/migration;
- response mapping;
- OpenAPI;
- typed API client;
- frontend state/error/loading handling;
- unit tests;
- route/integration tests;
- high-risk end-to-end tests;
- audit/observability events;
- background/retry behavior;
- documentation update;
- accessibility/responsive check;
- security review for sensitive features.

## 20. Change Control

If implementation reveals a design conflict:

1. stop the conflicting implementation;
2. identify the governing ADR/specification;
3. document the proposed change;
4. update/supersede the ADR or product decision;
5. update schema/contracts/tests;
6. continue implementation.

Framework convenience is not sufficient justification for silent architectural deviation.
