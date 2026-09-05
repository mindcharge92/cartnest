# CartNest

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses.

**Current backend phase:** P6 — Checkout, Inventory Reservation, and Multi-Vendor Orders. Backend/domain source baselines for P0–P6 are now implemented. Formal execution evidence is still blocked because GitHub Actions is returning a zero-job `BuildFailed/startup_failure` before the CI workflow starts. Frontend/UI and generated-client integration for P3–P6 are intentionally deferred until the backend phase sequence is complete, after which the project will circle back through the same phases for frontend implementation.

See [`docs/implementation/p6-status.md`](docs/implementation/p6-status.md) for the current phase record.

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

The documentation covers product scope, approved decisions, architecture, ADRs, API contracts, database/Prisma design, auth/RBAC, money, multi-vendor orders, payments, media, idempotency, implementation phases, provider integrations, observability, deployment, backup/DR, security threat modeling, and the production runbook.

Implementation records currently exist for:

```text
P0 Repository/tooling foundation
P1 Database + contracts foundation
P2 Identity/auth/session/authorization
P3 Vendor/store/KYC/membership
P4 Catalog/variants/media
P5 Inventory/wishlist/cart
P6 Checkout/reservations/multi-vendor orders
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

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
```

`pnpm format` and `pnpm format:check` are also available for repository formatting.

Production feature implementation must follow [`docs/implementation/implementation-plan.md`](docs/implementation/implementation-plan.md) and the governing ADRs rather than framework defaults.
