# ADR-008: API Versioning and Compatibility

**Status:** Proposed baseline  
**Date:** 5 September 2026

## Context

CartNest will initially have only first-party web consumers, but the architecture is expected to support future mobile applications, partner integrations, vendor tools, administrative tooling, and potentially public APIs.

Once an external or independently deployed consumer depends on an API contract, breaking changes become costly.

## Decision

Adopt explicit REST API versioning from the beginning using a path prefix:

```text
/api/v1/...
```

Internal webhook endpoints may use a separate stable namespace:

```text
/webhooks/payments/paystack
/webhooks/payments/flutterwave
```

OpenAPI documents must identify the API version.

The project will treat compatibility as a contract concern, not merely a URL concern.

## Compatibility Rules

### Non-breaking changes

Usually non-breaking:

- adding a new endpoint;
- adding an optional request field;
- adding an optional response field;
- adding a new error code only where consumers are required to handle unknown codes generically;
- widening an accepted input range when semantics remain unchanged.

### Breaking changes

Breaking:

- removing or renaming fields;
- changing a field type or representation;
- changing a field's business meaning;
- making an optional input required;
- removing enum values;
- changing authentication requirements;
- changing status-code semantics;
- changing pagination semantics;
- changing money representation;
- changing resource identity semantics.

## First-Party Monorepo Changes

While Next.js and Fastify deploy atomically and no external consumers exist, a breaking `v1` contract may be migrated in one repository change if:

1. backend contract changes;
2. OpenAPI is regenerated;
3. typed client is regenerated;
4. all first-party consumers are updated;
5. automated tests pass.

This does not grant permission to break documented third-party contracts later.

## When to Introduce `/v2`

Create a new major version when:

- external consumers cannot be migrated atomically;
- compatibility shims would create excessive ambiguity;
- the resource model changes fundamentally;
- financial or security semantics materially change.

Do not create `/v2` merely for additive enhancements.

## Deprecation Policy

When external consumers exist:

1. document deprecation;
2. expose a replacement;
3. provide a migration window;
4. monitor old-version usage;
5. remove only after communicated deadline.

## OpenAPI

Maintain one OpenAPI document per active major version or one document with clearly versioned server/path definitions.

Generated typed clients must target an explicit API version.

## Consequences

Positive:

- future mobile/partner clients have a stable evolution model;
- endpoints are clearly namespaced;
- migration policy is documented early.

Trade-offs:

- version discipline is required;
- old versions may need temporary support.

## Decision to Confirm Before Public API Launch

- exact deprecation duration;
- whether partner APIs use the same `/api/v1` namespace or a dedicated namespace;
- whether response headers advertise deprecation/sunset dates.
