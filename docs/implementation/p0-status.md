# P0 — Repository and Tooling Foundation Status

**Phase:** P0  
**Status:** Implementation complete; automated exit-gate verification blocked by GitHub Actions startup failure  
**Updated:** 5 September 2026

## Scope

This status document tracks P0 against `docs/implementation/implementation-plan.md`.

## Implemented Deliverables

- [x] pnpm workspace initialized.
- [x] Turborepo task graph added.
- [x] `apps/web` scaffolded with Next.js and a health route.
- [x] `apps/api` scaffolded with Fastify, `/health`, `/ready`, tests, and graceful shutdown.
- [x] `apps/worker` scaffolded with health primitive, tests, heartbeat, and signal handling.
- [x] `packages/contracts` created.
- [x] `packages/api-client` created.
- [x] `packages/database` created as a P0 boundary; Prisma is intentionally introduced in P1.
- [x] `packages/config` created with runtime environment parsing/validation helpers.
- [x] `packages/ui` created.
- [x] `packages/testing` created.
- [x] shared `packages/eslint-config` created.
- [x] shared `packages/typescript-config` created.
- [x] strict TypeScript baseline enabled, including unchecked-index and exact-optional checks.
- [x] root `dev`, `build`, `lint`, `typecheck`, and `test` scripts created.
- [x] Prettier configuration added.
- [x] dependency-boundary checker added.
- [x] documentation-link checker added.
- [x] `.gitignore` blocks local secrets and generated outputs.
- [x] root and application `.env.example` files added without production secrets.
- [x] local PostgreSQL and Redis Docker Compose baseline added with health checks and localhost-only port publishing.
- [x] GitHub Actions CI definition added with the required P0 checks: install, lint/boundaries, typecheck, test, build, and documentation-link verification.
- [x] Node.js and pnpm versions pinned.

## Pinned P0 Toolchain

```text
Node.js      24.20.0 LTS
pnpm         11.25.0
Turborepo    2.10.12
TypeScript   6.0.3
Next.js      16.3.3
React        19.2.8
Fastify      5.12.1
Vitest       4.1.10
ESLint       10.9.1
Prettier     3.9.6
```

## Architecture Boundary Baseline

The P0 boundary checker enforces the following initial constraints:

```text
apps/web       -X-> @repo/database
apps/web       -X-> apps/api internals
contracts      -X-> @repo/database
api-client     -X-> @repo/database
ui             -X-> @repo/database
packages/*     -X-> application entry points where prohibited
```

This is an initial executable safeguard. More granular module-boundary tests are introduced as the modular monolith grows.

## Local Infrastructure

Development infrastructure is defined in `compose.dev.yml`:

```text
PostgreSQL 17 -> 127.0.0.1:5432
Redis 7.4     -> 127.0.0.1:6379
```

Start/stop with:

```bash
pnpm infra:up
pnpm infra:down
```

No production credentials are stored in the repository.

## Intended Local Verification

A fresh clone should run:

```bash
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install
pnpm infra:up
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docs:check
pnpm dev
```

Expected service checks:

```text
GET http://localhost:3000/api/health
GET http://localhost:4000/health
GET http://localhost:4000/ready
```

`/ready` is intentionally a P0 skeleton. P1 replaces configuration-presence reporting with real PostgreSQL/Redis readiness checks after the database and queue clients exist.

## GitHub Actions Verification Blocker

The repository workflow file is present and was simplified to the required P0 gates. However, GitHub currently creates a synthetic workflow run with:

```text
name:       ""
path:       BuildFailed
conclusion: startup_failure
jobs:       0
```

This occurs before any runner/job/step is created, so it is not a failing lint, typecheck, test, install, or build command. Multiple consecutive pushes produce the same zero-job startup failure.

Because no job starts, P0 cannot truthfully be marked **exit-gate verified** from GitHub Actions yet.

## Exit Gate Status

| Exit criterion | Status |
| --- | --- |
| Workspace/app/package scaffold exists | PASS |
| Web/API/worker startup skeletons exist | PASS |
| Strict TypeScript baseline exists | PASS |
| Dependency boundaries are executable | PASS |
| Secret files are ignored | PASS |
| Environment examples exist | PASS |
| PostgreSQL/Redis development baseline exists | PASS |
| Required CI workflow is defined | PASS |
| CI actually executes install/lint/typecheck/test/build | BLOCKED — GitHub Actions startup failure before jobs |
| Fresh-clone install/build proven in CI | BLOCKED by same external CI startup issue |

## P1 Gate

Do not treat the GitHub Actions infrastructure problem as permission to skip validation. Before P1 database migrations are merged, one of the following must occur:

1. GitHub Actions begins creating real jobs and the P0 workflow passes; or
2. the same required commands are executed successfully in a trusted local/alternate CI environment and the evidence is recorded, followed by GitHub Actions re-verification once available.

P1 may be prepared, but the first database migration should not be declared complete until the P0 verification evidence exists.
