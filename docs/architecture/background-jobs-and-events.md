# CartNest Background Jobs & Event Architecture

**Status:** Implementation baseline  
**Last updated:** 5 September 2026  
**Technology baseline:** PostgreSQL transactional outbox + Redis + BullMQ workers

## 1. Purpose

CartNest contains work that must not run synchronously inside customer HTTP requests: payment reconciliation, notification delivery, shipment tracking, expired inventory reservations, media processing, analytics updates, and provider retries.

This document defines when work becomes asynchronous, how events are persisted, how BullMQ is used without making Redis the source of truth, retry/dead-letter behavior, idempotency, event versioning, schedules, and worker operations.

## 2. Core Decision

Use:

```text
PostgreSQL business transaction
        |
        +-- write domain state
        +-- write OutboxEvent
        |
      COMMIT
        |
        v
Outbox Dispatcher
        |
        v
BullMQ / Redis
        |
        v
Worker Consumer(s)
        |
        v
provider / projection / notification / follow-up command
```

The outbox prevents the classic failure where database state commits but the process crashes before publishing the corresponding asynchronous event.

## 3. What Must Remain Synchronous

Keep work synchronous when the caller cannot safely proceed without the result:

- authentication/authorization;
- vendor/store ownership validation;
- price calculation required to submit checkout;
- inventory reservation required to create order;
- creation of Order/VendorOrders/OrderItems;
- idempotency-record acquisition;
- payment initialization response required to redirect/instruct the customer;
- state-transition validation.

Do not use a queue to hide a required business invariant.

## 4. What Should Be Asynchronous

- email/SMS/in-app notification delivery;
- payment reconciliation after ambiguous/pending state;
- provider-event follow-up work after durable webhook receipt;
- shipment tracking refresh;
- inventory-reservation expiry;
- media optimization/thumbnail generation;
- analytics/read-model projection;
- cleanup of expired sessions/idempotency records;
- retryable provider calls not required for immediate customer response;
- operational report generation.

## 5. Runtime Processes

### API process

- validates requests;
- executes synchronous use cases;
- persists business state/outbox events;
- receives provider webhooks;
- acknowledges provider after durable safe handling.

### Worker process

- dispatches outbox events;
- consumes BullMQ queues;
- executes scheduled jobs;
- communicates with external providers;
- retries transient failures;
- emits logs/metrics/traces.

The worker is independently restartable and horizontally scalable.

## 6. Queue Names

Initial queues:

```text
cartnest:payments
cartnest:inventory
cartnest:logistics
cartnest:notifications
cartnest:media
cartnest:analytics
cartnest:maintenance
```

Queue separation allows different concurrency, retry, and alert policies.

## 7. Domain Event Envelope

Every durable event should use a standard envelope:

```json
{
  "eventId": "uuid",
  "eventType": "order.paid",
  "eventVersion": 1,
  "occurredAt": "2026-09-05T12:00:00.000Z",
  "aggregateType": "Order",
  "aggregateId": "uuid",
  "correlationId": "request-or-workflow-id",
  "causationId": "optional-prior-event-id",
  "payload": {}
}
```

The event ID is the deduplication identity.

## 8. Event Naming

Use past-tense facts:

```text
user.registered
vendor.approved
store.activated
product.published
inventory.reserved
inventory.reservation_expired
order.created
order.paid
vendor_order.delivered
payment.succeeded
payment.failed
refund.succeeded
shipment.created
shipment.delivered
return.approved
review.created
```

Commands are not events. `send-email` is a job/command; `order.paid` is an event.

## 9. Event Versioning

- event schema starts at version 1;
- additive backward-compatible fields may remain same version if consumers tolerate them;
- semantic/breaking payload changes create a new version;
- consumers explicitly support known versions;
- never silently reinterpret an old persisted event.

## 10. Transactional Outbox

When business state and an event must be atomic:

```ts
await prisma.$transaction(async (tx) => {
  const order = await createOrder(tx, input);

  await tx.outboxEvent.create({
    data: {
      aggregateType: "Order",
      aggregateId: order.id,
      eventType: "order.created",
      eventVersion: 1,
      payload: buildOrderCreatedPayload(order),
    },
  });
});
```

The event is not marked `PUBLISHED` until dispatch succeeds.

## 11. Outbox Dispatcher

Recommended behavior:

1. poll eligible `PENDING` events frequently;
2. claim a bounded batch using transactional locking/`SKIP LOCKED` strategy;
3. set temporary PROCESSING/lock metadata;
4. enqueue BullMQ job with `jobId = eventId` where practical;
5. mark OutboxEvent PUBLISHED;
6. on failure increment attempts, capture safe error and reschedule;
7. after configured maximum, mark FAILED and alert.

Multiple dispatchers must not publish the same event as distinct logical work without consumer dedupe.

## 12. Consumer Idempotency

Every consumer assumes at-least-once delivery.

Therefore:

- use event ID/job ID dedupe;
- check destination state before transition;
- provider calls use provider/platform idempotency where available;
- notification has dedupeKey;
- financial changes have dedicated idempotency/business keys;
- analytics projections use upsert/version rules.

Exactly-once transport is not assumed.

## 13. Retry Classification

### Retryable

- provider HTTP 5xx;
- connection timeout before definitive result;
- temporary DNS/network failure;
- Redis/provider rate limit with safe delay;
- transient database connectivity issue.

### Non-retryable without intervention

- validation error;
- authorization error;
- unsupported event version;
- malformed provider request;
- permanent provider rejection;
- invariant violation;
- conflicting idempotency key.

### Ambiguous financial outcome

Do not treat as ordinary retry. Move to payment reconciliation flow.

## 14. Retry Schedule Baseline

For ordinary retryable jobs:

```text
attempt 1: immediate
attempt 2: +10 seconds
attempt 3: +1 minute
attempt 4: +5 minutes
attempt 5: +30 minutes
then: dead-letter/manual/reconciliation path
```

Provider-specific limits may override this.

Do not create unbounded retry storms.

## 15. Dead-Letter Behavior

When retries are exhausted:

- preserve source PostgreSQL state/outbox record;
- retain failed BullMQ job long enough for diagnosis;
- log error with event/job ID;
- increment dead-letter metric;
- alert based on queue severity;
- provide controlled replay tool/command;
- never replay financial jobs blindly.

## 16. Scheduled Jobs

### Inventory reservation expiry

Schedule: every 60 seconds.

Behavior:

- select HELD reservations with `expiresAt <= now`;
- atomically mark EXPIRED/release reserved quantity;
- skip COMMITTED/RELEASED reservations;
- emit `inventory.reservation_expired` when useful.

### Payment reconciliation

Schedule: every 5 minutes for unresolved attempts, with age/provider-specific throttling.

Behavior:

- query PROCESSING/ambiguous attempts;
- call provider verification;
- verify amount/currency/reference;
- apply idempotent state transition;
- age/escalate attempts that remain unresolved.

### Shipment synchronization

Schedule baseline: every 10 minutes for active GIGL shipments, with reduced frequency for old/stalled shipments and immediate update from provider events if later supported.

### Session cleanup

Schedule: daily.

Remove/reap expired revoked session records according to retention policy while preserving security audit records.

### Idempotency cleanup

Schedule: daily.

Delete expired records only after their protected retry window has elapsed.

### Media cleanup

Schedule: hourly/daily depending workflow.

Delete abandoned PENDING upload intents/objects only after safe timeout and ownership verification.

### Analytics refresh/projection

Event-driven where possible; periodic reconciliation at least hourly to detect projection drift.

## 17. Payment Webhook Pattern

Webhook endpoint should do only required synchronous security/durability work:

```text
receive raw body
verify signature
derive event identity
dedupe/persist ProviderEvent
return provider-required success promptly
       |
       v
worker verifies provider transaction and applies business transition
```

Where provider guidance requires re-query before value is granted, the asynchronous processor performs that verification before marking payment successful.

## 18. Inventory Concurrency

Inventory reservation jobs and synchronous checkout use database transactions/atomic updates. Redis locks are not the primary stock correctness mechanism.

Redis may coordinate work, but PostgreSQL constraints and conditional updates remain authoritative.

## 19. Payment/Reconciliation Concurrency

Only one logical processor may perform a state transition for a PaymentAttempt at a time.

Use transaction/state compare-and-set semantics such as:

```text
UPDATE ... WHERE id = ? AND status IN ('PENDING','PROCESSING')
```

A late duplicate failure event cannot overwrite a confirmed successful state.

## 20. Worker Concurrency Baseline

Start conservatively and configure by environment:

```text
payments:      5
inventory:    10
logistics:     5
notifications: 20 (subject to provider limits)
media:         2–4 CPU/memory dependent
analytics:     2
maintenance:   1–2
```

These are starting values, not hard capacity promises. Tune using queue latency and downstream provider/DB capacity.

## 21. Job Timeouts

Every external-call job has a bounded timeout.

No worker should wait indefinitely for a provider.

Payment uncertainty caused by timeout goes to reconciliation rather than unsafe immediate replay.

## 22. Queue Priority

Suggested ordering:

1. payment confirmation/reconciliation;
2. inventory reservation expiry/release;
3. order/logistics critical state;
4. authentication/security notification;
5. ordinary transactional notifications;
6. media processing;
7. analytics/maintenance.

Priority must not starve low-priority queues indefinitely.

## 23. Event Consumer Examples

### `order.paid`

Consumers may:

- commit/confirm inventory state if not already committed;
- notify customer;
- notify vendor(s);
- update analytics projection;
- prepare fulfillment workflow.

Each consumer is independently idempotent.

### `vendor_order.delivered`

Consumers may:

- set review eligibility;
- begin settlement-eligibility timer;
- notify customer/vendor;
- update analytics.

## 24. Failure During Deployment

Workers use graceful shutdown.

On SIGTERM:

- stop taking new jobs;
- complete current jobs within timeout;
- safely release unfinished job lease;
- close Redis/DB;
- exit.

BullMQ retry plus business idempotency protects interrupted work.

## 25. Observability

Per queue expose:

```text
waiting
active
completed
failed
retrying
oldest_wait_seconds
processing_duration
worker_heartbeat
outbox_pending
outbox_failed
```

Payment and inventory queue failures have higher alert severity than analytics.

## 26. Redis-Loss Recovery

After Redis loss/replacement:

1. restore Redis service;
2. start worker;
3. dispatch PENDING/FAILED-retryable OutboxEvents;
4. reconcile pending payments;
5. run reservation expiry reconciliation;
6. reschedule active shipment tracking;
7. requeue PENDING/FAILED-retryable notifications;
8. validate no duplicate financial effects.

## 27. Testing Requirements

- outbox event created atomically with business state;
- dispatcher crash before/after enqueue does not create duplicate business effect;
- duplicate event consumption is harmless;
- expired reservations release once;
- ambiguous payment timeout does not double-charge;
- exhausted retry becomes visible/alerted;
- Redis wipe can reconstruct critical work;
- worker graceful shutdown preserves job correctness;
- unsupported event version fails safely.

## 28. Definition of Done

A background workflow is complete only when:

- source-of-truth state is identified;
- event/job schema documented;
- idempotency key defined;
- timeout defined;
- retry classification defined;
- max attempts defined;
- dead-letter/reconciliation path exists;
- metrics/alerts exist;
- replay test exists;
- Redis loss does not destroy the only copy of critical business truth.
