# P1 — Database and Contract Foundation Status

**Phase:** P1  
**Status:** Foundation implementation complete; executable migration/codegen/quality evidence still pending  
**Updated:** 5 September 2026

## Scope

P1 establishes the persistence and API-contract foundation required before feature modules multiply. It follows `docs/implementation/implementation-plan.md`, ADR-001, the Prisma specification, and the approved product decisions.

P1 does **not** claim that the initial database migration has already been generated, reviewed, or applied. That remains an execution gate because GitHub Actions is still failing before any job starts and this session has not run a trusted local pnpm/Prisma toolchain against PostgreSQL.

## Implemented Deliverables

### Database foundation

- [x] Prisma 7 database package established in `packages/database`.
- [x] Canonical implementation schema committed at `packages/database/prisma/schema.prisma`.
- [x] Relation gaps from the earlier documentation-only reference model were corrected in the implementation schema.
- [x] PostgreSQL driver-adapter client factory added using `@prisma/adapter-pg`.
- [x] `prisma.config.ts` added for schema, migration, datasource, and seed configuration.
- [x] Development/reference seed added without silently inventing commission, VAT, or financial defaults.
- [x] Database transaction helper added.
- [x] Real PostgreSQL readiness probe added using `SELECT 1`.
- [x] Migration sequence documented under `packages/database/prisma/migrations/README.md`.
- [x] Raw PostgreSQL constraints/indexes source committed under `packages/database/prisma/sql/required-constraints.sql` for constraints Prisma cannot fully express.
- [x] `AuditLog`, `OutboxEvent`, and `IdempotencyRecord` persistence models are present in the Prisma schema.

### Shared API contracts

- [x] `@repo/contracts` is a runtime schema package rather than a marker package.
- [x] Contract runtime standardized on TypeBox 1.x.
- [x] Common UUID, timestamp, currency, lossless Money, pagination, and API-error contracts added.
- [x] Health, readiness, and versioned system-info contracts added.
- [x] DTO types are inferred from schemas rather than handwritten in parallel.
- [x] Money crosses JSON as a decimal minor-unit string so bigint-backed values remain lossless.

### Fastify and runtime validation

- [x] Fastify TypeBox provider upgraded to the TypeBox 1.x-compatible provider line.
- [x] TypeBox validator compiler configured for executable runtime request/response validation.
- [x] `/health` uses a schema-backed response.
- [x] `/ready` uses schema-backed 200/503 responses.
- [x] `/ready` now requires **both PostgreSQL and Redis** readiness rather than treating Redis configuration as sufficient.
- [x] API server creates a real Redis client and probes it with `PING`.
- [x] API server performs controlled PostgreSQL/Redis shutdown.
- [x] `/api/v1/system/info` establishes the first versioned typed endpoint.
- [x] Readiness dependencies are injectable in tests and code generation so those tasks do not require live infrastructure.

### OpenAPI and typed client

- [x] OpenAPI generation configured with `@fastify/swagger`.
- [x] Swagger UI configured for non-production environments.
- [x] Deterministic OpenAPI generation script added; object keys are sorted before the JSON artifact is written.
- [x] Bootstrap `openapi/cartnest.openapi.json` snapshot committed for the initial P1 surface.
- [x] `@repo/api-client` uses `openapi-fetch`.
- [x] `openapi-typescript` generation flow added.
- [x] Bootstrap generated client schema includes `/health`, `/ready`, and `/api/v1/system/info`.
- [x] Root `pnpm api:generate` performs OpenAPI generation before client generation.
- [x] Generated OpenAPI/client outputs are ignored by lint rules as generated artifacts while remaining checked for reproducibility once execution works.

### Quality-gate wiring

- [x] Root Prisma format/validate/generate/migrate scripts added.
- [x] CI definition expanded to require Prisma validation and API generation before typecheck/test/build.
- [x] API tests cover liveness, dependency-aware readiness, failure readiness, and the versioned system endpoint.
- [x] Existing dependency-boundary checks still prevent the web application from depending on `@repo/database`.

## Contract Flow Established

```text
TypeBox schema in @repo/contracts
        ↓
Fastify TypeBox validator/type provider
        ↓
Runtime request/response validation
        ↓
OpenAPI generated from executable routes
        ↓
openapi-typescript
        ↓
@repo/api-client (openapi-fetch)
        ↓
Next.js / future mobile or third-party consumers
```

The checked-in OpenAPI and generated-client files are **bootstrap snapshots** until `pnpm api:generate` has been executed successfully from the committed source. After executable code generation is proven, generated output is authoritative and must not be edited manually.

## Database Foundation

The implementation Prisma schema covers the approved logical model for:

```text
identity / sessions / MFA
vendors / memberships / KYC
stores
categories / products / normalized options / variants / media
inventory / reservations / adjustments
wishlist / cart
parent orders / vendor orders / order items
commission / tax / promotions
payment intents / attempts / allocations / provider events / refunds
shipments / tracking
returns
product + store reviews
notifications
audit
transactional outbox
idempotency
```

Financial values remain integer/bigint minor units in persistence and are mapped to lossless transport DTOs instead of exposing Prisma BigInt values directly.

## Required PostgreSQL Controls

The migration review must incorporate the committed raw SQL controls, including:

- media owner XOR constraint;
- non-negative inventory and `reserved <= onHand`;
- one active cart per user partial unique index;
- commission/tax basis-point ranges;
- promotion validity/range constraints;
- positive quantity checks;
- review rating range checks;
- wishlist uniqueness where no variant is selected.

These controls are source material for reviewed migrations; they are not a substitute for migrations.

## Migration and Execution Gate

Before P1 is considered fully verified, the following must execute successfully in a trusted environment with PostgreSQL and Redis available:

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install
pnpm infra:up
pnpm db:format
pnpm db:validate
pnpm db:generate
pnpm db:migrate:dev
pnpm api:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
```

After `db:migrate:dev` generates the initial SQL:

1. review the SQL against `packages/database/prisma/sql/required-constraints.sql`;
2. add the required PostgreSQL-native checks/indexes to the reviewed migration where necessary;
3. apply the migration to a clean development database;
4. repeat from an empty database to prove reproducibility;
5. record migration evidence before calling the migration production-quality.

`prisma db push` must not replace reviewed shared migrations.

## GitHub Actions Verification Blocker

GitHub Actions has repeatedly failed during workflow startup before creating a runner job. The observed failure pattern is:

```text
path:       BuildFailed
conclusion: startup_failure
jobs:       0
```

Because zero jobs are created, there is currently no GitHub Actions evidence for dependency installation, Prisma validation, OpenAPI/client regeneration, lint, typecheck, tests, or build. This remains an infrastructure-level verification blocker rather than evidence that one of those commands failed.

## Exit Gate Status

| P1 criterion | Status |
| --- | --- |
| Prisma implementation schema/package exists | PASS |
| Database client/transaction/readiness foundation exists | PASS |
| Audit/outbox/idempotency persistence models exist | PASS |
| Raw PostgreSQL constraint plan exists | PASS |
| Shared TypeBox 1.x contracts exist | PASS |
| Fastify TypeBox runtime integration exists | PASS |
| PostgreSQL + Redis readiness implementation exists | PASS |
| Versioned typed endpoint exists | PASS |
| OpenAPI generation flow exists | PASS |
| Typed API client flow exists | PASS |
| Bootstrap OpenAPI/client artifacts exist | PASS |
| API contract/readiness tests are committed | PASS |
| Prisma schema validated by executable toolchain | PENDING EXECUTION |
| Initial migration generated/applied/reviewed | PENDING EXECUTION |
| OpenAPI/client regeneration proven deterministic | PENDING EXECUTION |
| Full lint/typecheck/test/build evidence | PENDING EXECUTION |

## P2 Readiness

P2 identity/authentication work can now be implemented on top of this foundation. It must use the existing `User`, `AuthIdentity`, `AuthSession`, and `MfaFactor` models and the shared contract system rather than redefining authentication persistence or DTO conventions ad hoc.

Security-sensitive P2 work must still respect the unresolved P0/P1 execution evidence: implementation can proceed, but release-readiness cannot be claimed until the toolchain and migrations have been exercised successfully.
