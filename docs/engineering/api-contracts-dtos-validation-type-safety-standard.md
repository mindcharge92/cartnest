# API Contracts, DTOs, Validation & Type-Safety Standard

**Status:** Approved implementation baseline  
**Applies to:** all REST endpoints, shared contracts, Fastify validation, OpenAPI, typed API-client generation, and frontend/backend integration  
**Related:** ADR-001

## 1. Purpose

This standard defines how CartNest designs, names, validates, exposes, consumes, tests, documents, and evolves API contracts.

The architectural decision is simple:

```text
TypeBox runtime schema
        |
        +--> inferred TypeScript DTO
        +--> Fastify request/response validation
        +--> OpenAPI
        +--> typed API client
```

The goal is one transport source of truth rather than manually synchronized interfaces across frontend and backend.

## 2. Scope

This standard covers:

- path parameters;
- query parameters;
- request bodies;
- request headers where application-specific;
- success responses;
- error responses;
- pagination;
- shared value schemas;
- authentication-related transport data;
- TypeBox authoring;
- Fastify type-provider usage;
- OpenAPI generation;
- typed client generation;
- mapping between Prisma/domain models and API DTOs.

## 3. Core Principles

| Principle | Standard |
| --- | --- |
| Contract first at the boundary | Define what the route accepts/returns before implementing handler details |
| One transport source of truth | TypeBox schema is authoritative; DTO type is inferred |
| Runtime validation | Every untrusted HTTP boundary is validated |
| Persistence isolation | Prisma models are internal and not frontend contracts |
| Typed client | Frontend uses approved client rather than duplicated endpoint types |
| Errors are contracts | Stable error envelopes/codes are typed and documented |
| Generated output is derived | OpenAPI/client output is never manually edited as a competing source |
| Security by allowlist | Response DTOs intentionally expose fields |

## 4. Recommended Package Structure

```text
packages/contracts/
  src/
    common/
      errors.ts
      money.ts
      pagination.ts
      identifiers.ts
      timestamps.ts
    auth/
    users/
    vendors/
    stores/
    products/
    inventory/
    cart/
    orders/
    payments/
    logistics/
    reviews/
    admin/
    index.ts

packages/api-client/
  src/
    generated/
    transport/
    errors/
    index.ts
```

Contracts are transport definitions. They do not contain business services or Prisma repositories.

## 5. Dependency Rules

| Layer | May Depend On | Must Not Depend On |
| --- | --- | --- |
| `apps/web` | api-client, approved contracts, UI/config | database, Fastify internals |
| `apps/api` | contracts, database, server config | frontend UI/features |
| `@repo/api-client` | generated API/OpenAPI types, transport helpers | database/business services |
| `@repo/contracts` | schema/runtime dependencies | Prisma, Fastify app instance, Next.js |
| `@repo/database` | Prisma/database dependencies | frontend/API-client code |

## 6. Schema-First DTO Rule

Bad:

```ts
// web
interface CreateProductDto {
  name: string;
  price: number;
}

// api — duplicate
interface CreateProductDto {
  name: string;
  price: number;
}
```

Required:

```ts
import { Static, Type } from "@sinclair/typebox";

export const CreateProductBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 160 }),
  description: Type.Optional(Type.String({ maxLength: 5000 })),
  price: MoneySchema,
  categoryId: IdSchema,
});

export type CreateProductBodyDto =
  Static<typeof CreateProductBodySchema>;
```

The TypeBox schema is the runtime and compile-time source of truth.

## 7. Naming Conventions

Use names that describe direction and purpose.

| Purpose | Schema | Inferred Type |
| --- | --- | --- |
| create body | `CreateProductBodySchema` | `CreateProductBodyDto` |
| update body | `UpdateProductBodySchema` | `UpdateProductBodyDto` |
| route params | `ProductParamsSchema` | `ProductParamsDto` |
| list query | `ListProductsQuerySchema` | `ListProductsQueryDto` |
| detail response | `ProductResponseSchema` | `ProductResponseDto` |
| list item | `ProductListItemSchema` | `ProductListItemDto` |
| paginated response | `PaginatedProductsResponseSchema` | `PaginatedProductsResponseDto` |
| common error | `ApiErrorResponseSchema` | `ApiErrorResponseDto` |

Avoid vague names such as `ProductData`, `Payload`, or `ResponseData` without context.

## 8. Optional vs Nullable

Treat them differently.

Optional:

```text
field may be absent
```

Nullable:

```text
field may be present with null as a meaningful value
```

Do not make everything nullable to avoid thinking about lifecycle semantics.

## 9. Request Body Rules

- accept only fields the caller is allowed to control;
- do not accept ownership fields when ownership comes from authenticated context;
- do not accept audit timestamps from ordinary clients;
- do not accept payment verification state from browser clients;
- use separate create/update schemas where semantics differ;
- partial update contracts must define omitted-field behavior;
- constrain strings, arrays, integers, enums, and sizes deliberately.

Example: a vendor creating a product must not choose an arbitrary `vendorId` to bypass ownership. The server derives allowed store/vendor scope from the authenticated principal.

## 10. Path Parameter Rules

- define explicit schemas;
- use opaque stable IDs;
- validate known identifier format when a standard is chosen;
- never infer permission from the fact that a resource ID is syntactically valid.

## 11. Query Parameter Rules

List/search contracts must define:

- pagination defaults;
- maximum page size;
- filter fields;
- allowed sort fields;
- sort direction;
- search semantics where relevant.

Never accept raw database column names, SQL fragments, or provider query syntax from clients.

## 12. Response DTO Rules

Every public response is intentional.

Do not:

```ts
return reply.send(prismaProduct);
```

Instead:

```ts
return reply.send(toProductResponse(product));
```

Response DTOs protect the API from persistence details and sensitive leakage.

Fields commonly excluded from public responses include:

- password hashes;
- refresh/session secrets;
- provider secrets;
- internal moderation notes;
- cost price where private;
- fraud/risk metadata;
- private audit metadata;
- internal DB-only fields.

## 13. Prisma -> Domain -> DTO

Preferred conceptual flow:

```text
Prisma persistence record
       |
       v
Application/domain representation
       |
       v
Response mapper/presenter
       |
       v
Public response DTO
```

A dedicated domain model is not mandatory for every trivial read, but public transport must remain explicit.

## 14. Special Wire Types

### Date/time

Transport as ISO 8601 string.

```text
2026-09-05T00:30:00Z
```

### Money

Use the shared Money contract from ADR-005.

```json
{
  "amountMinor": "5000000",
  "currency": "NGN"
}
```

### BigInt

Do not send native JavaScript bigint in JSON. Convert to the approved string representation.

### Prisma Decimal

Map to the approved transport representation; do not leak Prisma's Decimal type.

### Enums

Use explicit stable string values.

### Files

Binary uploads use the media/upload contract, not ordinary JSON DTOs.

## 15. Fastify Route Standard

Every route should reference schemas for relevant input/output positions.

```ts
fastify.get(
  "/products/:productId",
  {
    schema: {
      params: ProductParamsSchema,
      response: {
        200: ProductResponseSchema,
        404: ApiErrorResponseSchema,
      },
    },
  },
  async (request, reply) => {
    const product = await productService.getById(
      request.params.productId
    );

    if (!product) {
      return reply.code(404).send(
        apiError("PRODUCT_NOT_FOUND", "Product not found", request.id)
      );
    }

    return reply.send(toProductResponse(product));
  }
);
```

## 16. Fastify Type Provider

Configure the Fastify application so TypeBox schemas provide handler inference.

Developers should not routinely write:

```ts
request.body as CreateProductBodyDto
```

to silence type errors.

If route inference is missing, fix schema/type-provider wiring rather than duplicating types.

## 17. OpenAPI / Swagger

OpenAPI output is generated from implemented route schemas.

Routes should define, where applicable:

- tags;
- operation ID;
- summary/description;
- authentication/security requirement;
- input schemas;
- success responses;
- known error responses.

Swagger UI is a developer-facing representation, not an independent source of truth.

## 18. Typed API Client

`@repo/api-client` is the supported frontend network integration surface.

It should be generated or mechanically derived from OpenAPI/route contracts.

Responsibilities include:

- base URL configuration;
- typed path/query/body inputs;
- typed success/error responses;
- cookie/credential settings;
- standard headers;
- request IDs where required;
- abort/cancellation support where available;
- error normalization.

Generated files must not contain application business rules.

## 19. Frontend Consumption Pattern

Prefer feature-level wrappers around generated transport calls.

```ts
export async function createProduct(input: CreateProductBodyDto) {
  const result = await api.POST("/products", {
    body: input,
  });

  if (result.error) {
    throw normalizeApiError(result.error);
  }

  return result.data;
}
```

React components should not rebuild endpoint URL/header/error behavior repeatedly.

## 20. Forbidden Client Patterns

- duplicate API response interfaces inside frontend features;
- Prisma imports in frontend;
- manual edits to generated client output;
- arbitrary raw `fetch()` for an endpoint already represented by the approved client without an explicit reason;
- parsing human-readable error messages to control application logic;
- storing server secrets in client configuration.

## 21. Error Contract

Baseline envelope:

```ts
export const ApiErrorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    requestId: Type.String(),
    details: Type.Optional(Type.Unknown()),
  }),
});
```

Example codes:

```text
VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
PRODUCT_NOT_FOUND
INSUFFICIENT_STOCK
STORE_SLUG_TAKEN
RATE_LIMITED
INTERNAL_ERROR
```

The code is stable and machine-readable. The message is safe for the consumer. `details` must never expose secrets/stack traces.

## 22. Pagination Standard

Baseline response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 184,
    "totalPages": 10
  }
}
```

Rules:

- set maximum page size;
- whitelist sort/filter fields;
- do not expose DB query syntax;
- cursor pagination can be introduced for specific high-volume feeds through its own contract.

## 23. Authentication and Authorization Contracts

Authentication data is transport data, but authorization decisions stay backend-side.

A valid DTO does not imply permission.

Vendor/store ownership is server-derived, not trusted from client-provided IDs.

Admin response DTOs may expose fields ordinary vendor/customer responses do not.

## 24. Multi-Vendor Contract Rules

- vendor/store scope is always server-verified;
- vendor A cannot manipulate vendor B products, inventory, orders, staff, or payments by changing IDs;
- admin contracts may expose moderation fields that buyer/vendor DTOs do not;
- product DTOs distinguish vendor-controlled content from platform-controlled moderation/status data;
- order DTOs represent parent and vendor-order boundaries clearly;
- payment/payout contracts remain separate when vendor settlement is introduced.

## 25. API Versioning

Versioning follows ADR-008.

Breaking changes include:

- removing/renaming fields;
- changing representation/meaning;
- making optional input required;
- narrowing enum values;
- changing authentication requirements;
- changing relied-upon status semantics.

Additive optional fields are normally non-breaking.

## 26. Testing

Required test categories:

| Level | Purpose |
| --- | --- |
| schema tests | validation constraints and wire rules |
| route integration | Fastify validation/auth/response behavior |
| mapper tests | persistence/domain data maps safely to public DTO |
| typed-client compile | contract changes propagate to consumers |
| OpenAPI verification | generated spec is reproducible and complete |
| E2E | web -> API -> DB workflows remain compatible |

## 27. CI Quality Gates

Before merge:

- [ ] contracts typecheck;
- [ ] API typechecks;
- [ ] frontend/client typechecks;
- [ ] schema tests pass;
- [ ] integration tests pass;
- [ ] OpenAPI generation succeeds;
- [ ] typed client generation succeeds;
- [ ] generated output is not stale;
- [ ] frontend builds against current client;
- [ ] dependency rules are respected.

## 28. Code Review Checklist

- [ ] is a TypeBox schema the source of truth?;
- [ ] is the DTO inferred rather than duplicated?;
- [ ] does Fastify declare relevant input/output schemas?;
- [ ] are authorization/ownership checks separate from validation?;
- [ ] is any Prisma record returned directly?;
- [ ] can the response leak private/internal fields?;
- [ ] does the typed client regenerate/compile?;
- [ ] are error codes stable?;
- [ ] are money/date/bigint/nullability semantics explicit?;
- [ ] are tests and OpenAPI updated?

## 29. Vertical Slice: Create Product

```text
packages/contracts/src/products/
  create-product.contract.ts

apps/api/src/modules/catalog/
  product.routes.ts
  application/create-product.use-case.ts
  infrastructure/prisma-product.repository.ts
  presentation/product.mapper.ts

packages/api-client/
  generated/
  transport/

apps/web/src/features/products/
  api/create-product.ts
  hooks/use-create-product.ts
  components/product-form.tsx
```

Flow:

```text
form
 -> typed API client
 -> Fastify TypeBox validation
 -> authentication/ownership
 -> create-product use case
 -> Prisma repository
 -> response mapper
 -> response validation
 -> typed client result
 -> UI
```

## 30. Anti-Patterns

| Anti-Pattern | Required Replacement |
| --- | --- |
| duplicate frontend/backend DTO interfaces | shared TypeBox schema + inferred type |
| ORM-as-API | explicit response DTO mapping |
| TypeScript-only validation | runtime Fastify schema validation |
| scattered raw fetch | typed API client |
| manual generated-file edits | fix source and regenerate |
| UI-only authorization | backend authorization/ownership checks |
| arbitrary error shapes | common typed error envelope |

## 31. Initial Implementation Checklist

- [ ] create `packages/contracts`;
- [ ] configure TypeBox;
- [ ] configure Fastify TypeBox type provider;
- [ ] define common ID, timestamp, Money, error, and pagination schemas;
- [ ] implement one full vertical slice;
- [ ] configure OpenAPI/Swagger;
- [ ] create `packages/api-client`;
- [ ] choose OpenAPI-derived client generator/transport;
- [ ] add generation tasks to Turborepo;
- [ ] use typed client from Next.js;
- [ ] add generation/typecheck tests to CI;
- [ ] enforce dependency boundaries.

## 32. Enforcement Summary

New API work is compliant only when transport schemas are authoritative, runtime validation is active, public responses are explicit, the typed client reflects the contract, and frontend code does not duplicate backend/database types. Exceptions require an explicit architecture decision rather than silent divergence.
