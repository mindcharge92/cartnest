# CartNest

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses.

The repository is now entering **P0 — Repository and Tooling Foundation**. Architecture, product, security, API, data, operational, and implementation documentation already exists under `docs/`; the application monorepo scaffold is being introduced according to that approved baseline.

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

## Repository Documentation

Start with [`docs/README.md`](docs/README.md).

The documentation covers product scope, approved decisions, architecture, ADRs, API contracts, database/Prisma design, auth/RBAC, money, multi-vendor orders, payments, media, idempotency, implementation phases, provider integrations, observability, deployment, backup/DR, security threat modeling, and the production runbook.

## P0 Local Setup

After the P0 scaffold is complete, a fresh clone should use:

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
pnpm format:check
pnpm docs:check
```

Production feature implementation must follow [`docs/implementation/implementation-plan.md`](docs/implementation/implementation-plan.md) and the governing ADRs rather than framework defaults.
