# P12 — Staging, UAT, and Operational Rehearsal Status

**Phase:** P12  
**Status:** Staging/rehearsal source harness implemented; exit gate NOT verified because no executable migration/staging runtime evidence exists yet  
**Updated:** 5 September 2026

## 1. Purpose

P12 is not another business-feature phase. It exists to turn the P0–P11 source baselines and operations documents into real execution evidence in a production-like staging environment.

The governing exit gate is:

> Production runbook steps have been executed in staging rather than only written down.

For that reason, this document deliberately separates **prepared/implemented rehearsal tooling** from **actual executed evidence**.

## 2. P12 Source Work Added

The repository now contains:

```text
deploy/
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── Dockerfile.worker
└── staging/
    ├── Caddyfile
    ├── compose.yaml
    ├── compose.release.yaml
    └── staging.env.example

scripts/staging/
├── preflight.mjs
└── smoke.mjs

.github/workflows/
└── staging.yml

docs/operations/
└── staging-uat-and-rehearsal-plan.md

docs/implementation/
├── p12-status.md
└── p12-evidence-report-template.md
```

The root package also exposes:

```bash
pnpm p12:preflight
pnpm p12:smoke
pnpm staging:config
pnpm staging:build
pnpm staging:up
pnpm staging:down
pnpm staging:logs
```

## 3. Production-Like Container Baseline

P12 adds immutable-image definitions for:

```text
web
api
worker
```

and a production-like staging topology:

```text
Internet
   |
 Caddy
   |----------------|
   v                v
Next.js           Fastify
                     |
             private data plane
              /             \
        PostgreSQL         Redis
                              |
                            Worker
```

The self-contained `deploy/staging/compose.yaml` supports a rehearsal stack with local staging PostgreSQL/Redis.

`deploy/staging/compose.release.yaml` is intended for a staging host using externally managed/injected database and Redis URLs plus immutable GHCR image tags.

Only Caddy exposes public ports. PostgreSQL and Redis are not published to the host/network edge.

## 4. Staging Release Workflow

`.github/workflows/staging.yml` defines the intended P12 release path:

```text
quality/security gates
       ↓
build SHA-tagged web/api/worker images
       ↓
push to GHCR
       ↓
upload release compose/Caddy config
       ↓
run prisma migrate deploy
       ↓
start/update services
       ↓
run staging smoke
       ↓
upload evidence artifact
```

The deploy job is scoped to the GitHub `staging` environment and expects:

```text
STAGING_HOST
STAGING_USER
STAGING_SSH_PRIVATE_KEY
STAGING_SSH_KNOWN_HOSTS
STAGING_WEB_URL
STAGING_API_URL
```

The staging host must keep the real environment file outside the repository at:

```text
/opt/cartnest/env/staging.env
```

and must already be authenticated to GHCR with read access to the private images.

## 5. Staging Preflight Gate

`pnpm p12:preflight` checks:

- required Docker/staging files;
- Docker availability;
- Node and pnpm availability;
- `pg_dump` and `pg_restore` availability;
- Compose parsing;
- executable Prisma migration history.

The migration check is intentionally strict. A repository containing only a migration README is not considered deployable migration history.

## 6. Smoke Evidence

`pnpm p12:smoke` requires:

```text
STAGING_WEB_URL
STAGING_API_URL
```

and checks:

```text
web /api/health
API /health
API /ready
/api/v1/system/info
/api/v1/categories
/api/v1/catalog/products
```

It also records the API security-header baseline and writes a sanitized JSON artifact under:

```text
artifacts/p12/
```

The smoke runner never intentionally records credentials, cookies, session tokens, or provider secrets.

## 7. Required P12 Exercise Contract

The detailed executable/manual procedure now lives at:

```text
docs/operations/staging-uat-and-rehearsal-plan.md
```

It covers all implementation-plan requirements:

- production-like CI deployment;
- clean/upgrade migration;
- rollback;
- database restore;
- expired reservation cleanup;
- Paystack test payment/webhook/refund;
- Flutterwave test payment/webhook/refund;
- GIGL sandbox path;
- R2 upload/delete lifecycle;
- admin MFA recovery;
- provider outage simulations;
- worker failure/dead-letter;
- load testing;
- buyer/vendor/admin UAT.

A reusable evidence report is available at:

```text
docs/implementation/p12-evidence-report-template.md
```

## 8. Current Blocking Issue — No Executable Prisma Migration

At the time of this P12 source pass, the Prisma migrations directory contains only its explanatory README and no versioned `migration.sql` directory.

Therefore CartNest cannot currently prove:

- clean migration from an empty database;
- `prisma migrate deploy` correctness;
- migration upgrade behavior;
- migration rollback compatibility;
- restored-database migration state.

This was already deferred in P1 because CI/local execution evidence was unavailable. P12 makes it an explicit exit-gate blocker rather than continuing to treat the Prisma schema alone as a deployable database history.

The first migration must be generated in a trusted executable environment from the complete multi-file Prisma schema, reviewed, augmented with the required PostgreSQL constraints/indexes, applied to a disposable PostgreSQL database, and then committed.

P12 must not hand-write a large baseline migration merely to make this checkbox appear green.

## 9. Current Blocking Issue — GitHub Actions Startup Failure

The repository's existing Actions problem still prevents CI execution. GitHub has repeatedly created runs with:

```text
path: BuildFailed
conclusion: startup_failure
jobs: 0
```

Because zero jobs are created, those runs provide no evidence for:

- dependency installation;
- secret/dependency scans;
- lint;
- Prisma validation;
- OpenAPI/client generation;
- typecheck;
- tests;
- build;
- Docker image build;
- staging deployment.

The new staging workflow is therefore **defined but not executed**.

## 10. Current Blocking Issue — No Confirmed Staging Host/Environment

No staging VPS hostname, SSH deployment identity, GitHub `staging` environment configuration, or staging provider credentials are present in repository source—and they should not be committed there.

Until an actual target is provisioned/configured, P12 cannot honestly claim a production-like deployment.

Required off-repository prerequisites include:

- Linux/Docker staging host or equivalent approved staging runtime;
- staging DNS/HTTPS hostnames;
- staging PostgreSQL;
- staging Redis;
- staging-only application secrets;
- staging R2 bucket;
- Paystack test credentials;
- Flutterwave test credentials;
- GIGL sandbox/contract credentials where available;
- Google staging OAuth credentials if OAuth is included in UAT.

## 11. Current Blocking Issue — Worker Dead-Letter Runtime

`apps/worker` remains a process/heartbeat foundation rather than a completed BullMQ/outbox consumer runtime.

The background architecture is fully documented, but a P12 dead-letter/retry rehearsal requires an actual durable queue consumer and retry/dead-letter path.

Therefore the worker-failure/dead-letter exercise is currently blocked. P12 must not claim Redis-loss or dead-letter recovery merely from the existence of the worker process.

This gap should be closed before the P12 exit gate is signed.

## 12. Provider Exercise State

### Paystack

Source adapter/webhook/refund behavior exists from P7/P9. Test-mode lifecycle evidence remains pending actual credentials and staging deployment.

### Flutterwave

Source adapter/webhook/refund behavior exists from P7/P9. Test-mode lifecycle evidence remains pending actual credentials and confirmation of the API generation enabled for the account.

### GIGL

Quote/tracking source baseline exists from P8. Live/sandbox booking remains intentionally gated until CartNest's contracted preshipment payload is verified.

### Cloudflare R2

Presigned upload source baseline exists from P4. Staging upload/HEAD/delete lifecycle evidence requires staging R2 credentials/bucket.

## 13. Backup/Restore State

P11 provides:

```bash
pnpm db:backup
pnpm db:restore
```

P12 now provides the rehearsal procedure, but no restore is considered proven until:

1. a real staging backup is created;
2. checksum is recorded;
3. it is restored into a separate disposable database;
4. schema/data invariants are checked;
5. the API is exercised against the restored database;
6. elapsed restore time is recorded.

## 14. Performance/UAT State

The P11 benchmark harness is reusable for staging.

P12 defines the required evidence fields for request count, concurrency, success/error counts, p50/p95/p99, resource observations, and the threshold decision.

Frontend-heavy usability/UAT cannot be completed until the agreed frontend/integration pass implements the P3–P10 UI surfaces. Backend/API operational UAT can still begin independently when staging exists.

## 15. P12 Exit-Gate Matrix

```text
CI-driven staging deployment         PREPARED / NOT EXECUTED
Executable migration history         BLOCKED
Clean migration rehearsal            BLOCKED
Upgrade migration rehearsal          BLOCKED
Rollback rehearsal                   PREPARED / NOT EXECUTED
Database restore rehearsal           PREPARED / NOT EXECUTED
Reservation-expiry rehearsal         PROCEDURE READY / NOT EXECUTED
Paystack lifecycle                    NOT EXECUTED
Flutterwave lifecycle                 NOT EXECUTED
GIGL sandbox                          NOT EXECUTED / provider-dependent
R2 lifecycle                          NOT EXECUTED
Admin MFA recovery                    NOT EXECUTED
Provider outage simulation            NOT EXECUTED
Worker/dead-letter                    BLOCKED by worker runtime
Load test                             HARNESS READY / NOT EXECUTED
UAT                                   NOT EXECUTED
```

## 16. Current Phase Position

```text
P0  Foundation                         implemented source baseline
P1  Database + contracts               implemented source baseline
P2  Authentication                     implemented source baseline
P3  Vendor / store / KYC               implemented source baseline
P4  Catalog / variants / media         implemented source baseline
P5  Inventory / wishlist / cart        implemented source baseline
P6  Checkout / orders                  implemented source baseline
P7  Payments / commission / webhooks   implemented source baseline
P8  Logistics / shipments              implemented source baseline
P9  Returns / refunds / reviews        implemented source baseline
P10 Admin / analytics / promo / tax    implemented source baseline
P11 Hardening / security / NDPR        implemented source baseline
P12 Staging/UAT/rehearsal tooling      implemented; EXIT GATE NOT VERIFIED
```

## 17. What Must Happen Before P13

P13 production launch must not begin merely because P12 tooling exists.

At minimum, before P12 can pass:

1. establish a trusted executable environment and generate/review the first real Prisma migration;
2. resolve or bypass the GitHub Actions startup problem with an approved trusted CI/deployment path;
3. provision a staging target and its off-repository secrets;
4. deploy the stack;
5. execute backup/restore and rollback rehearsals;
6. exercise provider test/sandbox paths;
7. close the real worker retry/dead-letter gap;
8. run load testing;
9. execute applicable UAT;
10. record evidence using the P12 report template;
11. close every launch-blocking finding.

Until then, the correct P12 status is **prepared, not passed**.
