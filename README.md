# CartNest

CartNest is a multi-vendor e-commerce marketplace for Nigerian businesses.

**Current implementation track:** Backend/domain and frontend integrations through P11/FP11 are implemented and locally verified. P12 staging/rehearsal tooling, executable migrations, recovery verification, and a free Render preview blueprint are prepared. The P12 exit gate remains open until a real staging deployment, provider sandboxes, and UAT evidence are recorded.

The web application includes the responsive marketplace shell, secure typed browser transport, authentication/account security, vendor/store/KYC/staff workspaces, catalog/media integration, wishlist and multi-store cart flows, inventory, delivery-aware checkout, idempotent parent-order creation, payment reconciliation, logistics/tracking, returns/reviews, admin/operations, and privacy/security workflows.

See:

- [`docs/implementation/frontend-integration-plan.md`](docs/implementation/frontend-integration-plan.md)
- [`docs/implementation/frontend-p0-p2-status.md`](docs/implementation/frontend-p0-p2-status.md)
- [`docs/implementation/frontend-p3-status.md`](docs/implementation/frontend-p3-status.md)
- [`docs/implementation/frontend-p4-status.md`](docs/implementation/frontend-p4-status.md)
- [`docs/implementation/frontend-p5-status.md`](docs/implementation/frontend-p5-status.md)
- [`docs/implementation/frontend-p6-status.md`](docs/implementation/frontend-p6-status.md)
- [`docs/implementation/frontend-p7-status.md`](docs/implementation/frontend-p7-status.md)
- [`docs/implementation/frontend-p8-status.md`](docs/implementation/frontend-p8-status.md)
- [`docs/implementation/frontend-p10-status.md`](docs/implementation/frontend-p10-status.md)
- [`docs/implementation/frontend-p11-status.md`](docs/implementation/frontend-p11-status.md)
- [`docs/implementation/p12-runtime-status.md`](docs/implementation/p12-runtime-status.md)

The remaining delivery phase is **P12/FP12: staging, UAT, provider sandbox, and release evidence**.

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

## Implementation Tracks

```text
P0-P11 / FP0-FP11  Web, typed API, commerce, operations, and hardening  locally verified
P12 / FP12         Staging deployment, UAT, provider, and release evidence  open
P13                Production launch  blocked by P12 evidence
```

On 13 September 2026, local verification passed lint, typecheck, documentation and secret checks, a clean-database noncached test suite, browser checks, production build, migration deployment, and an isolated backup/restore rehearsal. These checks do not certify GitHub Actions, external providers, staging, or production.

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

Operational commands include:

```bash
pnpm perf:benchmark
pnpm db:backup
pnpm db:restore
pnpm p12:preflight
pnpm p12:smoke
pnpm p12:gate
```

Production feature implementation must follow [`docs/implementation/implementation-plan.md`](docs/implementation/implementation-plan.md), the frontend engineering standard, and the governing ADRs.
