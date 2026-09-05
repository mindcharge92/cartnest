# P10 — Admin, Analytics, Promotions, Tax, and Notifications Status

**Phase:** P10  
**Status:** Backend/domain source baseline implemented; frontend/generated-client integration and runtime/CI execution evidence remain pending  
**Updated:** 5 September 2026

## 1. Scope

P10 closes the marketplace-management and commercial-policy gaps left by earlier phases. The implemented source baseline covers:

- privileged marketplace administration;
- platform and store analytics;
- platform-wide VAT/tax configuration;
- platform-controlled promotions/coupons;
- promotion redemption concurrency safety;
- checkout tax and discount calculation;
- line/store/order financial allocation consistency;
- customer/vendor notification orchestration;
- in-app notification inbox/read state;
- notification preferences;
- provider-neutral email/SMS queue boundary;
- notification retry/operational queries;
- stable versioned notification-template registry;
- unified admin order/payment/refund/fulfillment case view;
- P10 TypeBox/OpenAPI contracts and route tests;
- additional PostgreSQL constraint source.

Frontend/UI remains intentionally deferred until the backend phase sequence is complete. CartNest will later circle back through P2–P10 in the same phase order for Next.js UI and generated-client integration.

## 2. Admin Authorization Boundary

All platform-admin capabilities continue to use the P2 security boundary:

```text
authenticated principal
        ↓
ADMIN or SUPER_ADMIN
        ↓
privileged MFA satisfied
        ↓
admin operation
```

Read-only store analytics are also available to vendor users with the server-resolved `analytics:read` permission for that store.

No client-supplied role, vendor ID, store ID, or user ID is accepted as authorization proof.

## 3. Admin Operations Surface

P10 provides administrative list/read surfaces for:

```text
GET /api/v1/admin/analytics
GET /api/v1/admin/users
GET /api/v1/admin/orders
GET /api/v1/admin/orders/:orderId/operations
GET /api/v1/admin/payment-intents
GET /api/v1/admin/refunds
GET /api/v1/admin/tax-rates
GET /api/v1/admin/promotions
GET /api/v1/admin/notifications
```

The order operations endpoint is the primary P10 exit-gate view. It combines the commercial state of one order without requiring direct database access:

```text
Order
├── VendorOrders
│   ├── commission
│   ├── delivery
│   ├── tax
│   ├── gateway fee
│   └── fulfillment state
├── PaymentIntents
│   └── PaymentAttempts
├── PaymentAllocations
├── Refunds
├── Shipments
└── ReturnRequests
```

The response uses shared TypeBox contracts and does not expose raw Prisma models.

## 4. Platform and Store Analytics

### Platform analytics

The baseline exposes:

- registered-user count;
- approved-vendor count;
- active-store count;
- active/public-product count;
- total orders in the requested range;
- paid/refunded-payment-state orders;
- gross merchandise value;
- refunded value;
- pending return count;
- failed notification count.

### Store/vendor analytics

The baseline exposes:

- VendorOrder count;
- delivered order count;
- gross sales;
- discounts;
- tax;
- delivery charges;
- platform commission;
- gateway fees;
- refunded value.

Money remains integer minor-unit money and is converted to the public `Money` DTO rather than JavaScript floating-point values.

## 5. Tax Policy

P10 makes the previously configured tax seam executable.

`TaxRate` contains:

```text
name
rateBps
active
startsAt
endsAt
```

Rates use basis points:

```text
7.5% = 750 bps
100% = 10,000 bps
```

Tax is applied to merchandise after the applied promotion discount and currently excludes delivery:

```text
taxable merchandise
=
item subtotal - discount

Tax
=
taxable merchandise × rateBps / 10,000
```

Production checkout fails closed when no active tax policy can be resolved. Development/test environments may retain zero-value fallbacks for local work.

Admin tax changes are audited. Application logic deactivates the previous active policy transactionally, and `packages/database/prisma/sql/p10-constraints.sql` adds the reviewed PostgreSQL partial unique-index source that prevents two active platform tax policies under concurrent writes.

## 6. Promotions and Coupons

P10 implements the approved platform-controlled promotion baseline.

Supported promotion types:

```text
PERCENTAGE
FIXED_AMOUNT
```

Supported controls:

- normalized uppercase promotion code;
- active/draft/paused/expired state;
- start/end time;
- minimum order amount;
- global redemption limit;
- per-user redemption limit;
- fixed-amount currency;
- percentage value in basis points.

Checkout accepts one optional promotion code.

### Percentage promotion

A percentage promotion is applied proportionally to each participating store through each store's merchandise subtotal.

### Fixed-amount promotion

A fixed discount is deterministically distributed between stores according to store merchandise subtotal, with the final store receiving the integer remainder so total allocated discount exactly equals the approved discount.

## 7. Promotion Concurrency Safety

Pre-checking coupon availability is not considered sufficient.

During the checkout transaction CartNest locks the selected promotion and revalidates:

```text
promotion exists
        ↓
ACTIVE?
        ↓
within valid time window?
        ↓
global redemption capacity available?
        ↓
user redemption capacity available?
        ↓
create Order + PromotionRedemption atomically
```

This prevents simultaneous checkouts from casually exceeding global/per-user redemption limits.

If promotion state changes after quote generation, checkout returns a promotion revalidation conflict instead of silently changing the customer's commercial terms.

## 8. Financial Snapshot Allocation

P10 also closes the line-level tax/discount snapshot gap.

For each store:

```text
VendorOrder.itemSubtotal
-
VendorOrder.discount
+
VendorOrder.delivery
+
VendorOrder.tax
=
VendorOrder.total
```

Store discount is allocated across `OrderItem` rows using integer minor units. Tax is then allocated across the post-discount taxable bases.

Therefore:

```text
Σ OrderItem discounts = VendorOrder discount
Σ OrderItem taxes     = VendorOrder tax
Σ VendorOrders        = parent Order totals
```

The database constraint source continues to enforce the arithmetic relationships at persistence level once the reviewed migrations are applied.

## 9. Commission Interaction

P10 retains the P7 commission resolution order:

```text
vendor + category
vendor
category
platform default
```

Commission remains a separately snapshotted commercial component. In production, missing required platform commission configuration fails checkout closed rather than assuming a silent zero commission.

## 10. Notification Architecture

P10 implements the provider-neutral notification domain while preserving the design decision that no email/SMS vendor is selected merely to satisfy framework convenience.

```text
Domain/Outbox event
       ↓
notification policy
       ↓
Notification row
       ↓
IN_APP → delivered internally
EMAIL  → QUEUED for provider adapter
SMS    → QUEUED for provider adapter
       ↓
provider-neutral NotificationChannelAdapter
```

External channel adapters expose normalized results:

```text
accepted
retryable_failure
permanent_failure
```

Provider template IDs are intentionally not CartNest domain identifiers.

## 11. Implemented Notification Events

The current materialization boundary covers:

```text
order.created
payment.succeeded
shipment.delivered
refund.succeeded
return.status_changed
```

Customer and vendor recipients are resolved from trusted database relationships.

Representative stable template keys include:

```text
order.created.customer.v1
order.created.vendor.v1
payment.succeeded.customer.v1
payment.succeeded.vendor.v1
shipment.delivered.customer.v1
shipment.delivered.vendor.v1
refund.succeeded.customer.v1
refund.succeeded.vendor.v1
return.status.customer.v1
return.status.vendor.v1
```

The template registry also records priority, required/optional state, and the allowlisted variable vocabulary for each template.

## 12. Required vs Optional Notifications

Required service/payment/security notices are not disabled by ordinary notification preferences.

Optional preferences support:

```text
channel
scopeKey
enabled
```

SMS is opt-in by default for optional notices. In-app/email optional notices default enabled unless a stored preference overrides them.

## 13. In-App Notification State

P10 adds:

```text
NotificationReceipt
NotificationPreference
```

`NotificationReceipt` stores read state separately from the immutable logical notification row.

Buyer endpoints:

```text
GET  /api/v1/notifications
POST /api/v1/notifications/:notificationId/read
GET  /api/v1/notification-preferences
PUT  /api/v1/notification-preferences
```

The database constraint source adds foreign-key relationships for the receipt/preference records and an index optimized for user in-app notification history.

## 14. Notification Operations

Admin operations can query notifications by channel/status and manually requeue eligible failed/queued external notifications:

```text
GET  /api/v1/admin/notifications
POST /api/v1/admin/notifications/:notificationId/retry
```

Retry actions are audited.

In-app notifications are not provider-retryable because they are persisted directly by CartNest.

A concrete email/SMS provider is still an environment/provider-selection decision. The P10 source baseline therefore stops at the normalized provider adapter boundary rather than inventing credentials or provider-specific template IDs.

## 15. Database Additions

P10 introduces the multi-file Prisma source:

```text
packages/database/prisma/p10.prisma
```

with:

- `NotificationReceipt`;
- `NotificationPreference`.

Additional PostgreSQL migration source includes:

- NotificationReceipt → Notification FK;
- NotificationReceipt → User FK;
- NotificationPreference → User FK;
- optimized in-app user notification index;
- one-active-platform-tax-policy partial unique index.

These are migration source requirements. They are not a claim that a production database migration has already been executed.

## 16. Contract and Route Tests Added

P10 source tests cover:

- checkout promotion-code contract;
- promotion DTO shape;
- tax-rate bounds;
- notification preference channel vocabulary;
- P10 OpenAPI route registration;
- unified admin order-operations route registration;
- unavailable-auth boundary behavior.

The exact test files include:

```text
packages/contracts/src/p10.test.ts
apps/api/src/p10.routes.test.ts
apps/api/src/app.test.ts
```

## 17. P10 Exit-Gate Assessment

The approved P10 exit gate states:

> Admin tooling can explain the state of an order/payment/refund without direct database access, and privileged changes generate audit entries.

At source level this is satisfied through:

- `/api/v1/admin/orders/:orderId/operations`;
- payment-attempt/allocation/refund/shipment/return aggregation;
- admin tax/promotion audit entries;
- admin notification-retry audit entries;
- existing vendor/KYC/moderation/refund/review audit behavior from earlier phases.

Formal execution evidence is still unavailable because the repository's GitHub Actions workflow is failing during GitHub startup before any normal job is created.

## 18. Remaining Non-Source Evidence / Deferred Work

The following remain intentionally outside the claim that P10 has runtime production evidence:

1. apply/review the actual Prisma/PostgreSQL migration containing P10 models and SQL constraints;
2. regenerate OpenAPI and `@repo/api-client` after executable CI/local tooling is available;
3. run lint/typecheck/tests/build in a trusted environment;
4. select/configure concrete email and SMS providers before external delivery can occur;
5. wire external notification dispatch into the BullMQ/outbox runtime and exercise retries/dead-letter handling;
6. implement the P10 Next.js admin/vendor/customer UI during the agreed frontend/integration pass;
7. exercise analytics/financial reconciliation against realistic seeded/staging data.

Items 1–3 are currently blocked by the same execution-evidence problem recorded in P0–P9. Item 4 is deliberately provider-neutral by product/architecture design. Item 5 is part of the background-runtime integration/hardening work before production. Item 6 is intentionally deferred by the current backend-first development sequence.

## 19. Current Phase Position

```text
P0  Repository/tooling foundation            implemented source baseline
P1  Database + contracts                     implemented source baseline
P2  Identity/auth/session/authorization       implemented source baseline
P3  Vendor/store/KYC/membership               implemented source baseline
P4  Catalog/variants/media                    implemented source baseline
P5  Inventory/wishlist/cart                   implemented source baseline
P6  Checkout/orders/reservations              implemented source baseline
P7  Payments/commission/webhooks              implemented source baseline
P8  Logistics/shipments                       implemented source baseline
P9  Returns/refunds/reviews                   implemented source baseline
P10 Admin/analytics/promotions/tax/notifs      implemented source baseline

NEXT: P11 Hardening / Performance / Security / NDPR
```

P10 should not be treated as production-certified until its runtime/migration/provider evidence is completed in the later hardening/staging gates.
