# CartNest

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses.

**Current backend phase:** P11 — Hardening, Performance, Security, and NDPR. Backend/domain source baselines for P0–P11 are now implemented. Formal execution evidence is still blocked because GitHub Actions is returning a zero-job `BuildFailed/startup_failure` before the CI workflow starts. Frontend/UI and generated-client integration for P3–P11 are intentionally deferred until the backend phase sequence is complete, after which the project will circle back through the same phases for frontend implementation and integration.

P11 adds the hardened API composition, restrictive API security headers, generic/redacted unexpected-error handling, secret/dependency CI gates, privacy-data export, administrator-reviewed account anonymisation, NDPR-oriented retention rules, read-path index review, a configurable performance harness, and guarded PostgreSQL backup/restore automation.

GIGL quoting/tracking have provider-adapter source baselines, while live GIGL shipment booking remains deliberately gated until CartNest's contracted preshipment request/response is verified in the provider sandbox rather than guessed from generic public documentation.

See [`docs/implementation/p11-status.md`](docs/implementation/p11-status.md) for the current phase record and [`docs/security/data-retention-and-erasure-standard.md`](docs/security/data-retention-and-erasure-standard.md) for the privacy lifecycle baseline.

## Approved Stack

- Next.js + TypeScript
- Fastify + TypeScript
- Turborepo + pnpm
- PostgreSQL + Prisma
- Redis + BullMQ worker architecture
- Modular monolith
- TypeBox shared contracts
- OpenAPI + typed API client
- Paystack + Flutterwave
- GIG Logistics + manual/self-delivery
- Cloudflare R2
- Docker + GitHub Actions

## Toolchain Baseline

- Node.js `24.20.0` LTS
- pnpm `11.25.0`
- Turborepo `2.10.12`
- TypeScript `6.0.3`

## Monorepo Baseline

```text
apps/
  web/
  api/
  worker/

packages/
  contracts/
  api-client/
  database/
  config/
  ui/
  testing/
  eslint-config/
  typescript-config/
```

## Repository Documentation

Start with [`docs/README.md`](docs/README.md).

The documentation covers product scope, approved decisions, architecture, ADRs, API contracts, database/Prisma design, auth/RBAC, money, multi-vendor orders, payments, logistics, returns/refunds/reviews, media, idempotency, implementation phases, provider integrations, observability, deployment, backup/DR, security threat modeling, privacy/erasure, and the production runbook.

Implementation records currently exist for:

```text
P0  Repository/tooling foundation
P1  Database + contracts foundation
P2  Identity/auth/session/authorization
P3  Vendor/store/KYC/membership
P4  Catalog/variants/media
P5  Inventory/wishlist/cart
P6  Checkout/reservations/multi-vendor orders
P7  Payments/commission/webhooks/reconciliation
P8  Logistics/shipping quotes/shipments/tracking
P9  Returns/refunds/reviews
P10 Admin/analytics/promotions/tax/notifications
P11 Hardening/performance/security/NDPR
```

## Local Setup

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install
pnpm infra:up
pnpm build
pnpm dev
```

Local services:

- Web: `http://localhost:3000`
- Web health: `http://localhost:3000/api/health`
- API health: `http://localhost:4000/health`
- API readiness: `http://localhost:4000/ready`
- PostgreSQL: `127.0.0.1:5432`
- Redis: `127.0.0.1:6379`

## Quality and Hardening Gates

```bash
pnpm security:scan
pnpm security:audit
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
```

Operational P11 commands also include:

```bash
pnpm perf:benchmark
pnpm db:backup
pnpm db:restore
```

`pnpm format` and `pnpm format:check` are also available for repository formatting.

Production feature implementation must follow [`docs/implementation/implementation-plan.md`](docs/implementation/implementation-plan.md) and the governing ADRs rather than framework defaults.
