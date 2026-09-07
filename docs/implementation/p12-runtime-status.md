# P12 Runtime Integration Status

**Phase:** FP12 / P12  
**Branch:** `feat/fp12-staging-uat-recovery-runtime`  
**Status:** Rehearsal and worker source hardened; runtime exit gate remains unverified  
**Updated:** 7 September 2026

## Current position

The FP12 branch now contains the staging/recovery harness plus a durable PostgreSQL-outbox + Redis/BullMQ worker baseline. Runtime certification is still blocked by executable environment evidence.

### Worker baseline now present

- PostgreSQL `OutboxEvent` source of truth;
- concurrent claiming with `FOR UPDATE SKIP LOCKED`;
- stale PROCESSING lease reclamation;
- bounded retry and FAILED visibility;
- deterministic eventId BullMQ job identity;
- notification consumer with dedupe-key persistence;
- missing referenced aggregates fail closed instead of being treated as successful zero-work jobs;
- scheduled inventory-reservation expiry using PostgreSQL authority;
- graceful shutdown and queue draining;
- controlled failed-outbox replay with explicit financial replay confirmation;
- bounded, audited Redis-loss reconstruction for idempotent notification jobs only.

### Tooling correction

The repo previously pinned an impossible package version:

```text
@eslint/js 10.9.1
```

That package version does not exist. It is now pinned to the published `10.0.1` release. Root `eslint` may remain on its valid 10.x release line.

### Reproducibility blocker

The repository still needs a generated root `pnpm-lock.yaml`. The lockfile must be produced by a real pnpm install under the repository's supported runtime (`Node 24.20.0`, `pnpm 11.25.0`) and committed; it must not be manually fabricated.

### Database blocker

`packages/database/prisma/migrations/` still needs the first reviewed executable migration history generated from the complete Prisma schema and proven against disposable PostgreSQL.

### Evidence state

GitHub Actions continues to produce synthetic `startup_failure` runs with zero jobs. Therefore no install, lint, Prisma generation, typecheck, test, build, Docker, PostgreSQL concurrency, or Redis/BullMQ integration result is claimed yet.

## Next executable sequence

1. switch the local runtime to Node 24.20.0;
2. pull the latest FP12 branch containing the `@eslint/js` correction;
3. run `pnpm install` to generate `pnpm-lock.yaml`;
4. commit the generated lockfile after review;
5. execute lint/typecheck/tests/build locally;
6. generate and review the first Prisma migration;
7. run PostgreSQL/Redis integration rehearsals;
8. continue remaining payment/logistics/provider worker paths;
9. execute staging/UAT/recovery evidence;
10. pass `pnpm p12:gate` before P13.
