# ADR-001: Shared API Contracts, Runtime Validation, and Typed API Client

**Status:** Accepted  
**Decision Date:** 4 September 2026  
**Architecture:** Next.js + Fastify + Turborepo + PostgreSQL/Prisma + Modular Monolith  
**Scope:** Frontend/backend API boundary, validation, DTOs, OpenAPI, and typed client

## Decision Summary

All external API request and response shapes will be defined as runtime-validatable TypeBox schemas in a shared Turborepo contracts package. TypeScript DTO types will be inferred from those schemas. Fastify will validate requests and responses using the TypeBox type provider. OpenAPI documentation will be generated from the same route contracts, and the Next.js frontend will consume the API through a typed API client package rather than duplicating endpoint types or manually maintaining raw fetch calls.

## 1. Context

The platform is a TypeScript-based multi-vendor e-commerce system with a Next.js frontend and Fastify backend inside a Turborepo monorepo. The system will expose a REST API, persist transactional data in PostgreSQL through Prisma, and follow a modular monolith architecture. Because frontend and backend are developed together but execute in different runtimes, compile-time TypeScript types alone cannot guarantee that data crossing the HTTP boundary is valid.

The project therefore needs a single, explicit mechanism for keeping request payloads, response payloads, validation rules, API documentation, and frontend consumption aligned. The mechanism must remain useful as the number of domains grows to include authentication, users, vendors, stores, products, inventory, carts, orders, payments, logistics, reviews, analytics, administration, and compliance.

## 2. Problem Statement

- Plain TypeScript interfaces disappear at runtime and cannot reject malformed HTTP input.
- Duplicating DTO definitions in both frontend and backend creates drift and inconsistent assumptions.
- Returning Prisma models directly exposes persistence concerns and can leak internal or sensitive fields.
- Hand-written fetch wrappers often lose endpoint-level type safety for paths, parameters, request bodies, status codes, and response bodies.
- Swagger/OpenAPI documentation becomes unreliable if it is maintained separately from actual route validation.
- A large multi-vendor platform requires predictable patterns that every module can follow without inventing its own API conventions.

## 3. Decision Drivers

| Driver | Requirement |
| --- | --- |
| Single source of truth | Request and response shapes should be authored once and reused across validation, typing, documentation, and client consumption. |
| Runtime safety | The backend must validate untrusted input at the HTTP boundary. |
| End-to-end TypeScript safety | The frontend should receive compile-time feedback when an endpoint contract changes. |
| Fastify alignment | The approach should work naturally with Fastify's schema-driven architecture and JSON Schema ecosystem. |
| OpenAPI compatibility | API documentation must be generated from implementation-adjacent schemas. |
| Modular ownership | Each business module must own its contracts without creating circular dependencies. |
| Security and minimisation | API responses expose intentional DTOs, not database records. |
| Maintainability | New developers should follow one consistent, testable pattern. |

## 4. Decision

The project adopts the following contract architecture:

1. **Shared contract package:** create `@repo/contracts`, containing TypeBox schemas and TypeScript types inferred from them.
2. **Schema-first DTOs:** request and response DTOs are schema-backed. The TypeBox schema is authoritative; the TypeScript type is derived.
3. **Fastify runtime validation:** use Fastify route schemas together with the TypeBox type provider for bodies, params, query strings, and responses.
4. **Explicit response DTOs:** map domain/persistence data into response DTOs. Prisma-generated types are not public API contracts.
5. **Generated OpenAPI:** generate Swagger/OpenAPI documentation from executable route schemas.
6. **Typed API client:** expose `@repo/api-client`; derive it mechanically from the API/OpenAPI contract rather than duplicating endpoint types.
7. **No frontend/database coupling:** Next.js consumes backend capabilities through the client and must not import Prisma models.
8. **Contract change discipline:** breaking DTO changes require coordinated backend, contracts, client, tests, and frontend updates.

## 5. Target Architecture

```text
Turborepo
|
+-- apps/
|   +-- web/                 Next.js
|   +-- api/                 Fastify
|
+-- packages/
|   +-- contracts/           TypeBox schemas + inferred DTO types
|   +-- api-client/          typed frontend client
|   +-- database/            Prisma schema/client/migrations
|   +-- config/
|   +-- ui/
|   +-- testing/
|
+-- docs/
    +-- architecture/
    +-- engineering/
```

API-boundary flow:

```text
Untrusted HTTP Input
        |
        v
Fastify + TypeBox validation
        |
        v
Application / Domain Service
        |
        v
Prisma / PostgreSQL
        |
        v
Domain-to-Response DTO Mapping
        |
        v
Validated API Response
        |
        v
Typed API Client
        |
        v
Next.js UI
```

## 6. Contract Source of Truth

The source of truth for transport-level data is the shared TypeBox schema. DTO remains valid terminology because it describes data crossing an application boundary, but the DTO must not be a second handwritten interface that can drift from runtime validation.

```ts
import { Static, Type } from "@sinclair/typebox";

export const CreateProductSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 160 }),
  description: Type.Optional(Type.String({ maxLength: 5000 })),
  price: Type.Number({ minimum: 0 }),
  stock: Type.Integer({ minimum: 0 }),
  categoryId: Type.String({ minLength: 1 }),
});

export type CreateProductDto = Static<typeof CreateProductSchema>;
```

**Rule:** the schema and inferred DTO type are one contract. Developers must not create a second handwritten interface with the same purpose.

## 7. Separation of Models

| Model | Purpose | May Be Exposed Directly? |
| --- | --- | --- |
| Prisma model | Persistence shape generated from database schema | No |
| Domain/application model | Internal business representation | No, unless intentionally mapped |
| Request DTO | Validated inbound API data | Yes |
| Response DTO | Intentional public outbound shape | Yes |
| Frontend view model | UI-oriented representation derived from API data | Frontend only |

## 8. Typed API Client Decision

The frontend will not treat raw `fetch()` calls as the primary integration mechanism. A dedicated API client package will encode endpoint paths, methods, request shapes, and response shapes.

Preferred implementation: derive the client from generated OpenAPI metadata so endpoint-level typing is mechanically synchronized with backend contracts.

Rules:

- generated client files are not manually edited;
- frontend imports client operations and approved public DTOs only;
- authentication, correlation IDs, base URLs, error parsing, and common transport behavior live in the client layer;
- feature components call domain-oriented client helpers/hooks rather than constructing URLs repeatedly.

Example:

```ts
const product = await api.products.create({
  body: {
    name: "Mechanical Keyboard",
    price: 85000,
    stock: 12,
    categoryId: "cat_123",
  },
});
```

## 9. Fastify Integration

Fastify's schema-driven request lifecycle is a major reason for selecting TypeBox. Route definitions reference shared schemas for params, query strings, request bodies, and responses.

```ts
fastify.post(
  "/products",
  {
    schema: {
      body: CreateProductSchema,
      response: {
        201: ProductResponseSchema,
      },
    },
  },
  async (request, reply) => {
    const product = await productService.create(request.body);
    return reply.code(201).send(toProductResponse(product));
  }
);
```

## 10. Error Contracts

Errors are part of the API contract and must be typed. Modules must not invent unrelated error response shapes.

```json
{
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product not found",
    "requestId": "req_...",
    "details": null
  }
}
```

## 11. Alternatives Considered

| Alternative | Strengths | Trade-offs | Outcome |
| --- | --- | --- | --- |
| Plain TypeScript interfaces/types | Simple | No runtime validation; drift risk | Rejected as primary approach |
| Class-based DTOs + decorators | Familiar in NestJS ecosystems | More ceremony; less natural for Fastify JSON Schema | Not selected |
| Zod | Strong runtime validation and inference | Excellent alternative, but TypeBox maps directly to JSON Schema and Fastify's schema model | Viable alternative |
| TypeBox | Runtime schemas, inferred types, JSON Schema compatibility | Requires schema discipline | Selected |
| tRPC | Strong end-to-end typing | Changes REST/OpenAPI interoperability model | Rejected for this project |
| Manual OpenAPI-first specification | Language-neutral | Can become a second source of truth | Not selected as primary authoring model |

## 12. Consequences

### Positive

- frontend and backend share a contract vocabulary without sharing database models;
- invalid HTTP data is rejected before business logic;
- documentation, validation, and TypeScript inference derive from the same schemas;
- typed client reduces endpoint-string mistakes and payload drift;
- contract changes surface as compile-time errors in consumers;
- explicit response DTOs reduce accidental data exposure.

### Costs

- contract design adds up-front structure;
- typed-client generation becomes part of development and CI;
- Date, Decimal, bigint, and file streams need deliberate wire formats;
- module and model boundaries require discipline;
- breaking changes may affect multiple packages in one pull request.

## 13. Wire-Format Rules

| Concept | API Representation | Reason |
| --- | --- | --- |
| Date/time | ISO 8601 string | JSON has no native Date type |
| Currency amount | Project-approved explicit money representation | Financial correctness |
| Prisma Decimal | Mapped transport representation | Not a browser wire type |
| bigint | String or bounded numeric representation | JSON cannot safely serialize native bigint |
| Enum | Explicit string union/schema | Stable readable transport |
| Nullable | Explicit nullable schema | Different from optional/missing |
| File upload | Dedicated upload/multipart contract | Binary payload is not ordinary JSON DTO |

## 14. Security and Privacy Implications

- response schemas act as an allowlist;
- password hashes, provider secrets, private audit data, and internal fraud signals never appear in public DTOs;
- validation does not replace authorization;
- validation errors must not reveal internal database structure;
- NDPR data-minimisation principles should be reflected in API contracts.

## 15. Testing Requirements

- contract schema tests;
- Fastify validation integration tests;
- response-leakage tests;
- reproducible client-generation checks in CI;
- compatibility tests for high-risk APIs such as auth, checkout, payments, refunds, and admin.

## 16. Change and Versioning Policy

- additive optional fields are generally non-breaking;
- removing/renaming fields, changing meaning, narrowing accepted input, or changing status semantics is breaking unless coordinated;
- breaking external changes require API-version planning;
- internal monorepo consumers may migrate atomically in one change set while no external compatibility promise exists;
- OpenAPI and typed client must regenerate whenever route contracts change.

## 17. Definition of Done

- [ ] `@repo/contracts` exists and is dependency-clean.
- [ ] Fastify uses the TypeBox type provider.
- [ ] At least one vertical slice uses shared request and response schemas.
- [ ] OpenAPI/Swagger is generated from route schemas.
- [ ] `@repo/api-client` consumes mechanically derived endpoint types.
- [ ] Next.js uses the typed client for the vertical slice.
- [ ] Prisma types are not imported into frontend code.
- [ ] contract tests and generation checks run in CI.

## 18. Final Decision Statement

Use TypeBox-backed DTO contracts in `@repo/contracts`; validate and infer them through Fastify's TypeBox integration; map persistence/domain data into explicit response DTOs; generate OpenAPI from executable route contracts; and expose a typed `@repo/api-client` to Next.js. No public API type will be defined independently in multiple layers, and Prisma models will not serve as frontend contracts.
