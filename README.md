# CartNest

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses.

**Current phase:** P0 — Repository and Tooling Foundation. The P0 scaffold is implemented; automated exit-gate verification is currently blocked because GitHub Actions is returning a zero-job `BuildFailed/startup_failure` before the CI workflow starts. See [`docs/implementation/p0-status.md`](docs/implementation/p0-status.md).

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

## P0 Local Setup

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
