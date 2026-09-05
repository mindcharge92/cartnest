# Frontend FP6 — Checkout, Reservations, and Orders

**Status:** Source baseline implemented; runtime/browser/PostgreSQL execution evidence pending  
**Updated:** 5 September 2026

## 1. Scope

FP6 connects the Next.js application to the P6 checkout and order domain while preserving the server-authoritative multi-vendor transaction model.

Implemented buyer routes:

```text
/checkout
/orders
/orders/:orderId
/cart  (checkout action activated)
```

Implemented vendor routes:

```text
/vendor/:vendorId/orders
/vendor/:vendorId/orders/:vendorOrderId
```

The browser does not create totals, reserve inventory, split orders, or decide payment success. Those operations remain Fastify/domain responsibilities.

## 2. Shared Order and Logistics Clients

`@repo/api-client` now exports `createOrdersApi` for:

```text
POST /api/v1/checkout
GET  /api/v1/orders
GET  /api/v1/orders/:orderId
POST /api/v1/orders/:orderId/cancel
GET  /api/v1/stores/:storeId/vendor-orders
GET  /api/v1/vendor-orders/:vendorOrderId
POST /api/v1/vendor-orders/:vendorOrderId/cancel
```

The checkout integration also uses the logistics bridge for:

```text
GET  /api/v1/logistics/stations
POST /api/v1/logistics/quotes
```

All browser calls continue through the common cookie/CSRF-aware transport and shared `@repo/contracts` DTOs.

## 3. Checkout Flow

`/checkout` now provides:

- delivery-address snapshot entry;
- required-field validation before quote requests;
- manual/vendor-managed delivery quote support;
- GIGL receiver-station discovery when a GIGL store requires one;
- GIGL station lookup failure handling without overwriting the real provider error;
- promotion-code entry;
- delivery quote refresh immediately before order creation;
- one stable idempotency key per normalized checkout payload/retry attempt;
- backend checkout error handling for cart/stock/promotion/shipping revalidation;
- redirect to the created order detail.

The cart's prior placeholder checkout button has been replaced with a real `/checkout` link only when the backend checkout preview reports the cart as ready.

## 4. Server-Authoritative Transaction Boundary

The UI intentionally does not submit authoritative prices, vendor IDs, store IDs, stock values, commission, tax, delivery totals, or order decomposition.

The backend still performs the P6 transaction:

```text
active cart
  -> revalidate variants/products/stores/vendors/current prices
  -> reserve inventory atomically for 15 minutes
  -> create parent Order
  -> create one VendorOrder per store
  -> create immutable OrderItem snapshots
  -> create logical PaymentIntent
  -> convert cart
  -> write audit/outbox/idempotency evidence
```

Checkout quote display is informative. The backend independently resolves the latest valid shipping quote and financial policies before creating the order.

## 5. Idempotency

The checkout UI creates an idempotency key with browser `crypto.randomUUID()` and keeps it stable while retrying the same normalized checkout payload.

Changing the promotion payload creates a new client key. The backend remains the final race-control layer through `IdempotencyRecord` and returns the original order for a safe replay of the same request.

## 6. Buyer Order History and Detail

`/orders` now supports:

- buyer-owned order history;
- order-status filtering;
- pagination;
- parent order status;
- payment status;
- store-order count;
- order total and created date.

`/orders/:orderId` now displays:

- delivery-address snapshot;
- parent order and payment state;
- reservation expiry while a reservation is held;
- each store/vendor order;
- immutable item/variant/SKU snapshots;
- store and parent financial totals;
- logical payment-intent state;
- direct unpaid parent-order cancellation when permitted.

The UI does not convert a browser redirect or pending payment intent into a paid state.

## 7. Vendor Order Queue and Detail

The vendor workspace now exposes **Orders** when the effective membership includes `order:read`.

`/vendor/:vendorId/orders` supports:

- store selection;
- vendor-order status filtering;
- pagination;
- item quantity and store total summary;
- vendor-order status;
- parent payment status.

`/vendor/:vendorId/orders/:vendorOrderId` supports:

- immutable item snapshots;
- subtotal/discount/delivery/tax/total;
- commission-rate and commission snapshots;
- gateway-fee snapshot;
- vendor-order, parent-order, and payment state;
- permission-aware pre-payment cancellation.

The detail page also checks that the loaded vendor order belongs to the vendor workspace encoded in the URL. This prevents cross-workspace confusion for users who belong to multiple vendors. Backend store authorization remains authoritative.

## 8. Partial Cancellation State-Machine Fix

The prior backend implementation allowed a vendor slice to be cancelled before payment, but after the first slice the parent moved to `PARTIALLY_CANCELLED`. Remaining cancellation and reservation-expiry logic had required exactly `PENDING_PAYMENT`, which could strand remaining unpaid reservations.

The backend now treats both of these as open unpaid parent states while `paymentStatus === PENDING`:

```text
PENDING_PAYMENT
PARTIALLY_CANCELLED
```

This permits subsequent unpaid vendor-slice cancellation and reservation expiry without allowing cancellation after payment.

The order number generator also uses an explicit Node `randomUUID` import rather than relying on the global crypto binding.

## 9. Parent State on Vendor DTOs

`VendorOrderDto` now includes:

```text
orderStatus
paymentStatus
```

This closes a frontend integration gap. A vendor-order status such as `PENDING` by itself is insufficient to decide whether cancellation is safe; the parent payment state must also be known.

Contract tests now require both parent fields on vendor-order responses.

## 10. GIGL Station Discovery Fix

The logistics adapter already supported GIGL station retrieval, but there was no authenticated API endpoint for checkout to discover a receiver station.

FP6 adds:

```text
GET /api/v1/logistics/stations
```

The route is represented in the logistics TypeBox/OpenAPI surface and the P8 route-contract test now asserts its registration.

The checkout UI requests stations only when the quote endpoint reports `GIGL_STATION_REQUIRED`.

## 11. Vendor Effective-Permission Delegation Fix

FP5 introduced prerequisite read-permission derivation, for example:

```text
order:process -> order:read -> store:read
inventory:adjust -> inventory:read -> store:read
staff:update -> staff:read
```

A remaining inconsistency was found in staff permission delegation: vendor service checks compared requested delegated permissions with the raw database permission list, even though authorization and DTOs operate on effective permissions.

Staff delegation now compares against `effectiveVendorPermissions(actor)`. A staff member still cannot delegate a capability they do not effectively hold, but an implied prerequisite read permission is no longer incorrectly rejected.

A membership-policy regression test covers this behavior.

## 12. Navigation

Authenticated buyer navigation now includes:

```text
Marketplace
Saved
Cart
Orders
Seller
Account
```

`/checkout` keeps Cart active in the header.

Vendor navigation now includes Orders for memberships with effective `order:read` access.

## 13. Source Tests Added/Updated

Committed source coverage now includes:

- frontend unpaid/partial-cancellation presentation rules;
- prevention of vendor cancellation after successful payment;
- parent order/payment state required by `VendorOrderSchema`;
- GIGL station endpoint registration in the logistics OpenAPI route test;
- effective staff read-permission delegation;
- existing P6 checkout/idempotency/state contracts;
- existing P6 route registration and validation tests.

These tests are committed source only. They are not represented as executed evidence while GitHub Actions cannot start jobs.

## 14. Intentional FP7 Boundary

FP6 creates an unpaid order and logical payment intent. It does **not** fabricate a gateway checkout or paid state.

FP7 owns the buyer payment experience around the existing payment backend, including:

```text
provider-neutral payment initialization
Paystack-primary routing
safe Flutterwave fallback policy
provider authorization URL handoff
payment verification/reconciliation state
pending/processing/failed/succeeded UX
browser-return handling without trusting the redirect
```

Vendor acceptance/fulfillment remains gated by verified successful payment.

## 15. Runtime / Infrastructure Evidence Still Pending

GitHub Actions has historically failed before any repository job is scheduled. Until an executable runner result exists, there is no trusted CI evidence for:

- install;
- lint;
- TypeScript typecheck;
- unit/contract tests;
- Next.js build;
- generated OpenAPI-client regeneration;
- database migrations.

Browser/PostgreSQL integration evidence is still required for:

- multi-store checkout against real inventory;
- concurrent final-stock reservation behavior;
- shipping quote expiry and refresh;
- GIGL station/quote behavior against configured provider credentials;
- idempotent browser retry against PostgreSQL;
- sequential partial vendor-order cancellation;
- automatic reservation expiry;
- responsive and keyboard QA for checkout/order screens.

## 16. FP6 Exit-Gate State

```text
Shared orders API client                       IMPLEMENTED
Checkout logistics client                     IMPLEMENTED
GIGL station discovery API                    IMPLEMENTED
Cart -> checkout navigation                   IMPLEMENTED
Delivery-address checkout UI                  IMPLEMENTED
Shipping quote flow                           IMPLEMENTED
Promotion payload                             IMPLEMENTED
Stable client idempotency key                 IMPLEMENTED
Order creation + redirect                     IMPLEMENTED
Buyer order history                           IMPLEMENTED
Buyer order detail                            IMPLEMENTED
Buyer unpaid cancellation                     IMPLEMENTED
Vendor order queue                            IMPLEMENTED
Vendor order detail                           IMPLEMENTED
Vendor pre-payment cancellation               IMPLEMENTED
Parent payment state in VendorOrder DTO       IMPLEMENTED
Partial-cancellation continuation fix         IMPLEMENTED
Effective permission delegation fix           IMPLEMENTED
Source regression/contract tests              COMMITTED
Runtime build/test evidence                   NOT EXECUTED
Browser/PostgreSQL/provider integration        NOT EXECUTED
```

FP6 is complete at the **source-baseline level**. Runtime exit evidence remains pending because the repository execution path has not produced trusted jobs.

## 17. Next Frontend Phase

**FP7 — payments, provider handoff, payment-state UX, and safe reconciliation-aware return handling.**
