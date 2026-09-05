# CartNest System Architecture

**Status:** Accepted baseline  
**Last updated:** 5 September 2026

## 1. Purpose

This document describes the overall architecture of CartNest as a multi-vendor marketplace. It explains the major runtime components, application boundaries, request flows, data ownership model, external integrations, deployment assumptions, security boundaries, and how the detailed ADRs fit together.

This document is intentionally higher-level than individual ADRs. When a conflict exists, the most recent accepted ADR for a specific topic takes precedence.

## 2. Architectural Goals

CartNest must be able to:

1. support multiple Nigerian businesses operating independent stores on one marketplace;
2. preserve strong vendor/store isolation;
3. keep frontend and backend data contracts synchronized;
4. support secure local payment methods through Paystack and Flutterwave;
5. prevent overselling and duplicate financial operations;
6. provide reliable order decomposition and fulfillment across multiple vendors;
7. remain simple enough to deploy and operate as one system initially;
8. scale individual pressure points later without rewriting the entire domain model;
9. preserve auditability for payments, refunds, moderation, inventory, and administrative actions;
10. remain usable on mobile devices and constrained network conditions.

## 3. Technology Baseline

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web application | Next.js + TypeScript | Buyer, vendor, and admin web experiences |
| Backend API | Fastify + TypeScript | Business API, authentication, authorization, orchestration |
| Repository | Turborepo | Monorepo task orchestration and shared package boundaries |
| Runtime contracts | TypeBox | Runtime validation + inferred TypeScript DTOs |
| API description | OpenAPI / Swagger | Executable API documentation and client generation |
| Typed client | `@repo/api-client` | Type-safe frontend consumption of backend endpoints |
| Database | PostgreSQL | Transactional relational source of truth |
| ORM | Prisma | Schema migrations and persistence access |
| Payments | Paystack + Flutterwave adapters | Provider-neutral payment execution |
| Media | S3-compatible object storage baseline | Product/store media, not binary DB storage |
| Containerization | Docker | Reproducible runtime packaging |
| CI/CD | GitHub Actions | Quality gates, builds, generated-artifact checks, deployment |

## 4. Architectural Style

The backend is a **modular monolith**.

This means CartNest begins as one deployable Fastify application, but the code is separated into explicit business modules such as:

- identity
- users
- vendors
- stores
- catalog
- inventory
- cart
- orders
- payments
- logistics
- reviews
- admin
- analytics
- notifications
- audit

A module owns its business rules and write model. Other modules must interact through approved module interfaces or events rather than importing repositories from one another.

## 5. High-Level Runtime View

```text
                    Internet
                       |
                 CDN / Reverse Proxy
                       |
             +---------+----------+
             |                    |
             v                    v
       Next.js Web           Fastify API
       apps/web              apps/api
             |                    |
             |          +---------+----------+
             |          |                    |
             |          v                    v
             |     PostgreSQL         External Providers
             |      via Prisma         Paystack
             |                         Flutterwave
             |                         Logistics
             |                         Email/SMS
             |                         Object Storage
             |
             +---- typed API client ----> API
```

The browser does not directly access PostgreSQL, payment secrets, provider administration APIs, or server-only infrastructure.

## 6. Monorepo Structure

```text
apps/
  web/
  api/

packages/
  contracts/
  api-client/
  database/
  ui/
  config/
  eslint-config/
  typescript-config/
  testing/

docs/
  product/
  architecture/
  engineering/
  api/
  security/
  data/
```

Key dependency direction:

```text
web -> api-client -> contracts
web -> ui
api -> contracts
api -> database
api-client -X-> database
contracts -X-> database
web -X-> database
```

## 7. API Boundary

The API boundary is contract-first.

Each endpoint defines:

- path parameters;
- query parameters;
- request body;
- authentication requirements;
- response schemas by status code;
- stable error codes;
- OpenAPI metadata.

TypeBox schemas are the runtime source of truth. DTO TypeScript types are inferred from those schemas.

The Next.js frontend consumes endpoint types through `@repo/api-client`. It must not recreate backend DTOs or import Prisma models.

## 8. Data Flow: Typical Request

```text
Next.js UI
  -> typed API client
  -> Fastify route
  -> TypeBox validation
  -> authentication/authorization
  -> application use case
  -> domain/module logic
  -> repository/adapter
  -> PostgreSQL or external provider
  -> response mapper
  -> response-schema validation
  -> typed client
  -> UI
```

## 9. Authentication and Authorization

Fastify is the security authority.

Authorization is the combination of:

1. authentication;
2. role;
3. explicit permission;
4. vendor/store ownership scope;
5. business-state rules.

Hiding a button in Next.js is not authorization.

Representative roles:

- CUSTOMER
- VENDOR_OWNER
- VENDOR_STAFF
- ADMIN
- SUPER_ADMIN

Vendor-scoped operations must resolve ownership and membership server-side.

## 10. Multi-Vendor Commerce Model

A buyer sees one checkout. Internally, the order is decomposed:

```text
Order
  +-- VendorOrder for Store A
  |     +-- OrderItems
  |     +-- Shipment(s)
  |
  +-- VendorOrder for Store B
        +-- OrderItems
        +-- Shipment(s)
```

The parent `Order` represents the customer purchase. Each `VendorOrder` owns vendor-specific fulfillment and financial allocation.

This structure enables:

- independent vendor fulfillment;
- vendor-specific cancellation;
- partial refunds;
- multiple shipments;
- vendor dashboards;
- platform commissions;
- vendor-level analytics.

## 11. Inventory Consistency

Inventory is server-authoritative.

Checkout uses stock reservation rather than trusting cart state.

Baseline sequence:

1. read cart;
2. revalidate product/store availability;
3. re-price server-side;
4. reserve inventory;
5. create order and vendor orders;
6. create payment intent;
7. confirm payment server-side;
8. commit reservation;
9. release reservation when payment fails/expires.

Reservation and stock transitions must be concurrency-safe and idempotent.

## 12. Payment Architecture

CartNest exposes a provider-neutral payment domain.

```text
Order
  -> PaymentIntent
      -> PaymentAttempt (Paystack)
      -> PaymentAttempt (Flutterwave if safe)
```

The browser never determines final payment success.

Payment success requires server-side evidence such as:

- verified provider webhook signature;
- provider transaction reference;
- expected amount match;
- expected currency match;
- expected payment intent/order match;
- optional provider verification API confirmation.

Ambiguous provider outcomes must be reconciled before another attempt can risk a second charge.

## 13. Monetary Representation

Financial values use an explicit `Money` representation.

Baseline:

```text
{
  amountMinor: "5000000",
  currency: "NGN"
}
```

`5,000,000` kobo represents `₦50,000.00`.

Rules:

- no floating-point persistence for accounting values;
- backend recalculates totals;
- order lines snapshot historical price;
- fees/discounts/refunds remain separate components;
- allocation and rounding are deterministic.

## 14. Product and Store Media

Media binary content is not stored in PostgreSQL.

The backend coordinates upload authorization and persists media metadata, while binary objects live in S3-compatible storage.

Stored metadata may include:

- object key;
- public/derived URL;
- MIME type;
- size;
- dimensions;
- alt text;
- ordering;
- owner product/store;
- status.

## 15. External Integration Boundary

Every external provider must be behind an adapter.

Examples:

```text
payments/
  PaystackAdapter
  FlutterwaveAdapter

logistics/
  GigLogisticsAdapter
  FutureProviderAdapter

notifications/
  EmailProvider
  SmsProvider

media/
  ObjectStorageAdapter
```

Business modules must not spread provider-specific payload formats throughout the application.

## 16. Observability and Audit

Every request should have a correlation/request ID.

High-risk actions should produce audit records, especially:

- login/session security events;
- vendor approvals/suspensions;
- staff permission changes;
- product moderation;
- inventory adjustments;
- order status overrides;
- payment state transitions;
- refunds;
- admin actions.

Application logs and audit logs are related but are not the same thing.

## 17. Failure Strategy

The architecture assumes failures happen.

Required patterns include:

- idempotency keys for retry-sensitive mutations;
- transactional DB boundaries;
- webhook deduplication;
- safe external retries;
- explicit state machines;
- timeout handling;
- reconciliation for ambiguous payments;
- deterministic inventory transitions;
- user-safe error contracts.

## 18. Deployment Baseline

Initial production deployment may run as:

```text
Reverse proxy / edge
  -> Next.js container/service
  -> Fastify container/service
  -> PostgreSQL
  -> object storage
```

The modular monolith does not require separate deployment per business module.

Components may be extracted later only when justified by scale, ownership, reliability, or operational isolation.

## 19. Scalability Principles

Scale the bottleneck rather than prematurely distributing everything.

Likely future extraction candidates:

- asynchronous notifications;
- product search/indexing;
- analytics/reporting;
- media processing;
- payment reconciliation workers.

Core order/payment/inventory invariants should remain strongly coordinated until there is a clear need for distribution.

## 20. Architecture Quality Gates

Before a feature is complete:

- [ ] contracts are defined;
- [ ] runtime validation is active;
- [ ] authorization scope is enforced;
- [ ] persistence does not leak to frontend types;
- [ ] retries are safe where applicable;
- [ ] financial/inventory invariants are tested;
- [ ] observability is sufficient;
- [ ] module boundaries are respected;
- [ ] OpenAPI is updated/generated;
- [ ] typed client compiles;
- [ ] relevant tests pass.

## 21. Related Documents

Read this document together with all ADRs, the API design specification, security standard, engineering standards, and database/domain model.
