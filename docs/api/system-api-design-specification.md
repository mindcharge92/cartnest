# System API Design Specification

**Status:** Baseline design before implementation  
**API style:** REST + JSON + OpenAPI  
**Version prefix:** Proposed `/api/v1`

## 1. Purpose

This document translates CartNest product and architecture decisions into an API resource model and endpoint plan.

It is not a final OpenAPI file. The executable OpenAPI document will be generated from Fastify TypeBox route schemas.

## 2. Global Conventions

### Base path

```text
/api/v1
```

### Media type

```text
application/json
```

except multipart/presigned media workflows and provider webhooks.

### Authentication

Protected browser API calls use the session strategy defined by ADR-004.

### Request ID

Responses should expose/return a request ID for traceability where practical.

### Idempotency

Retry-sensitive mutations accept:

```text
Idempotency-Key: <opaque value>
```

### Error envelope

All application errors follow the common typed error contract.

## 3. Resource Naming

Use plural nouns:

```text
/products
/orders
/vendors
/stores
```

Use nested resources only when ownership/context meaning is strong.

Avoid RPC-style URLs for ordinary CRUD. Use action endpoints only for business commands/state transitions where a resource update would be ambiguous.

Examples:

```text
POST /vendors/{vendorId}/approve
POST /orders/{orderId}/cancel
POST /refunds
```

## 4. Pagination

Baseline page pagination for administrative/list UIs:

```text
?page=1&pageSize=20
```

Response:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

High-volume search/feed endpoints may later adopt cursor pagination.

## 5. Auth API

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/auth/register` | customer/account registration | Public |
| POST | `/auth/login` | authenticate | Public |
| POST | `/auth/refresh` | rotate/renew session | Session |
| POST | `/auth/logout` | revoke current session | Auth |
| POST | `/auth/logout-all` | revoke user's sessions | Auth |
| GET | `/auth/me` | current principal/session capabilities | Auth |
| POST | `/auth/forgot-password` | start recovery | Public |
| POST | `/auth/reset-password` | complete recovery | Public/token |

Potential verification endpoints are added if email/phone verification is confirmed.

## 6. User/Profile API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/users/me` | own profile |
| PATCH | `/users/me` | update allowed profile fields |
| GET | `/users/me/addresses` | list addresses |
| POST | `/users/me/addresses` | create address |
| PATCH | `/users/me/addresses/{addressId}` | update own address |
| DELETE | `/users/me/addresses/{addressId}` | remove own address |

## 7. Vendor API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/vendors` | apply/create vendor profile |
| GET | `/vendors/me` | current user's vendor memberships |
| GET | `/vendors/{vendorId}` | authorized vendor details |
| PATCH | `/vendors/{vendorId}` | update authorized vendor profile |
| GET | `/vendors/{vendorId}/members` | list staff |
| POST | `/vendors/{vendorId}/members` | invite/add staff |
| PATCH | `/vendors/{vendorId}/members/{memberId}` | change role/permissions/status |
| DELETE | `/vendors/{vendorId}/members/{memberId}` | remove membership |

## 8. Store API

Public:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores` | discover active stores |
| GET | `/stores/{storeSlug}` | public storefront |

Vendor:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/vendors/{vendorId}/stores` | create store |
| GET | `/vendors/{vendorId}/stores` | list owned stores |
| PATCH | `/stores/{storeId}` | update authorized store |
| POST | `/stores/{storeId}/media` | attach approved media metadata |

Whether a vendor may own multiple stores remains a business decision; endpoint design supports it.

## 9. Categories

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/categories` | public category tree/list |
| GET | `/categories/{categoryId}` | category details |

Category creation/management is expected to be admin-controlled unless later vendor-managed subcategories are approved.

## 10. Products

Public:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/products` | search/filter/sort products |
| GET | `/products/{productId}` | product detail |

Vendor:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/stores/{storeId}/products` | create product |
| PATCH | `/products/{productId}` | update authorized product |
| POST | `/products/{productId}/archive` | archive product |
| POST | `/products/{productId}/variants` | create variant |
| PATCH | `/product-variants/{variantId}` | update variant |

Example filters:

```text
category
store
q
minPrice
maxPrice
inStock
sort
page
pageSize
```

Sortable/filter fields must be allowlisted.

## 11. Product Media

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/media/uploads` | create authorized upload intent |
| POST | `/media/uploads/{uploadId}/complete` | confirm/verify upload |
| DELETE | `/media/{mediaId}` | detach/delete authorized media |
| PATCH | `/media/{mediaId}` | alt text/order metadata |

Binary upload may go directly to object storage using presigned data.

## 12. Inventory

Vendor-only:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores/{storeId}/inventory` | list inventory |
| GET | `/inventory/{variantId}` | authorized inventory item |
| POST | `/inventory/{variantId}/adjustments` | manual stock adjustment |
| GET | `/inventory/{variantId}/adjustments` | audit stock movement |

Customer APIs should expose availability, not privileged stock internals unless product UX explicitly requires numeric stock.

## 13. Wishlist

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/wishlist` | own wishlist |
| POST | `/wishlist/items` | add product/variant |
| DELETE | `/wishlist/items/{itemId}` | remove |

Exact wishlist entity model is still to be added to the DB specification before implementation.

## 14. Cart

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/cart` | current cart |
| POST | `/cart/items` | add item |
| PATCH | `/cart/items/{itemId}` | change quantity |
| DELETE | `/cart/items/{itemId}` | remove item |
| DELETE | `/cart` | clear cart |

Cart responses may include price estimates, but checkout recalculates authoritative totals.

## 15. Checkout

Recommended command-oriented endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/checkout/preview` | reprice/revalidate cart and calculate delivery/totals |
| POST | `/checkout` | create order + vendor orders + inventory reservations |
| POST | `/orders/{orderId}/payment-intents` | initialize/retrieve payment intent |

`POST /checkout` requires idempotency.

## 16. Customer Orders

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/orders` | own orders |
| GET | `/orders/{orderId}` | own order detail |
| POST | `/orders/{orderId}/cancel` | request allowed cancellation |

Order detail shows vendor-order sections and shipment tracking.

## 17. Vendor Orders

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vendor-orders` | vendor-scoped order list |
| GET | `/vendor-orders/{vendorOrderId}` | authorized vendor order |
| POST | `/vendor-orders/{vendorOrderId}/accept` | accept fulfillment |
| POST | `/vendor-orders/{vendorOrderId}/process` | begin processing |
| POST | `/vendor-orders/{vendorOrderId}/ship` | mark/coordinate shipment |

Exact transition commands must match ADR-006 state machine.

## 18. Payments

Customer-safe:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/orders/{orderId}/payments` | own payment status/history allowed to customer |
| GET | `/payment-intents/{paymentIntentId}` | safe current status |

Do not expose provider secret payloads.

Provider webhooks:

```text
POST /webhooks/payments/paystack
POST /webhooks/payments/flutterwave
```

These are authenticated by provider signature, not customer session.

## 19. Refunds

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/refunds` | create authorized refund request |
| GET | `/refunds/{refundId}` | view authorized refund |
| GET | `/orders/{orderId}/refunds` | list relevant refunds |

Who may create a refund depends on final customer/vendor/admin policy.

Financial completion is provider-confirmed, not merely request-created.

## 20. Logistics / Shipments

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/vendor-orders/{vendorOrderId}/shipments` | book/create shipment |
| GET | `/shipments/{shipmentId}` | authorized shipment |
| GET | `/orders/{orderId}/shipments` | customer order tracking |
| POST | `/webhooks/logistics/{provider}` | provider updates if supported |

MVP proposal specifically references mock GIG Logistics integration.

## 21. Reviews

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/products/{productId}/reviews` | public approved reviews |
| POST | `/products/{productId}/reviews` | eligible buyer creates review |
| PATCH | `/reviews/{reviewId}` | own review if policy allows |
| DELETE | `/reviews/{reviewId}` | own review/soft-delete if policy allows |

Review eligibility should be tied to actual purchase/delivery policy when confirmed.

## 22. Vendor Analytics

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/vendors/{vendorId}/analytics/summary` | vendor KPIs |
| GET | `/vendors/{vendorId}/analytics/sales` | sales series |
| GET | `/vendors/{vendorId}/analytics/products` | product performance |

Analytics are read models and should not become the source of financial truth.

## 23. Admin API

Representative endpoints:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/vendors` | review vendors |
| POST | `/admin/vendors/{vendorId}/approve` | approve vendor |
| POST | `/admin/vendors/{vendorId}/suspend` | suspend vendor |
| GET | `/admin/users` | user oversight |
| POST | `/admin/users/{userId}/suspend` | suspend user |
| GET | `/admin/products` | moderation queue/oversight |
| POST | `/admin/products/{productId}/moderate` | moderation decision |
| GET | `/admin/orders` | order oversight |
| GET | `/admin/payments` | payment monitoring |
| GET | `/admin/refunds` | refund oversight |
| GET | `/admin/analytics/summary` | platform metrics |
| GET | `/admin/audit-logs` | protected audit viewer |

All admin operations require explicit permission and audit logging.

## 24. HTTP Status Guidance

| Status | Meaning |
| --- | --- |
| 200 | successful read/update/action |
| 201 | resource created |
| 202 | accepted asynchronous/processing operation |
| 204 | successful no-content operation |
| 400 | invalid request |
| 401 | not authenticated |
| 403 | authenticated but not permitted |
| 404 | resource unavailable/not found |
| 409 | business conflict/state conflict/idempotency conflict |
| 422 | optional policy for semantically invalid data if standardized project-wide |
| 429 | rate limited |
| 500 | unexpected internal failure |
| 502/503 | external dependency/service unavailable according to policy |

Pick one consistent validation policy (400 vs 422) before implementation.

## 25. Money in API

Use shared money schema.

Example:

```json
{
  "amountMinor": "5000000",
  "currency": "NGN"
}
```

Never return Prisma `bigint` directly.

## 26. Timestamps

Use ISO 8601 strings.

Example:

```text
2026-09-05T00:30:00Z
```

## 27. Resource Ownership

Every vendor/store/product/inventory/vendor-order endpoint must enforce server-side vendor membership and permission.

Customer resources must enforce user ownership.

Admin override must be explicit and audited.

## 28. OpenAPI Requirements

Every implemented route should include:

- tags;
- operation ID;
- summary;
- auth requirement;
- path/query/body schemas;
- success response schemas;
- known error response schemas.

OpenAPI output drives documentation and typed client generation.

## 29. API Design Items Still Open

- email vs phone identity requirements;
- one vs multiple stores per vendor;
- review eligibility;
- refund initiation roles;
- delivery fee calculation;
- tax/VAT rules;
- payout/settlement endpoints;
- notifications/preferences;
- dispute-resolution workflow;
- seller-rating model separate from reviews.

These must be resolved before the affected endpoint becomes final.
