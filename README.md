# CartNest

CartNest is a multi-vendor e-commerce marketplace for Nigerian businesses.

**Current implementation track:** Frontend & integration pass. Backend/domain source baselines for P0–P11 are implemented, while P12 staging/rehearsal tooling is prepared but not yet exit-gate verified. Frontend source baselines are now implemented through **FP4**.

The web pass currently includes the responsive marketplace shell, secure typed browser transport, authentication/account security, vendor/store/KYC/staff workspaces, the public catalog, normalized product/variant management, and Cloudflare R2 product-media integration.

See:

- [`docs/implementation/frontend-integration-plan.md`](docs/implementation/frontend-integration-plan.md)
- [`docs/implementation/frontend-p0-p2-status.md`](docs/implementation/frontend-p0-p2-status.md)
- [`docs/implementation/frontend-p3-status.md`](docs/implementation/frontend-p3-status.md)
- [`docs/implementation/frontend-p4-status.md`](docs/implementation/frontend-p4-status.md)

The next frontend phase is **FP5 — inventory, wishlist, and multi-store cart integration**.

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

Backend/domain records exist for P0–P11, with P12 rehearsal tooling prepared. The frontend pass proceeds as:

```text
FP0  Web foundation / design system / app shell             ✅ source baseline
FP1  Typed API integration / shared states                  ✅ source baseline
FP2  Identity / sessions / verification / MFA               ✅ source baseline
FP3  Vendor onboarding / stores / KYC / staff               ✅ source baseline
FP4  Marketplace catalog / products / media                 ✅ source baseline
FP5  Inventory / wishlist / cart                            NEXT
FP6  Checkout / orders
FP7  Payments
FP8  Logistics / tracking
FP9  Returns / refunds / reviews
FP10 Admin / analytics / promotions / notifications
FP11 Privacy / accessibility / security / performance
FP12 End-to-end integration / UAT
```

Source-baseline status does not mean CI/runtime validation has passed. GitHub Actions is still failing before any job is scheduled, so install/lint/typecheck/test/build and browser/staging evidence remain pending.

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
```

Production feature implementation must follow [`docs/implementation/implementation-plan.md`](docs/implementation/implementation-plan.md), the frontend engineering standard and the governing ADRs rather than framework defaults.
