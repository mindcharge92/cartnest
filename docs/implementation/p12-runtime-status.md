# P12 Runtime Integration Status

**Phase:** FP12 / P12  
**Branch:** `feat/fp12-staging-uat-recovery-runtime`  
**Status:** Rehearsal and worker source hardened; runtime exit gate remains unverified  
**Updated:** 7 September 2026

## 1. Position

P12 remains an evidence phase. Source code can prepare deployment, recovery, worker, and sign-off mechanics, but P12 does not pass until those mechanics are executed against a production-like staging environment and the resulting evidence is accepted.

The current branch now contains both the staging/recovery harness and a first durable worker runtime baseline. Neither has runtime certification because GitHub Actions still creates zero jobs and the repository still lacks a committed pnpm lockfile and executable Prisma migration history.

## 2. Staging and release hardening already present

The branch provides:

- immutable SHA-tagged web/API/worker images;
- candidate versus last-known-good release semantics;
- promotion to `/opt/cartnest/current` only after staging smoke succeeds;
- a non-secret per-release manifest containing exact SHA/image tags;
- a staging-only application rollback workflow;
- rollback promotion only after the same smoke gate succeeds;
- sanitized P12 preflight and smoke artifacts;
- browser/API security-header and `no-store` smoke assertions;
- `pnpm p12:gate` for machine-checkable phase sign-off.

A failed candidate smoke run does not change the last-known-good release pointer.

## 3. Durable worker source baseline added

`apps/worker` is no longer only a heartbeat process.

The source baseline now includes:

```text
PostgreSQL OutboxEvent
        |
        | claim with FOR UPDATE SKIP LOCKED
        v
OutboxDispatcher
        |
        | eventId-based BullMQ job identity
        v
Redis / BullMQ
   |             |
notifications  maintenance
   |             |
materialize    expire HELD reservations
notifications  transactionally
```

### Worker configuration

The worker now requires both:

```text
DATABASE_URL
REDIS_URL
```

and exposes bounded configuration for:

- queue prefix;
- outbox polling interval;
- outbox batch size;
- maximum dispatch attempts;
- stale outbox lease timeout;
- maintenance scheduling interval.

Production worker startup no longer silently falls back to localhost database/Redis URLs.

### Outbox claiming and lease ownership

The dispatcher now:

1. selects eligible PENDING/FAILED events whose retry time has arrived;
2. reclaims stale PROCESSING events;
3. uses `FOR UPDATE SKIP LOCKED` for concurrent dispatchers;
4. increments attempts only when beginning a new attempt, not when reclaiming the same stale attempt;
5. stamps an exact `lockedAt` lease;
6. uses that lease timestamp in publish/failure compare-and-set transitions;
7. therefore prevents a superseded lease holder from finalizing another dispatcher's claim;
8. allows the final attempt to be reclaimed after a crash instead of leaving it permanently stuck in PROCESSING.

### Dispatch and retry behavior

For supported event version 1:

- BullMQ job identity is based on the durable outbox event ID;
- retryable publication failures use bounded backoff;
- exhausted events become visible FAILED records rather than retrying indefinitely;
- unsupported event versions fail closed;
- domain facts with no current asynchronous subscriber are considered valid facts rather than false dead letters;
- a crash after enqueue but before PostgreSQL publication can safely re-attempt because the same event ID is reused.

Current notification subscriptions are deliberately limited to event types with a real consumer. Queue names that have no processor yet are not used merely to make the architecture appear complete.

### Write-side event audit

Critical flows already persist durable outbox facts in the same database transaction as business state, including:

- `order.created` during checkout;
- `payment.succeeded` after verified payment success;
- `refund.succeeded` after refund success;
- `return.status_changed` during return transitions;
- shipment status facts from logistics.

Logistics emits `shipment.status_changed`. The dispatcher normalizes a status event whose payload status is `DELIVERED` to the notification consumer's `shipment.delivered` fact, avoiding a silent delivery-notification mismatch.

### Notification consumer

The notifications worker materializes existing CartNest notification rules for:

- order created;
- payment succeeded;
- shipment delivered;
- refund succeeded;
- return status changed.

Materialization remains database-idempotent through existing notification `dedupeKey` uniqueness/upsert behavior.

IN_APP rows become delivered immediately. EMAIL/SMS rows remain provider-neutral QUEUED records. Real email/SMS provider delivery is still a separate unresolved P12/P10 runtime requirement.

### Reservation-expiry maintenance job

The first scheduled business job is implemented.

`inventory.reservations.expire`:

- selects expired HELD reservations with `FOR UPDATE SKIP LOCKED`;
- changes each selected reservation to EXPIRED once;
- aggregates released quantities per variant;
- decrements `InventoryItem.reserved` transactionally;
- increments inventory version;
- fails instead of clamping if reserved-stock invariants are inconsistent;
- writes a SYSTEM audit record for the batch.

Because PostgreSQL remains authoritative, missed timer intervals do not lose expiry work. The next successful maintenance run finds all still-expired HELD rows.

### Graceful shutdown and worker health

Worker startup now creates:

- database client;
- BullMQ queue registry;
- notification and maintenance consumers;
- outbox dispatcher;
- maintenance scheduler.

SIGINT/SIGTERM stops new polling/scheduling, waits for active BullMQ work to drain, closes queue connections, disconnects PostgreSQL, and then exits.

Worker heartbeat state now reports last outbox run counts and failure state rather than reporting only process uptime.

### Controlled dead-letter replay

The built worker exposes:

```bash
pnpm --filter @cartnest/worker outbox:replay -- <outbox-event-id>
```

Replay is allowed only for a FAILED outbox event and uses a compare-and-set state reset plus SYSTEM audit entry.

Payment/refund event replay is denied by default. It additionally requires:

```text
WORKER_FINANCIAL_REPLAY_CONFIRM=REVIEWED_FINANCIAL_REPLAY
```

This is intentionally an explicit reviewed override rather than blind financial redrive.

## 4. New reproducibility blocker: no pnpm lockfile

The repository currently has no root:

```text
pnpm-lock.yaml
```

This is launch-blocking because:

- `.github/workflows/staging.yml` uses `pnpm install --frozen-lockfile`;
- the Dockerfiles use frozen-lockfile installation;
- BullMQ was added as a real worker dependency;
- therefore a release cannot reproducibly install the declared dependency graph until a real lockfile is generated and committed.

`pnpm p12:preflight` now checks for `pnpm-lock.yaml` explicitly and fails with a targeted explanation when it is missing.

The lockfile must be generated by pnpm in a trusted network-enabled environment. It must not be manually fabricated.

## 5. Executable Prisma migration history is still missing

`packages/database/prisma/migrations/` still lacks a reviewed versioned `migration.sql` history.

This blocks:

- clean `prisma migrate deploy` evidence;
- upgrade rehearsal;
- migration-backed restore verification;
- production-like staging deployment.

The first migration must be generated from the complete Prisma schema in a trusted executable environment, reviewed together with required raw PostgreSQL constraints/indexes, tested against disposable PostgreSQL, then committed.

## 6. Worker work still not complete

The new source baseline closes the prior heartbeat-only gap, but the overall durable background architecture is not yet production-certified or feature-complete.

Still required:

- generate and review the pnpm lockfile containing BullMQ 6.3.4 and transitive dependencies;
- execute worker typecheck/tests/build;
- real PostgreSQL concurrency tests for outbox leases and reservation expiry;
- Redis/BullMQ integration tests including crash-after-enqueue recovery;
- external EMAIL/SMS provider delivery workers;
- payment reconciliation worker path;
- refund reconciliation scheduling where required;
- GIGL tracking-sync worker wiring;
- session/idempotency/media maintenance jobs;
- dead-letter/replay staging rehearsal;
- Redis-loss reconstruction rehearsal;
- queue latency/failure observability and alert integration.

The empty payment/logistics/analytics queue names are architectural placeholders only; the dispatcher does not route work to them until a processor exists.

## 7. CI remains unable to execute source gates

The repository-wide GitHub Actions fault still produces synthetic `startup_failure` runs with zero jobs.

Therefore no claim is made that the new worker source has passed:

- dependency installation;
- lint;
- Prisma generation;
- typecheck;
- tests;
- production build;
- Docker image build;
- Redis/PostgreSQL integration execution.

## 8. Live staging/provider evidence remains required

Source commits still cannot prove:

- Paystack test payment/webhook/refund lifecycle;
- Flutterwave lifecycle and safe fallback;
- GIGL sandbox behavior;
- R2 lifecycle;
- Google OAuth staging behavior;
- database backup/restore duration;
- production-like load behavior;
- accessibility/UAT outcomes;
- real worker dead-letter/redrive behavior.

## 9. Exit-gate position

The valid transition remains:

```text
FP12 source baseline
      |
      +-- generate/commit pnpm-lock.yaml
      +-- generate/review real Prisma migration
      +-- complete remaining worker processors/providers
      +-- obtain a trusted executable CI/staging path
      v
production-like staging
      v
execute recovery/provider/load/UAT matrix
      v
collect artifacts/p12 evidence
      v
pnpm p12:gate
      v
P13 only after evidence-backed PASS
```

FP12 is **not passed** at this checkpoint.
