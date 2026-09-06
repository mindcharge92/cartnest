# P8 — Logistics, Shipping Quotes, Shipments, and Tracking Status

**Phase:** P8  
**Status:** Backend/domain and FP8 frontend source baselines implemented; GIGL live booking payload, BullMQ runtime wiring, Prisma generation/migration execution, OpenAPI/generated-client regeneration, provider sandbox verification, and CI exit-gate evidence remain pending  
**Updated:** 6 September 2026

## 1. Scope

P8 replaces the P6/P7 zero-delivery seam with a provider-neutral logistics domain and per-store shipping fees.

Implemented source baseline:

- store fulfillment configuration;
- per-variant shipping dimensions/weight;
- persisted, expiring per-store shipping quotes;
- manual/self-delivery quote path;
- GIGL quote adapter;
- GIGL station-reference adapter primitive;
- normalized GIGL tracking adapter;
- manual shipment creation;
- multiple shipments per VendorOrder;
- ShipmentItem quantity allocation so partial shipments cannot exceed ordered quantity;
- ShipmentEvent history;
- buyer order/shipment tracking queries;
- vendor shipment queries and manual state changes;
- parent/VendorOrder fulfillment aggregation;
- GIGL tracking-sync job primitive;
- audit/outbox events for shipment creation/state changes;
- P8 database constraints and indexes;
- TypeBox/OpenAPI route contracts and route/mapping tests;
- Next.js store fulfillment and variant shipping configuration;
- checkout quote/station integration;
- vendor shipment creation/status UX;
- buyer shipment allocation and tracking-event presentation.

The frontend pass has now reached FP8. The source-level integration is documented in [`frontend-p8-status.md`](frontend-p8-status.md). Runtime/browser/provider evidence remains separate from source completion.

## 2. Provider-Neutral Domain

Public CartNest code consumes normalized logistics concepts rather than GIGL DTOs:

```text
CartNest LogisticsService
  -> LogisticsProviderAdapter
       -> GIGL
       -> MANUAL/self-delivery domain path
```

Provider-specific status codes are preserved only in protected metadata/event context. Public DTOs expose CartNest `ShipmentStatus` values.

## 3. Fulfillment Configuration

P8 introduces `StoreFulfillmentProfile`:

- store ownership scope;
- default provider: `GIGL` or `MANUAL`;
- manual-delivery enabled flag;
- manual delivery fee in integer minor units;
- currency;
- immutable-style origin-address input used by quote requests;
- optional GIGL sender station ID;
- active flag.

A store configured with GIGL must provide a sender station. A store cannot choose MANUAL as default while manual delivery is disabled.

P8 also introduces `VariantShippingProfile`:

- weight in grams;
- optional length/width/height in millimetres;
- pieces/count metadata.

GIGL quoting requires a shipping profile for every cart variant represented by that store.

## 4. Shipping Quote Flow

Buyer flow:

```text
authenticated cart
  -> group items by store
  -> load each StoreFulfillmentProfile
  -> MANUAL: use configured fee
  -> GIGL: load dimensions/weight and call provider quote
  -> persist ShippingQuote per store
  -> 15-minute expiry
  -> checkout resolves exact valid quote
  -> VendorOrder.deliveryAmountMinor snapshot
  -> parent Order aggregates VendorOrder delivery fees
```

Shipping quotes are tied to:

- authenticated user;
- active cart ID;
- the cart's `updatedAt` version at quote time;
- store;
- delivery-address fingerprint;
- expiry time.

If cart content changes after quoting, the cart `updatedAt` changes and the previous quote is rejected. If the address changes or the quote expires, checkout also requires a fresh quote.

This prevents a quote for one cart state from being silently reused after product quantity/item changes.

## 5. Checkout Financial Composition

P8 decorates the existing P7 financial policy:

```text
P7 commission policy
        |
        v
LogisticsAwareCheckoutFinancialPolicy
        |
        +-- discount (P10)
        +-- tax (P10)
        +-- commission (P7)
        +-- delivery (P8 persisted quote)
```

Checkout fails with `409 SHIPPING_QUOTE_REQUIRED` when any represented store lacks a valid quote.

P10 has since supplied the configured tax/promotion financial policy. P8's delivery composition remains the logistics component in that policy chain.

## 6. GIGL Quote Adapter

Current implementation follows the provider-specific integration specification and current public GIGL reference shape:

```text
POST /price
access-token: <server credential>
```

The adapter maps normalized CartNest inputs into GIGL-specific sender/receiver station, location, customer, vehicle, pickup, delivery-option, and shipment-item fields.

Provider quote amounts are normalized into NGN minor units before entering the CartNest domain.

### Mandatory sandbox verification

The following remain provider-contract evidence requirements before production:

- exact nested location field names accepted by the contracted GIGL account;
- whether the quote's monetary result is returned in Naira major units in the selected product/API contract;
- exact service/quote-reference fields returned by the account;
- account-specific station/customer requirements.

The source mapping is therefore an implementation baseline, not a claim of completed GIGL sandbox certification.

## 7. GIGL Shipment Booking Gate

The public GIGL documentation exposes pre-shipment/bulk shipment operations, but the exact payload to use depends on the GIGL product/contract enabled for CartNest.

P8 deliberately does **not** invent that payload.

Attempting GIGL shipment creation currently returns a controlled service error:

```text
GIGL_CREATION_REQUIRES_SANDBOX_CONFIRMATION
```

The GIGL adapter also exposes the corresponding explicit unimplemented booking boundary.

This is intentional. A guessed shipment-creation payload could create duplicate/incorrect waybills or charge the wrong logistics account. Live GIGL booking is enabled only after the contracted sandbox request/response is confirmed and captured as fixtures/tests.

Manual/self-delivery shipment creation is implemented independently and remains usable if GIGL is unavailable.

## 8. Shipment Model

The existing `Shipment` and `ShipmentEvent` models are used, while P8 adds `ShipmentItem` allocation records.

```text
VendorOrder
  -> Shipment A
       -> ShipmentItems
       -> ShipmentEvents
  -> Shipment B
       -> ShipmentItems
       -> ShipmentEvents
```

This allows one VendorOrder to be split across multiple physical shipments without creating additional commercial VendorOrders.

Shipment allocation checks ensure:

```text
already allocated quantity
+ newly requested quantity
<= OrderItem.quantity
```

Cancelled shipments do not consume future shipment allocation.

## 9. Shipment Creation Rules

A shipment may be created only when:

- the VendorOrder exists;
- the caller has `order:fulfill` for the owning store;
- parent order payment is `SUCCEEDED`;
- the VendorOrder is not cancelled/refunded;
- every requested OrderItem belongs to that VendorOrder;
- quantities do not exceed remaining unallocated quantities.

The FP8 vendor UI mirrors these rules for clear feedback, but server/database validation remains authoritative.

Browser-supplied store/vendor ownership is never accepted as authorization evidence.

## 10. Manual/Self-Delivery

Manual shipment creation is a first-class path, not a fallback hack.

It supports:

- selected OrderItems/quantities;
- optional external/manual tracking number;
- note metadata;
- normalized Shipment state;
- vendor-entered status progression;
- audit/outbox events;
- buyer tracking from the same normalized API.

Only MANUAL shipments accept vendor-entered status updates. GIGL states come from provider synchronization.

## 11. Tracking Normalization

GIGL tracking uses the provider tracking endpoint defined in the integration spec. P8 maps provider scan codes into CartNest states.

Examples in the current fixture policy:

| GIGL scan | CartNest |
| --- | --- |
| `SHD`, `OKC` | `DELIVERED` |
| `OFDU`, `WC` | `OUT_FOR_DELIVERY` |
| `SRFS` | `PICKED_UP` |
| `DTR`, `DST`, `MDSE`, etc. | `IN_TRANSIT` |
| `DFA` | `FAILED` |
| `MRTE` | `RETURNING` |
| `RSR` | `RETURNED` |
| `MSCP`, `SSC` | `CANCELLED` |

Unknown non-terminal scan codes do not grant delivery/settlement value; the baseline maps them conservatively to `IN_TRANSIT` pending provider review.

## 12. Delivery Confirmation and Order Aggregation

Shipment state changes feed the order module through the explicit `OrderFulfillmentBoundary`; the logistics module does not reach into an order repository directly.

When all relevant shipment records for a VendorOrder are delivered:

```text
Shipment(s) -> DELIVERED
VendorOrder -> DELIVERED + deliveredAt
```

When all VendorOrders on the parent order are delivered:

```text
Order -> FULFILLED
```

Partial shipment progress can move a VendorOrder/order into partial-fulfillment state without forcing unrelated stores to move together.

The delivery transition is persisted and evented so P9 review eligibility and future settlement eligibility can use backend evidence rather than browser claims.

## 13. Buyer and Vendor API Surface

P8 establishes:

```text
GET  /api/v1/stores/:storeId/fulfillment-profile
PUT  /api/v1/stores/:storeId/fulfillment-profile
GET  /api/v1/variants/:variantId/shipping-profile
PUT  /api/v1/variants/:variantId/shipping-profile
GET  /api/v1/logistics/stations
POST /api/v1/logistics/quotes

POST /api/v1/vendor-orders/:vendorOrderId/shipments
GET  /api/v1/vendor-orders/:vendorOrderId/shipments
POST /api/v1/shipments/:shipmentId/status

GET  /api/v1/orders/:orderId/shipments
GET  /api/v1/shipments/:shipmentId
```

Write operations use the existing CSRF/session boundary. Vendor operations re-resolve server-side store membership/permission. Buyer shipment queries prove ownership from the parent order.

The handwritten typed logistics bridge now exposes this complete surface to FP8 while OpenAPI/generated-client regeneration remains an unexecuted runtime gate.

## 14. Background Tracking Synchronization

`logistics.jobs.ts` defines the P8 tracking-sync job contract and handler primitive:

```text
logistics.tracking.sync
  -> LogisticsService.syncGiglTracking()
  -> provider track request
  -> normalize state
  -> append ShipmentEvent if changed
  -> recompute VendorOrder/order fulfillment state
```

A GIGL timeout/error leaves the last trusted Shipment state unchanged. It does not cancel the VendorOrder or fabricate a delivery result.

The repository's general BullMQ/worker runtime is not yet executing these jobs end-to-end. Actual queue registration, cadence, retry/backoff, dead-letter evidence, and worker runtime proof remain part of the background-job execution pass and production verification.

## 15. Database Additions

P8 switches Prisma configuration to multi-file schema loading and adds:

- `StoreFulfillmentProfile`;
- `VariantShippingProfile`;
- `ShippingQuote`;
- `ShipmentItem`.

The required PostgreSQL constraint source adds:

- foreign keys for P8 scalar ownership references;
- non-negative manual/shipping fees;
- GIGL station requirement for GIGL-default stores;
- positive variant shipping weight/pieces/dimensions;
- ShippingQuote ownership/expiry checks;
- Shipment delivered-timestamp consistency;
- ShipmentItem foreign keys and positive quantity;
- atomic shipment allocation enforcement under a locked VendorOrder.

These constraints are reviewed migration source and still require generated migration inspection/execution before becoming runtime evidence.

## 16. Tests Added

Source tests include:

- OpenAPI route presence for P8 operations;
- TypeBox rejection of zero-weight variant shipping profiles;
- TypeBox rejection of empty shipment allocations;
- GIGL scan-code normalization cases;
- conservative unknown scan-code behavior;
- buyer shipment mapping regression coverage proving hydrated ShipmentItem allocations are present in both order-level and single-shipment responses.

The buyer mapping test was added after FP8 integration found that `BuyerLogisticsQueryService` omitted the required `ShipmentDto.items` field even though the repository hydrated the allocations. The mapper has been corrected.

These remain committed tests, not claimed passing CI evidence, because the repository Actions workflow still fails before job creation.

## 17. Frontend FP8 Integration

The Next.js frontend now provides:

- checkout delivery address and per-store quote UX;
- GIGL receiver-station selection;
- store fulfillment-profile configuration;
- per-variant physical shipping configuration;
- vendor MANUAL shipment creation;
- remaining-quantity feedback for split/multiple shipments;
- valid manual status-transition controls;
- buyer shipment tracking with item allocations and event history;
- loading, empty, error and refresh states;
- vendor permission-aware mutation controls.

See [`frontend-p8-status.md`](frontend-p8-status.md) for the detailed frontend exit-gate state.

## 18. Security and Integrity Invariants

P8 preserves these invariants:

1. delivery fees come from backend-generated quotes, not client totals;
2. delivery fee is scoped per store/VendorOrder;
3. a changed cart invalidates its old shipping quote;
4. an address change invalidates its old shipping quote;
5. shipment creation requires verified payment;
6. shipment quantities cannot exceed ordered quantities;
7. vendors cannot access/fulfill another store by submitting IDs;
8. buyers see only shipments belonging to their own order;
9. GIGL status codes never become the public API contract;
10. provider outage leaves last trusted state intact;
11. delivery is auditable and server-derived;
12. GIGL live booking remains blocked until provider-contract evidence exists.

## 19. Exit-Gate Status

| P8 Exit Criterion | Source status |
| --- | --- |
| delivery fee belongs to VendorOrder/store scope | Implemented |
| provider status maps into CartNest states | Implemented |
| GIGL outage does not corrupt order state | Implemented source behavior |
| manual shipment independently usable | Implemented |
| multiple shipments per VendorOrder | Implemented |
| shipment allocation cannot exceed OrderItem quantity | Implemented, including DB-level atomic guard source |
| delivered state is auditable | Implemented |
| buyer/vendor tracking API boundaries exist | Implemented |
| buyer tracking includes shipment allocations | Implemented; regression test committed |
| GIGL quote adapter exists | Implemented, sandbox verification pending |
| GIGL live booking | Deliberately gated pending contracted sandbox payload |
| shipment-sync job primitive | Implemented |
| BullMQ runtime/cadence evidence | Pending |
| Prisma generation/migration execution | Pending |
| automated typecheck/tests/build evidence | Pending due GitHub Actions startup blocker |
| frontend FP8 UI/typed API integration | Implemented source baseline |
| OpenAPI/generated-client regeneration | Pending execution |

## 20. Next Backend Phase

P9 is **Returns, Refunds, and Reviews**:

- return/RMA state machine;
- ReturnRequest and ReturnItem workflows;
- cancellation-vs-return boundary;
- partial/full refund execution and reconciliation;
- vendor/admin refund authority;
- delivered-purchase product review eligibility;
- delivered VendorOrder store review eligibility;
- review moderation/anti-abuse.
