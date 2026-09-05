# Testing and Quality Standard

**Status:** Accepted baseline

## 1. Objective

Testing exists to protect business invariants, security boundaries, financial correctness, vendor isolation, and production behavior—not merely to increase coverage percentage.

## 2. Test Pyramid / Layers

### Unit tests

Test pure logic such as:

- money calculations;
- status transitions;
- permissions;
- allocation algorithms;
- DTO mappers;
- domain policy functions.

### Application/use-case tests

Test orchestration with controlled ports:

- checkout;
- inventory reservation;
- vendor approval;
- refund eligibility.

### Integration tests

Test real infrastructure boundaries:

- Prisma/PostgreSQL repositories;
- migrations;
- Fastify validation/auth;
- payment webhook handlers;
- transaction behavior.

### End-to-end tests

Test representative real workflows:

- customer registration/login;
- vendor onboarding;
- vendor product creation;
- buyer cart/checkout;
- payment confirmation simulation;
- order tracking;
- refund flow;
- admin approval/moderation.

### Load/performance tests

Use k6 or equivalent for:

- checkout;
- catalog search/list;
- payment webhook burst;
- vendor order lists.

The original project target includes 100 concurrent checkout sessions and an average response target under 500 ms under the defined test conditions.

## 3. Backend Test Baseline

Preferred API integration technique:

```text
Fastify `inject()`
```

because it tests Fastify routing/validation without requiring a real listening socket.

Use a real test PostgreSQL database for repository and transaction integration tests.

## 4. Contract Tests

Every important schema should test:

- required fields;
- optional vs nullable;
- min/max constraints;
- enum values;
- money representation;
- response allowlisting.

The OpenAPI document and typed client must regenerate successfully in CI.

## 5. Security Tests

At minimum:

- unauthenticated route blocked;
- invalid/expired session blocked;
- vendor A cannot read/write vendor B resource;
- staff permissions enforced;
- admin routes blocked for vendors;
- ownership cannot be bypassed by changing IDs;
- webhook signature validation rejects forged events;
- sensitive fields are absent from public responses.

## 6. Payment Tests

High priority:

- duplicate webhook is harmless;
- amount mismatch does not mark order paid;
- currency mismatch does not mark order paid;
- duplicate payment initialization with same idempotency key creates one logical intent;
- ambiguous payment does not trigger automatic double charge;
- partial refund cannot exceed remaining refundable amount;
- provider adapter normalization is tested.

Provider sandboxes/mocks should be used deterministically. Production tests must never make uncontrolled real charges.

## 7. Inventory Concurrency Tests

Test simultaneous reservation attempts against limited stock.

Required invariant:

```text
committed + reserved cannot exceed on-hand according to stock model
```

Simulate concurrent requests, not only sequential unit tests.

## 8. Order State Tests

Verify allowed and forbidden transitions.

Examples:

```text
PENDING_PAYMENT -> PAID          allowed
PAID -> PENDING_PAYMENT          forbidden
SHIPPED -> CANCELLED             policy-dependent / usually forbidden
DELIVERED -> REFUNDED            requires refund workflow
```

## 9. Migration Tests

CI should verify:

- migrations apply from an empty database;
- schema is reproducible;
- destructive migrations receive explicit review;
- rollback/recovery approach is documented for risky migrations.

## 10. Frontend Tests

Prioritize behavior:

- forms;
- cart updates;
- checkout states;
- API error handling;
- role-based interfaces;
- upload flows;
- accessibility for critical components.

Do not rely only on snapshots.

## 11. Test Data

Use factories/builders.

Never use production personal data in automated tests.

Seeded users/vendors should clearly represent:

- customer;
- vendor owner;
- vendor staff;
- admin;
- suspended/disabled states.

## 12. External Integration Testing

Adapter tests should verify normalization independent of the application.

Webhook fixtures must include:

- valid signature;
- invalid signature;
- duplicate event;
- unknown reference;
- amount mismatch;
- success;
- failure;
- pending/ambiguous.

## 13. Quality Gates in CI

Required before merge:

- [ ] formatting/lint;
- [ ] TypeScript typecheck;
- [ ] unit tests;
- [ ] API integration tests;
- [ ] contract/OpenAPI generation;
- [ ] typed client generation;
- [ ] generated-artifact consistency;
- [ ] web build;
- [ ] API build.

As the project matures add:

- dependency/security audit;
- E2E tests;
- migration checks;
- performance smoke tests.

## 14. Coverage

Coverage is a signal, not the goal.

A high-risk payment function with untested branches is unacceptable even if overall coverage is high.

Set numeric thresholds only after the initial suite reflects meaningful risk areas.

## 15. Definition of Done

A feature is test-complete when the tests protect its important invariants and failure cases, not merely its happy path.
