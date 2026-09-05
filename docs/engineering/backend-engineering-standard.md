# Backend Engineering Standard

**Applies to:** `apps/api` and backend-only supporting packages  
**Baseline:** Fastify + TypeScript + modular monolith + PostgreSQL/Prisma

## 1. Purpose

This standard defines how backend code should be structured and reviewed so the modular monolith remains understandable as CartNest grows.

## 2. Core Rules

1. Fastify routes are transport adapters, not business services.
2. Business use cases live inside the owning module.
3. Modules do not import another module's repositories.
4. Prisma is an infrastructure concern, not an API contract.
5. Every untrusted HTTP input is runtime-validated.
6. Authorization is enforced server-side.
7. Retry-sensitive operations are idempotent.
8. High-risk state changes are auditable.
9. External providers are accessed through adapters.
10. Errors are converted to the common API error contract.

## 3. Module Structure

Recommended pattern:

```text
modules/products/
  product.routes.ts
  application/
    create-product.use-case.ts
    update-product.use-case.ts
  domain/
    product.ts
    product-status.ts
  ports/
    product.repository.ts
  infrastructure/
    prisma-product.repository.ts
  presentation/
    product.mapper.ts
  index.ts
```

Not every trivial module needs ceremonial files, but responsibility boundaries must remain clear.

## 4. Route Responsibilities

Routes may:

- declare Fastify/OpenAPI schema;
- authenticate/authorize through approved hooks;
- parse validated request data;
- invoke an application use case;
- map known errors to HTTP;
- send response DTOs.

Routes should not:

- contain SQL/Prisma queries;
- calculate complex order/payment totals;
- call payment SDKs directly;
- make cross-module repository calls;
- silently catch all errors.

## 5. Application Use Cases

Use cases coordinate one business intention, for example:

- `CreateProduct`
- `ReserveInventory`
- `CreateCheckout`
- `ApproveVendor`
- `RequestRefund`

A use case should expose explicit inputs and outputs and depend on ports/interfaces for infrastructure where practical.

## 6. Domain Rules

Domain rules include:

- valid state transitions;
- financial invariants;
- ownership semantics;
- inventory availability;
- refund eligibility;
- review eligibility.

Do not duplicate important rules in controllers and UI.

## 7. Persistence

Prisma usage belongs in `@repo/database` and module infrastructure adapters.

Rules:

- use migrations;
- never `db push` as a production schema-change process;
- avoid unbounded queries;
- explicitly select fields for sensitive tables;
- use transactions for atomic invariants;
- map BigInt/Decimal/Date before transport;
- avoid dangerous cascade deletes on financial/history data.

## 8. Transactions

Use a transaction when multiple writes must succeed or fail together.

Examples:

- creating parent order + vendor orders + order items;
- reservation quantity + reservation record;
- payment event dedupe + payment-state update;
- refund balance + refund state transition.

Keep transactions focused. Do not perform long external HTTP calls while holding DB transactions unless unavoidable.

## 9. Cross-Module Communication

Prefer:

- synchronous public module service when caller requires immediate result;
- in-process event for secondary reaction.

Examples:

```text
orders -> inventory.reserve()       synchronous
orders -> payments.createIntent()   synchronous
OrderPaid -> notifications          event
OrderPaid -> analytics              event
```

## 10. External Integrations

Each provider gets an adapter.

Provider-specific SDK types must not leak into domain or public DTOs.

Adapters should normalize:

- status;
- references;
- errors;
- timestamps;
- money representation.

## 11. Configuration

Environment variables are read/validated through a configuration boundary.

Rules:

- fail fast for missing required server config;
- never provide secret defaults;
- never log secrets;
- do not import server config into browser code;
- maintain `.env.example` without credentials.

## 12. Logging

Use structured logs.

Include where available:

- request ID;
- user ID;
- vendor/store scope;
- order/payment ID;
- operation name;
- provider reference.

Do not log:

- password;
- raw refresh token;
- private keys;
- payment secret;
- full sensitive personal data.

## 13. Error Handling

Business/application code should raise/return domain-specific errors such as:

- `ProductNotFound`
- `InsufficientStock`
- `VendorNotApproved`
- `OrderNotCancellable`

The HTTP layer maps these into the common API error contract.

Unknown errors become a safe `INTERNAL_ERROR` response and are logged with correlation data.

## 14. Authorization

Every vendor-scoped mutation must enforce:

```text
authenticated
AND permission
AND membership/ownership scope
AND valid business state
```

Never trust request `vendorId` as proof of ownership.

## 15. Background Work

Do not add an asynchronous queue merely for architectural fashion.

Introduce background execution when:

- response does not need completion;
- work is slow;
- retries are independent;
- workload can be decoupled safely.

Candidate future jobs:

- notifications;
- media processing;
- analytics aggregation;
- payment reconciliation.

## 16. Performance

Backend performance rules:

- paginate list endpoints;
- index common query paths;
- avoid N+1 queries;
- prefer explicit selects;
- measure before caching;
- do not add Redis until a demonstrated requirement exists;
- load-test checkout and high-traffic read paths.

## 17. Security

- validate every boundary;
- use parameterized ORM queries;
- enforce rate limits on abuse-prone endpoints;
- enforce content-length/file limits;
- validate webhook signatures;
- apply CSRF protection according to auth topology;
- hash credentials using approved parameters;
- use secure cookies for browser session material.

## 18. Tests Required per Module

Depending on risk:

- domain/unit tests;
- application use-case tests;
- repository integration tests;
- Fastify route tests using `fastify.inject()`;
- concurrency tests;
- provider-adapter contract tests.

## 19. Definition of Done

A backend feature is not done until:

- [ ] contract exists;
- [ ] validation exists;
- [ ] authorization exists;
- [ ] business rules are tested;
- [ ] DB changes use migration;
- [ ] errors use stable codes;
- [ ] logs/audit are appropriate;
- [ ] idempotency/concurrency considered;
- [ ] OpenAPI reflects behavior;
- [ ] typed client generation still succeeds.
