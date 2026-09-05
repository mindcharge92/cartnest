# ADR-010: Idempotency, Concurrency, and Retry Safety

**Status:** Proposed baseline  
**Date:** 5 September 2026

## Context

E-commerce systems receive duplicate requests because of browser retries, mobile/network instability, double-clicks, reverse-proxy retries, payment-provider webhook redelivery, and client timeouts after the server already committed work.

Without explicit protection, CartNest could create duplicate orders, duplicate payment attempts, duplicate refunds, or inconsistent inventory.

## Decision

Adopt idempotency as a first-class API and domain pattern for retry-sensitive mutations, combined with transactional and concurrency controls.

## Operations Requiring Idempotency

At minimum:

- checkout submission;
- payment initialization;
- refund creation;
- payment webhook processing;
- inventory reservation commitment/release;
- shipment booking;
- selected admin financial actions.

## HTTP Idempotency Key

For relevant client-initiated mutations:

```text
Idempotency-Key: <opaque-client-generated-value>
```

The backend stores:

- authenticated principal;
- operation scope;
- idempotency key;
- request fingerprint/hash;
- status;
- resulting resource ID;
- safe response snapshot/reference;
- expiry/retention timestamp.

## Duplicate Behavior

Same key + same semantic request:

- return the original logical result.

Same key + materially different request:

- reject with a conflict/error code such as `IDEMPOTENCY_KEY_REUSED`.

## Database Constraints

Idempotency does not replace unique constraints.

Examples:

- unique provider reference;
- unique provider webhook event ID;
- unique payment allocation identity;
- unique inventory reservation operation reference where applicable.

## Concurrency Strategy

Use the smallest correct mechanism per invariant.

Possible mechanisms:

- database transaction;
- unique constraint;
- atomic conditional update;
- optimistic version column;
- row-level lock where justified.

Do not implement a global distributed lock as the default solution.

## Inventory Example

A reservation operation must atomically ensure sufficient available quantity and update reservation state.

Conceptual invariant:

```text
available = onHand - reserved
requested <= available
```

Concurrent buyers must not both succeed using the same last unit.

## Order State Transitions

State transitions should verify expected current state.

Example:

```text
PENDING_PAYMENT -> PAID
```

must not be applied twice or from an invalid state.

## Webhooks

Provider events are processed through an inbox/deduplication record.

Processing flow:

1. verify signature;
2. derive provider event identity;
3. attempt insert;
4. if already processed, acknowledge safely;
5. apply state transition transactionally;
6. mark processed;
7. emit internal event.

## Retry Policy for External Providers

Retry only operations that are safe to retry.

Classify failures:

- definitive not executed;
- transient and retry-safe;
- ambiguous;
- successful.

An ambiguous payment attempt must be reconciled before another provider charge can be initiated.

## Observability

Record:

- idempotency key;
- request ID;
- resource ID;
- retry count;
- state transition;
- provider reference where relevant.

Never log secrets or raw authentication credentials.

## Testing

Required tests:

- repeated same-key checkout creates one order;
- same key + changed body is rejected;
- duplicate webhook does not duplicate state transition;
- concurrent stock reservation cannot oversell;
- duplicate refund request does not double-refund;
- timeout/retry scenarios preserve one logical result.
