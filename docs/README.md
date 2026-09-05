# CartNest Engineering Documentation

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses. This documentation set defines the product scope, approved business decisions, architecture, API conventions, database design, security model, financial rules, implementation order, external-provider boundaries, operational standards, disaster recovery, and production runbooks before production application code is introduced.

## Baseline Technology Stack

- **Frontend:** Next.js + TypeScript
- **Backend API:** Fastify + TypeScript
- **Background processing:** separate worker process + BullMQ/Redis
- **Repository:** Turborepo monorepo
- **Architecture:** modular monolith
- **Database:** PostgreSQL + Prisma
- **API style:** REST + OpenAPI
- **Runtime contracts:** TypeBox schemas
- **Frontend/backend consistency:** shared contracts + typed API client
- **Payments:** Paystack primary + Flutterwave secondary
- **Logistics:** provider abstraction with GIGL first + manual delivery
- **Media:** Cloudflare R2 via presigned direct upload
- **Containerization:** Docker
- **CI/CD:** GitHub Actions
- **Initial operations model:** Dockerized cloud/VPS deployment with managed PostgreSQL preferred

---

# Documentation Map

## 1. Product

- [`product/feature-specification.md`](product/feature-specification.md) — full buyer, vendor, marketplace, order, payment, logistics, review, admin, privacy, and engineering feature scope.
- [`product/approved-product-decisions.md`](product/approved-product-decisions.md) — authoritative record of the confirmed MVP decisions, including vendor/store ownership, auth/session lifetimes, variants, inventory, multi-vendor checkout, commissions, payments, settlement baseline, logistics, reviews, returns, R2, and API consumers.

When a living product specification still contains old/open wording, the most recent approved decision register or accepted ADR takes precedence until the specification is updated.

## 2. Implementation

- [`implementation/implementation-plan.md`](implementation/implementation-plan.md) — exact build sequence from repository scaffolding through production launch, with phases, dependencies, deliverables, tests, exit gates, release gates, and definition of done.

The implementation plan currently defines phases P0–P13:

```text
P0  Repository/tooling foundation
P1  Database + contracts foundation
P2  Identity/auth/session/authorization
P3  Vendor/store/KYC/membership
P4  Catalog/variants/media
P5  Inventory/wishlist/cart
P6  Checkout + multi-vendor orders
P7  Payments/commission/webhooks
P8  Logistics/shipments
P9  Returns/refunds/reviews
P10 Admin/analytics/promotions/tax/notifications
P11 Hardening/performance/security/NDPR
P12 Staging/UAT/recovery rehearsals
P13 Production launch
```

## 3. System Architecture

- [`architecture/system-architecture.md`](architecture/system-architecture.md) — system-wide runtime architecture, service boundaries, data flow, security boundary, multi-vendor order model, and dependency direction.
- [`architecture/background-jobs-and-events.md`](architecture/background-jobs-and-events.md) — PostgreSQL transactional outbox, BullMQ/Redis queues, event envelope/versioning, retries, dead letters, scheduled jobs, idempotency, worker concurrency, and Redis-loss reconstruction.
- [`architecture/notification-design-specification.md`](architecture/notification-design-specification.md) — email/SMS/in-app notification architecture, template/version rules, event-to-message mapping, dedupe, priority, retry, security, localization, and provider-selection gate.

### Architecture Decision Records

- [`architecture/adr/README.md`](architecture/adr/README.md) — ADR index and usage rules.
- [`architecture/adr/ADR-001-shared-api-contracts-runtime-validation-and-typed-client.md`](architecture/adr/ADR-001-shared-api-contracts-runtime-validation-and-typed-client.md) — TypeBox contracts, DTO inference, Fastify validation, OpenAPI, and typed API client.
- [`architecture/adr/ADR-002-modular-monolith-architecture-and-module-boundaries.md`](architecture/adr/ADR-002-modular-monolith-architecture-and-module-boundaries.md) — module ownership, communication, dependency rules, and extraction readiness.
- [`architecture/adr/ADR-003-turborepo-monorepo-architecture-and-package-boundaries.md`](architecture/adr/ADR-003-turborepo-monorepo-architecture-and-package-boundaries.md) — applications/packages, allowed dependency graph, Turborepo tasks, CI, and environment boundaries.
- [`architecture/adr/ADR-004-authentication-session-security-rbac-and-ownership.md`](architecture/adr/ADR-004-authentication-session-security-rbac-and-ownership.md) — browser session architecture, 15-minute access/30-day refresh baseline, RBAC, vendor ownership, MFA, and privileged operations.
- [`architecture/adr/ADR-005-money-currency-pricing-fees-and-rounding.md`](architecture/adr/ADR-005-money-currency-pricing-fees-and-rounding.md) — integer minor-unit money, NGN, pricing snapshots, commissions, fees, tax, allocation, and rounding.
- [`architecture/adr/ADR-006-multi-vendor-checkout-and-order-architecture.md`](architecture/adr/ADR-006-multi-vendor-checkout-and-order-architecture.md) — parent order + vendor orders, reservation, fulfillment, shipment, cancellation, and refund boundaries.
- [`architecture/adr/ADR-007-payment-gateway-abstraction-webhooks-idempotency-and-refunds.md`](architecture/adr/ADR-007-payment-gateway-abstraction-webhooks-idempotency-and-refunds.md) — Paystack/Flutterwave abstraction, verification, provider events, safe failover, refunds, and reconciliation.
- [`architecture/adr/ADR-008-api-versioning-and-compatibility.md`](architecture/adr/ADR-008-api-versioning-and-compatibility.md) — `/api/v1`, compatibility rules, breaking changes, and future-version policy.
- [`architecture/adr/ADR-009-product-media-upload-and-object-storage.md`](architecture/adr/ADR-009-product-media-upload-and-object-storage.md) — Cloudflare R2, presigned uploads, storage keys, ownership validation, media lifecycle, and CDN boundaries.
- [`architecture/adr/ADR-010-idempotency-concurrency-and-retry-safety.md`](architecture/adr/ADR-010-idempotency-concurrency-and-retry-safety.md) — idempotency keys, request fingerprints, retry safety, concurrency, and duplicate-effect prevention.

## 4. Engineering Standards

- [`engineering/api-contracts-dtos-validation-type-safety-standard.md`](engineering/api-contracts-dtos-validation-type-safety-standard.md) — DTO/schema naming, TypeBox authoring, Fastify type-provider usage, mapping, typed-client rules, errors, pagination, testing, and CI gates.
- [`engineering/backend-engineering-standard.md`](engineering/backend-engineering-standard.md) — backend layering, modules, use cases, repositories, transactions, validation, integrations, logging, and code review rules.
- [`engineering/frontend-engineering-standard.md`](engineering/frontend-engineering-standard.md) — Next.js feature organization, server/client boundaries, API-client usage, forms, accessibility, state, error/loading behavior, and performance.
- [`engineering/error-handling-standard.md`](engineering/error-handling-standard.md) — stable error envelope, error codes, mapping, safe messages, provider errors, and observability.
- [`engineering/testing-and-quality-standard.md`](engineering/testing-and-quality-standard.md) — test pyramid, critical workflow coverage, contract/integration/E2E testing, performance tests, security checks, and quality gates.

## 5. API

- [`api/system-api-design-specification.md`](api/system-api-design-specification.md) — endpoint/resource map for authentication, users, vendors, stores, catalog, inventory, cart, checkout, orders, payments, refunds, logistics, reviews, analytics, admin, media, and webhooks.

OpenAPI generated from executable Fastify route schemas remains the machine-readable API reference once implementation begins.

## 6. Data & Prisma

- [`data/database-and-domain-model-specification.md`](data/database-and-domain-model-specification.md) — logical domain model, entity ownership, relationships, invariants, indexes, snapshotting, transaction boundaries, audit/NDPR considerations, and migration order.
- [`data/prisma-schema-and-migration-specification.md`](data/prisma-schema-and-migration-specification.md) — implementation-level PostgreSQL/Prisma decisions: UUID IDs, timestamptz, bigint minor-unit money, exact normalized variant model, indexes/check constraints, migration rules, raw-SQL additions, seed policy, and migration sequence.
- [`data/reference-schema.prisma`](data/reference-schema.prisma) — committed reference Prisma schema covering identity, vendor/store/KYC, catalog/options/variants/media, inventory, wishlist/cart, orders, commissions/tax/promotions, payments/refunds/provider events, logistics, returns, reviews, idempotency, outbox, notifications, and audit.

`reference-schema.prisma` is an implementation baseline, not a claim that the current empty repository has already run `prisma validate`. Once the monorepo is scaffolded and Prisma is installed, validation and generated migration SQL are mandatory gates before the first schema merge.

## 7. Provider Integrations

- [`integrations/provider-specific-integration-specification.md`](integrations/provider-specific-integration-specification.md) — current provider-specific integration requirements for:
  - Paystack transaction initialize/verify, HMAC webhook verification, refunds, subaccounts/splits;
  - Flutterwave charge/authentication/version discipline, webhook signature verification, refunds, and split-payment boundary;
  - GIGL station/quote/shipment/tracking adapter behavior;
  - Cloudflare R2 S3-compatible presigned PUT uploads and lifecycle/security rules;
  - Google OAuth/OpenID Connect sign-in and account-linking requirements.

External APIs change. Official provider documentation and account capabilities must be revalidated during implementation and again before production release. Provider DTOs must never become CartNest domain models.

## 8. Security

- [`security/authentication-authorization-security-standard.md`](security/authentication-authorization-security-standard.md) — authentication/session controls, authorization, vendor isolation, rate limits, CSRF/CORS, password recovery, MFA, and audit requirements.
- [`security/security-threat-model.md`](security/security-threat-model.md) — assets, trust boundaries, threat analysis, multi-tenant abuse, session/auth attacks, XSS/CSRF/injection, payment attacks, inventory races, media/SSRF, provider/supply-chain threats, data classification, mitigations, residual risks, and verification matrix.

Security controls are release gates for affected workflows, not optional post-launch cleanup work.

## 9. Deployment & Operations

- [`operations/deployment-and-operations-standard.md`](operations/deployment-and-operations-standard.md) — environment model, Docker/VPS topology, Caddy/networking, GHCR images, secrets, configuration validation, GitHub Actions deployment pipeline, migrations, health/readiness, graceful shutdown, rollback, access controls, and operations cadence.
- [`operations/observability-standard.md`](operations/observability-standard.md) — structured Pino logs, redaction, OpenTelemetry, request/trace correlation, technical/business/payment/inventory/security metrics, SLO targets, dashboards, alert severity, retention, and release markers.
- [`operations/backup-and-disaster-recovery-plan.md`](operations/backup-and-disaster-recovery-plan.md) — PostgreSQL PITR/logical backups, RPO/RTO, off-site backup, Cloudflare R2 media protection, restore tests, Redis reconstruction, corruption/operator-error procedures, and disaster drills.
- [`operations/production-runbook.md`](operations/production-runbook.md) — concrete release, smoke-test, rollback, API/DB/Redis/worker, provider outage, duplicate-charge, webhook, media, GIGL, secret, inventory, maintenance, restore, and post-incident procedures.

## 10. Documentation Authority

When documents overlap, use this precedence unless a document explicitly supersedes another:

```text
most recent accepted ADR / approved product decision
        ↓
security/financial/integration-specific specification
        ↓
system/data/API design specification
        ↓
engineering standard
        ↓
implementation plan/runbook
```

If implementation intentionally differs from an accepted decision, update or supersede the governing document before merging the new behavior.

## 11. Documentation Status

The repository now contains the baseline documentation required to begin implementation and to guide the project through deployment and operations.

This does **not** mean every environment-specific value is already known. The following are intentionally resolved during implementation/operations without changing the architecture:

- production host/domain values;
- managed PostgreSQL vendor and connection details;
- Redis hosting choice;
- exact notification email/SMS provider;
- provider production credentials/account capabilities;
- final resource sizing after load tests;
- exact retention periods where legal/business review is required;
- final alert thresholds after real traffic is observed.

These values are configuration or operational selections, not reasons to redesign the core system.

## 12. Before Writing Production Feature Code

At minimum:

1. scaffold the Turborepo according to ADR-003 and the implementation plan;
2. install/configure Prisma and validate `reference-schema.prisma`;
3. review generated SQL and implement the documented raw PostgreSQL constraints/indexes;
4. establish TypeBox/OpenAPI/typed-client vertical slice;
5. establish Redis/BullMQ/outbox infrastructure;
6. configure CI quality gates;
7. implement features in the P0–P13 order rather than starting from isolated screens.

## 13. Before Production

Production remains blocked until the relevant documents have been exercised in staging, including:

- authentication and cross-vendor authorization tests;
- payment-provider sandbox/webhook/refund tests;
- inventory-concurrency tests;
- migration rehearsal;
- backup restore drill;
- worker/Redis-loss recovery rehearsal;
- deployment and rollback rehearsal;
- observability dashboards/alerts;
- security-threat verification;
- load/UAT checks;
- production runbook rehearsal.
