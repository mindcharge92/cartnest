# CartNest Engineering Documentation

CartNest is a multi-vendor e-commerce marketplace designed for Nigerian businesses. This documentation set defines the product scope, architecture, API conventions, security model, financial rules, data model, engineering standards, and implementation constraints before production code is introduced.

## Baseline Technology Stack

- **Frontend:** Next.js + TypeScript
- **Backend:** Fastify + TypeScript
- **Repository:** Turborepo monorepo
- **Architecture:** Modular monolith
- **Database:** PostgreSQL + Prisma
- **API style:** REST + OpenAPI
- **Runtime contracts:** TypeBox schemas
- **Frontend/backend consistency:** Shared contracts + typed API client
- **Payments:** Paystack + Flutterwave abstraction
- **Deployment baseline:** Dockerized services on cloud/VPS infrastructure

## Documentation Map

### Product
- [`product/feature-specification.md`](product/feature-specification.md) — extracted and refined platform feature scope.

### Architecture
- [`architecture/system-architecture.md`](architecture/system-architecture.md) — system-wide architecture and runtime boundaries.
- [`architecture/adr/ADR-001-shared-api-contracts-runtime-validation-and-typed-client.md`](architecture/adr/ADR-001-shared-api-contracts-runtime-validation-and-typed-client.md)
- [`architecture/adr/ADR-002-modular-monolith-architecture-and-module-boundaries.md`](architecture/adr/ADR-002-modular-monolith-architecture-and-module-boundaries.md)
- [`architecture/adr/ADR-003-turborepo-monorepo-architecture-and-package-boundaries.md`](architecture/adr/ADR-003-turborepo-monorepo-architecture-and-package-boundaries.md)
- [`architecture/adr/ADR-004-authentication-session-security-rbac-and-ownership.md`](architecture/adr/ADR-004-authentication-session-security-rbac-and-ownership.md)
- [`architecture/adr/ADR-005-money-currency-pricing-fees-and-rounding.md`](architecture/adr/ADR-005-money-currency-pricing-fees-and-rounding.md)
- [`architecture/adr/ADR-006-multi-vendor-checkout-and-order-architecture.md`](architecture/adr/ADR-006-multi-vendor-checkout-and-order-architecture.md)
- [`architecture/adr/ADR-007-payment-gateway-abstraction-webhooks-idempotency-and-refunds.md`](architecture/adr/ADR-007-payment-gateway-abstraction-webhooks-idempotency-and-refunds.md)
- [`architecture/adr/ADR-008-api-versioning-and-compatibility.md`](architecture/adr/ADR-008-api-versioning-and-compatibility.md)
- [`architecture/adr/ADR-009-product-media-upload-and-object-storage.md`](architecture/adr/ADR-009-product-media-upload-and-object-storage.md)
- [`architecture/adr/ADR-010-idempotency-concurrency-and-retry-safety.md`](architecture/adr/ADR-010-idempotency-concurrency-and-retry-safety.md)

### Engineering Standards
- [`engineering/api-contracts-dtos-validation-type-safety-standard.md`](engineering/api-contracts-dtos-validation-type-safety-standard.md)
- [`engineering/backend-engineering-standard.md`](engineering/backend-engineering-standard.md)
- [`engineering/frontend-engineering-standard.md`](engineering/frontend-engineering-standard.md)
- [`engineering/error-handling-standard.md`](engineering/error-handling-standard.md)
- [`engineering/testing-and-quality-standard.md`](engineering/testing-and-quality-standard.md)

### API
- [`api/system-api-design-specification.md`](api/system-api-design-specification.md)

### Security
- [`security/authentication-authorization-security-standard.md`](security/authentication-authorization-security-standard.md)

### Data
- [`data/database-and-domain-model-specification.md`](data/database-and-domain-model-specification.md)

## Documentation Status

Some documents are **accepted baselines** and some are **proposed baselines**. A proposed baseline means the design is sufficiently defined for planning, but one or more business decisions still need confirmation before implementation.

Before code is merged, an engineer should check the relevant ADR and living engineering standard. If implementation intentionally deviates from an accepted decision, update the ADR or create a superseding ADR rather than silently diverging.
