# ADR-002: Modular Monolith Architecture and Module Boundaries

**Status:** Accepted baseline  
**Date:** 4 September 2026  
**Backend:** Fastify + TypeScript  
**Architecture:** Modular monolith  
**Related:** ADR-001

## Decision Summary

Implement the Fastify backend as a modular monolith: one deployable application with strongly isolated business modules. Each module owns its use cases, internal models, persistence access, and public module interface. Cross-module access occurs through explicit services/ports or domain/application events, never by reaching directly into another module's repositories or tables.

## 1. Why This Architecture

- The project does not require the operational complexity of independently deployed microservices at the start.
- The marketplace still needs clear boundaries because payments, inventory, orders, vendors, logistics, reviews, and administration evolve at different rates.
- A modular monolith preserves transactional simplicity, fast local development, straightforward deployment, and future extraction paths.
- Clear boundaries reduce the risk that a single codebase becomes an unstructured monolith.

## 2. Business Modules

| Module | Primary Responsibilities | Owns / Controls |
| --- | --- | --- |
| identity | login, refresh/session lifecycle, credential security | auth sessions, credentials, token/session records |
| users | profiles, addresses, customer account data | user profile and address records |
| vendors | vendor onboarding, verification, membership and staff | vendor, vendor member, vendor status |
| stores | store profile, branding, settings, lifecycle | store and storefront settings |
| catalog | categories, product content, variants, media metadata | product/catalog representation |
| inventory | stock, reservation, release, adjustments | inventory balances and reservation records |
| cart | buyer cart and cart items | cart state |
| orders | checkout result, parent/vendor-order state, cancellations | orders, vendor orders, order items |
| payments | intents, attempts, confirmations, refunds | payment/refund/provider event records |
| logistics | shipment booking, tracking, delivery states | shipment and tracking records |
| reviews | product/store reviews and moderation workflow | review records |
| admin | privileged marketplace moderation/orchestration | admin actions and moderation commands |
| analytics | read models and aggregated marketplace metrics | derived reporting/read data |
| notifications | email/SMS/in-app delivery orchestration | notification jobs/templates/logs |
| audit | security and business audit trail | append-oriented audit entries |

## 3. Boundary Rules

1. **Module ownership:** a module is the only layer allowed to mutate its owned aggregate/data through its repositories.
2. **No cross-repository access:** Orders must not import `InventoryRepository`; it calls an inventory application service/port.
3. **Public module API:** every module exposes a small intentional interface for other modules.
4. **Internal visibility:** routes, mappers, repositories, and internal domain types remain private to the module where possible.
5. **Events:** use in-process application/domain events for decoupled secondary reactions; events are not a substitute for required synchronous invariants.
6. **Transactions:** a use case may coordinate a database transaction across carefully designed operations where atomicity is required, while ownership boundaries remain explicit.
7. **No circular dependencies:** if A depends on B and B depends on A, introduce orchestration, an event, or a shared abstraction rather than accepting the cycle.
8. **Shared kernel:** only genuinely universal primitives belong in shared code—IDs, result/error primitives, money/value abstractions, logging interfaces—not domain services.

## 4. Dependency Direction

```text
HTTP Routes
    |
    v
Application Use Cases
    |
    +--> Domain Logic
    |
    +--> Ports / Interfaces
             |
             v
      Infrastructure Adapters
      (Prisma, gateways, logistics)

Cross-module:
orders --> inventory public service
orders --> payments public service
payments --event--> orders
orders --event--> notifications
```

## 5. Synchronous vs Event Communication

| Use Synchronous Call When | Use Event When |
| --- | --- |
| Caller must know success/failure before continuing | Reaction is secondary and can happen after primary state change |
| Inventory reservation is required before order creation completes | Send confirmation after order is committed |
| Authorization/ownership must be checked immediately | Analytics read model updates after a business event |
| Payment initiation response is needed by caller | Audit/notification listeners observe completed actions |

## 6. Example Checkout Collaboration

```text
Checkout application service
  -> cart: read current cart
  -> vendors/stores: validate sellers are active
  -> catalog: snapshot purchasable product data
  -> inventory: reserve required quantities
  -> orders: create parent order + vendor orders
  -> payments: create payment intent
  -> emit OrderCreated
  -> notifications/analytics observe asynchronously
```

## 7. Module Folder Convention

```text
apps/api/src/modules/orders/
  order.routes.ts
  application/
    create-order.use-case.ts
    cancel-order.use-case.ts
  domain/
    order.ts
    order-status.ts
  ports/
    order.repository.ts
    inventory.gateway.ts
  infrastructure/
    prisma-order.repository.ts
  presentation/
    order.mapper.ts
  index.ts     # only approved public exports
```

The exact number of files may vary with module complexity. The important rule is that dependencies and ownership remain explicit.

## 8. Data Ownership

A module may read another module's data only through an approved interface or intentionally designed read model. Direct writes to another module's owned tables are forbidden.

Examples:

- `orders` may ask `catalog` for a product snapshot but does not update product records.
- `orders` may ask `inventory` to reserve stock but does not modify inventory tables directly.
- `payments` may emit `PaymentSucceeded`, while `orders` decides how that event changes order state.
- `admin` orchestrates privileged actions through module services rather than bypassing domain rules.

## 9. Domain Events

Domain/application events should be named in past tense and describe facts, for example:

```text
OrderCreated
PaymentSucceeded
InventoryReservationExpired
VendorApproved
ShipmentDelivered
RefundCompleted
```

Event handlers must be idempotent when redelivery/re-execution is possible.

## 10. Transaction Boundaries

Use a single local database transaction where one use case requires atomic consistency. Avoid long-running external HTTP calls inside transactions.

Typical transactional boundaries include:

- order + vendor orders + order items;
- inventory reservation record + stock counters;
- payment webhook deduplication + payment state transition;
- refund balance + refund state change.

## 11. Extraction Readiness

A module becomes a microservice candidate only when business boundary, data ownership, operational scale, reliability, or team ownership justifies extraction.

Do not design distributed systems prematurely. First preserve boundaries inside the monolith.

Likely future extraction candidates include:

- notifications;
- search/indexing;
- analytics/reporting;
- media processing;
- payment reconciliation workers.

## 12. Architecture Quality Gates

- [ ] no module imports another module's infrastructure/repository implementation;
- [ ] no circular module dependencies;
- [ ] every cross-module dependency is visible in code review;
- [ ] each module has tests around its public use cases;
- [ ] architecture/dependency tests are added when implementation begins;
- [ ] provider-specific SDK types do not leak into unrelated modules;
- [ ] shared packages do not become a dumping ground for business logic.

## 13. Consequences

| Positive | Trade-off / Cost |
| --- | --- |
| Simple deployment and local development | Boundaries require discipline and automated dependency rules |
| Strong transactional options inside one process/database | Careless direct DB access can erode module ownership |
| Lower operational cost than microservices | One deployment can affect all modules |
| Future extraction remains possible | Interfaces/events add structure compared with a basic layered app |

## 14. Final Decision

CartNest starts as one Fastify deployment with explicit business modules, strong data ownership, constrained dependency direction, and intentional cross-module communication. Microservices are a future optimization, not the starting architecture.
