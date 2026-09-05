# P1 — Database and Contract Foundation Status

**Phase:** P1  
**Status:** Foundation implemented; migration/CI execution evidence still blocked by GitHub Actions startup failure  
**Updated:** 5 September 2026

## Scope

P1 establishes the persistence and API-contract foundation required before feature modules multiply. It follows `docs/implementation/implementation-plan.md`, ADR-001, the Prisma specification, and the approved product decisions.

## Implemented Deliverables

- [x] Prisma 7 database package established in `packages/database`.
- [x] Canonical Prisma schema copied into `packages/database/prisma/schema.prisma` from the documented reference design.
- [x] PostgreSQL adapter/client factory added.
- [x] Prisma configuration and development seed added.
- [x] Migration sequence documented under `packages/database/prisma/migrations/README.md`.
- [x] Raw PostgreSQL constraints/indexes source added for constraints Prisma cannot express directly.
- [x] Database transaction helper added.
- [x] Database readiness probe added.
- [x] `AuditLog`, `OutboxEvent`, and `IdempotencyRecord` persistence models are present in the Prisma schema.
- [x] Transaction-scoped primitives added for writing audit records, enqueueing outbox events, and beginning idempotency records.
- [x] `@repo/contracts` converted from a marker package into runtime TypeBox contracts.
- [x] Common UUID, timestamp, currency, Money, pagination, and API-error contracts added.
- [x] Health/readiness response contracts added.
- [x] DTO types are inferred from schemas instead of independently duplicated.
- [x] Fastify TypeBox type provider integrated into `apps/api`.
- [x] Fastify health/readiness routes use executable response schemas.
- [x] `/ready` now performs a real PostgreSQL readiness query when a database is configured.
- [x] OpenAPI generation configured with `@fastify/swagger`.
- [x] Swagger UI configured for non-production environments.
- [x] Deterministic OpenAPI generation script added.
- [x] `@repo/api-client` converted into an `openapi-fetch` typed client package.
- [x] `openapi-typescript` generation flow added.
- [x] Root scripts added for Prisma validation/generation and OpenAPI/client generation.
- [x] CI definition expanded to require Prisma validation and API contract generation before normal quality gates.
- [x] Contract tests added for lossless minor-unit Money and pagination bounds.
- [x] API tests added for schema-backed health/readiness and OpenAPI publication.

## API Contract Flow Established

```text
TypeBox schema in @repo/contracts
        ↓
Fastify TypeBox type provider
        ↓
Runtime request/response validation
        ↓
OpenAPI generated from executable routes
        ↓
openapi-typescript
        ↓
@repo/api-client
        ↓
Next.js consumers
```

The bootstrap `packages/api-client/src/generated/schema.ts` exists so the package has an initial typed surface in the repository. Once `pnpm api:generate` executes successfully, generated output becomes authoritative and the bootstrap snapshot must no longer be edited manually.

## Database Foundation

The Prisma schema includes the approved logical model for identity, vendors/stores, normalized product options and variants, inventory, wishlist/cart, parent/vendor orders, commissions, tax/promotions, payment intents/attempts/allocations/refunds/provider events, logistics, returns, reviews, notifications, audit, transactional outbox, and idempotency.

Financial values are represented as integer/bigint minor units and are mapped to lossless JSON transport contracts rather than exposed as Prisma BigInt values.

## Migration Gate

The repository intentionally does **not** claim that the first production-quality migration has been validated or applied yet.

Before the first migration is considered complete, the following commands must execute successfully in a trusted environment with PostgreSQL available:

```bash
pnpm install
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm infra:up
pnpm db:migrate:dev
pnpm api:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Generated migration SQL must then be reviewed against `packages/database/prisma/sql/required-constraints.sql` and `docs/data/prisma-schema-and-migration-specification.md` before merge/release.

`prisma db push` must not replace reviewed shared migrations.

## GitHub Actions Verification Blocker

GitHub Actions is still failing at workflow startup before creating a job. The latest P1 workflow attempt reports:

```text
path:       BuildFailed
conclusion: startup_failure
jobs:       0
```

Therefore the repository currently has no CI evidence that dependency installation, Prisma validation, OpenAPI generation, lint, typecheck, tests, or build have actually executed. This is the same infrastructure-level blocker recorded in P0, not a reported failure from one of those commands.

## Exit Gate Status

| P1 criterion | Status |
| --- | --- |
| Prisma schema/package exists | PASS |
| Database client and transaction helpers exist | PASS |
| Audit/outbox/idempotency persistence foundation exists | PASS |
| Shared TypeBox contracts exist | PASS |
| Fastify TypeBox integration exists | PASS |
| OpenAPI generation flow exists | PASS |
| Typed API client flow exists | PASS |
| Database readiness probe exists | PASS |
| Contract/API tests are committed | PASS |
| Prisma schema validated by executable toolchain | BLOCKED — CI does not start |
| Initial migration generated/applied/reviewed | PENDING trusted execution |
| OpenAPI/client regeneration proven reproducible | BLOCKED — CI does not start |
| Full lint/typecheck/test/build evidence | BLOCKED — CI does not start |

## P2 Readiness

P2 identity/authentication work may be prepared on top of these contracts and persistence models, but authentication migrations and security-sensitive behavior must not be declared release-ready until the P0/P1 execution gates have run successfully.

P2 should build on the existing `User`, `AuthIdentity`, `AuthSession`, and `MfaFactor` models rather than redesigning authentication persistence ad hoc.
