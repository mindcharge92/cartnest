# P6 — Checkout, Inventory Reservation, and Multi-Vendor Orders Status

**Phase:** P6  
**Status:** Backend/domain source baseline implemented; production financial policies, payment-provider initialization, reservation scheduler wiring, typed-client regeneration, frontend UI/integration, migration execution, and CI exit-gate evidence remain pending  
**Updated:** 5 September 2026

## 1. Scope

P6 converts the P5 cart from buyer intent into an immutable commercial order boundary.

The phase implements:

- idempotent authenticated checkout;
- final cart/product/store/vendor/price revalidation;
- concurrency-safe 15-minute inventory reservations;
- one parent `Order`;
- one `VendorOrder` per represented store;
- immutable `OrderItem` product/variant/price snapshots;
- delivery-address snapshotting;
- financial-policy hooks;
- a logical `PaymentIntent` persisted with the order;
- buyer order history/detail;
- unpaid-order cancellation and reservation release;
- vendor-scoped order queues/details;
- vendor-slice cancellation before payment;
- reservation-expiry processing primitive;
- audit and transactional outbox events.

The frontend is intentionally deferred according to the current project plan: after the backend phases are complete, CartNest will circle back through the same phases to build the Next.js surfaces and generated-client integration.

## 2. Checkout Authority Chain

Checkout does not trust the browser's cart price, vendor ID, store ID, stock quantity, or financial totals.

```text
authenticated user
  -> active Cart from PostgreSQL
  -> CartItems from PostgreSQL
  -> current ProductVariant
  -> current Product
  -> current Store
  -> current Vendor
  -> current server-side price
  -> current InventoryItem
  -> atomic reservation
  -> immutable Order snapshots
```

The only buyer-supplied commercial input in P6 is the delivery-address snapshot. Product identity and quantities come from the authenticated buyer's active cart.

## 3. API Contracts

`@repo/contracts` now defines TypeBox runtime contracts and inferred TypeScript DTOs for:

- checkout request body;
- mandatory `Idempotency-Key` request header;
- delivery-address snapshots;
- parent order states;
- vendor-order states;
- payment-intent summary states;
- immutable order-item snapshots;
- parent order details;
- buyer order list pagination;
- vendor order list pagination;
- buyer cancellation;
- vendor-order cancellation.

The checkout header requires a caller-generated idempotency key of at least eight characters.

## 4. Idempotent Checkout

Checkout uses the existing `IdempotencyRecord` infrastructure with:

```text
principalId    = authenticated user ID
operation      = checkout.create
idempotencyKey = Idempotency-Key header
```

The request fingerprint is a SHA-256 digest of the canonical delivery-address request body.

Behavior:

```text
new key + valid request
  -> create one order
  -> persist COMPLETED idempotency record
  -> 201

same key + same request
  -> load original order
  -> no second reservation/order
  -> 200 replay

same key + different request body
  -> 409 IDEMPOTENCY_KEY_REUSED
```

The unique database key on `(principalId, operation, idempotencyKey)` remains the final race-control mechanism if two identical requests arrive concurrently.

The idempotency record, order, reservation, vendor orders, order items, logical payment intent, cart conversion, audit record, and outbox event are created in the same database transaction.

## 5. Final Checkout Revalidation

P5 checkout preview is informative and non-mutating. P6 repeats the critical checks inside the checkout transaction because preview results can become stale immediately.

The transaction verifies that the active cart still matches the pre-transaction draft for:

- cart item IDs;
- variant IDs;
- quantity;
- product ID;
- store/vendor identity;
- current unit price;
- currency;
- selected normalized option values.

It also requires:

```text
Variant       == ACTIVE
Product       == ACTIVE
Moderation    in {NOT_REQUIRED, APPROVED}
Store         == ACTIVE
Vendor        == APPROVED
Currency      == NGN for current MVP
```

If these values change between checkout preparation and the transaction, the transaction is rolled back and the caller receives a revalidation conflict instead of silently purchasing stale state.

## 6. 15-Minute Inventory Reservation

Cart items do not reserve inventory. Reservation begins only when checkout executes.

P6 performs a PostgreSQL conditional update equivalent to:

```sql
UPDATE InventoryItem
SET reserved = reserved + quantity,
    version = version + 1
WHERE variantId = :variantId
  AND onHand - reserved >= :quantity;
```

The update and reservation row are inside the same transaction as order creation.

This means two buyers competing for one final unit cannot both successfully reserve it: only the update whose stock predicate still succeeds can continue.

Every reservation is created as:

```text
status    = HELD
expiresAt = checkout time + 15 minutes
orderId   = newly created parent Order
cartId    = source Cart
```

The P6 SQL constraint source also adds a partial unique index preventing more than one `HELD` reservation for the same `(orderId, variantId)`.

## 7. Reservation State Lifecycle

P6 establishes:

```text
HELD
├── payment succeeds -> COMMITTED      [P7 transition]
├── buyer cancellation -> RELEASED
├── vendor-slice cancellation -> RELEASED for that slice
└── 15-minute timeout -> EXPIRED
```

Release/expiry decrements `InventoryItem.reserved` and increments the inventory version in the same transaction as the reservation-state/order-state update.

P6 implements the expiry processor method, but the periodic worker/BullMQ scheduler invocation is not yet wired. That wiring is required before the phase is considered operationally complete in a deployed environment.

P7 owns the payment-success transition that converts `HELD` reservations to `COMMITTED` and decrements physical `onHand` according to the finalized payment/inventory transaction design.

## 8. Parent Order and Store Decomposition

A multi-store cart becomes:

```text
Order
├── VendorOrder(Store A)
│   ├── OrderItem A1
│   └── OrderItem A2
│
├── VendorOrder(Store B)
│   └── OrderItem B1
│
└── PaymentIntent
```

Grouping is by store, not merely vendor. A vendor that owns two stores can therefore receive two VendorOrders inside one parent order if both stores appear in checkout.

The SQL constraint source adds:

```text
UNIQUE (orderId, storeId)
```

so one checkout cannot create duplicate vendor-order slices for the same store.

## 9. Immutable Order-Item Snapshots

OrderItem persists purchase-time data rather than relying on the live product record later.

Snapshots include:

- product ID;
- variant ID;
- product name;
- SKU;
- normalized option/value selections;
- unit price in integer minor units;
- quantity;
- subtotal;
- discount allocation;
- tax allocation;
- line total;
- currency.

The P6 write path creates these values once and exposes no order-item update endpoint.

This prevents later catalog edits from changing what the buyer actually purchased.

## 10. Financial Policy Hooks

P6 establishes explicit hooks for:

```text
commission
platform/vendor discounts
per-store delivery
VAT/tax
```

The current `P6BaselineCheckoutFinancialPolicy` deliberately returns zero for those values.

This is **not** a production pricing decision. It exists so the checkout/order transaction shape can be implemented without inventing commission percentages, tax rates, or shipping prices that have not yet been configured.

Before production checkout is enabled:

- P7 must resolve configured platform/vendor/category commission rules;
- P8 must resolve delivery quotes/fees per store;
- P10 must resolve tax and promotion policy;
- the resulting values must remain immutable snapshots on the created order/vendor order/items.

The service rejects policy output with negative values, discounts above the store subtotal, or commission rates outside 0–10000 basis points.

## 11. Payment Intent Boundary

Checkout creates one logical `PaymentIntent` for the parent order:

```text
PaymentIntent
  orderId
  amountMinor = parent grand total
  currency    = NGN
  status      = PENDING
```

P6 does not contact Paystack or Flutterwave.

That distinction is intentional:

```text
P6 = logical amount/order obligation
P7 = provider attempts, provider reference, authorization URL,
     webhook verification, reconciliation, allocation, success/failure
```

No browser redirect is treated as proof of payment.

## 12. Vendor Acceptance Timing

ADR-006 states that automatic vendor acceptance occurs **after successful payment**, unless an explicit manual-processing rule applies.

Therefore newly created P6 VendorOrders remain:

```text
status = PENDING
acceptedAt = null
```

P6 includes a post-payment acceptance policy seam. P7 must invoke the normal AUTO policy only after server-side payment verification. This prevents unpaid orders from entering the fulfillment lifecycle.

## 13. Buyer Order API

P6 adds:

```text
POST /api/v1/checkout
GET  /api/v1/orders
GET  /api/v1/orders/:orderId
POST /api/v1/orders/:orderId/cancel
```

Buyer order reads are always scoped by authenticated `userId` at the repository query, so knowing another customer's order UUID does not grant read access.

Order responses include:

- parent totals/status;
- delivery snapshot;
- vendor-order decomposition;
- immutable item snapshots;
- logical payment-intent summary;
- current reservation expiry while a HELD reservation exists.

## 14. Vendor-Order API

P6 adds:

```text
GET  /api/v1/stores/:storeId/vendor-orders
GET  /api/v1/vendor-orders/:vendorOrderId
POST /api/v1/vendor-orders/:vendorOrderId/cancel
```

Authorization remains server-side:

```text
list/detail -> store -> VendorMember -> order:read
cancel      -> store -> VendorMember -> order:process
```

A vendor-order UUID is never sufficient authorization.

The API returns only one VendorOrder slice and its items, not unrelated slices belonging to other stores in the parent order.

## 15. Cancellation Baseline

P6 handles the unpaid portion of ADR-006.

Buyer cancellation of an unpaid checkout:

```text
Order PENDING_PAYMENT
  -> release HELD reservations
  -> cancel PENDING VendorOrders
  -> cancel PENDING PaymentIntent
  -> Order CANCELLED
  -> PaymentStatus CANCELLED
  -> audit + outbox event
```

A vendor with `order:process` may cancel its own unpaid VendorOrder. Reservations for that store's variants are released. If it was the final active VendorOrder, the parent order/payment intent are cancelled. If other store slices remain, the parent financial amount is recomputed from the remaining VendorOrders before provider payment initialization.

Paid/processing/shipped cancellation is deliberately not implemented as a simple P6 state flip; those cases require P7 refunds and P9 return/refund rules.

## 16. Transactional Outbox and Audit

Checkout creates an `order.created` outbox event in the same transaction as the order.

Cancellation/expiry creates corresponding events, including:

```text
order.cancelled
vendor-order.cancelled
order.reservation-expired
```

High-risk state transitions also create `AuditLog` records with the authenticated actor where applicable.

Downstream email/SMS/analytics behavior must consume these events asynchronously rather than extending the checkout transaction with network calls.

## 17. PostgreSQL Constraint Additions

P6 extends the reviewed raw-SQL constraint source with:

- reservation quantity > 0;
- reservation expiry after creation;
- one HELD reservation per order/variant;
- parent order non-negative amount rules;
- parent order arithmetic equality;
- one VendorOrder per order/store;
- VendorOrder non-negative amount rules;
- commission-rate range;
- VendorOrder arithmetic equality;
- OrderItem quantity and amount rules;
- OrderItem subtotal and line-total arithmetic;
- non-negative PaymentIntent amount.

These are source requirements until the actual reviewed migration is generated and executed.

## 18. Tests Added

P6 source tests cover:

- checkout body contract;
- mandatory idempotency header contract;
- order/vendor-order cancellation states;
- OpenAPI registration of checkout, order, and vendor-order routes;
- runtime rejection of checkout without an idempotency key.

The critical database scenarios still require real PostgreSQL integration tests:

1. same idempotency key creates exactly one order;
2. same key/different payload conflicts;
3. two simultaneous buyers contend for the final unit;
4. failed reservation rolls back the entire order transaction;
5. multi-store cart creates exactly one VendorOrder per store;
6. immutable item snapshots survive later catalog edits;
7. cancellation releases all relevant reservations exactly once;
8. reservation expiry releases stock exactly once;
9. cross-store vendor-order access is denied;
10. payment-success reservation commit is verified in P7.

## 19. Deferred Frontend Work

Per the current implementation strategy, the Next.js P6 UI is deferred until the backend sequence is complete.

The later frontend/integration pass must build:

```text
Checkout
├── delivery address
├── multi-store order summary
├── final revalidation errors
├── reservation countdown/status
└── payment-initiation transition

Buyer Orders
├── order history
├── parent order detail
├── per-store breakdown
└── cancellation action

Vendor Portal
├── store order queue
├── vendor-order detail
└── permitted order actions
```

Those screens must consume the generated `@repo/api-client`; they must not introduce handwritten duplicate API DTOs or raw persistence access.

## 20. Remaining P6 Gates

P6 is not yet formally exit-gate verified until all of the following have execution evidence:

- Prisma/schema generation succeeds;
- reviewed SQL constraints are included in an actual migration;
- `pnpm api:generate` regenerates OpenAPI + typed client;
- lint/typecheck/tests/build pass;
- PostgreSQL concurrency tests prove final-unit exclusion;
- idempotency integration tests prove exactly-one-order behavior;
- cancellation and expiry integration tests prove exact reservation release;
- reservation expiry is wired to the background-worker scheduler;
- production financial hooks replace P6 zero-value policy before real commerce traffic;
- frontend/integration pass is completed later as agreed.

## 21. P6 Exit-Gate Assessment

| Requirement | Source implementation | Execution evidence |
| --- | --- | --- |
| 15-minute reservation | implemented | pending |
| idempotent checkout | implemented | pending DB concurrency test |
| current-price/state revalidation | implemented | pending integration test |
| Parent Order | implemented | pending migration/runtime test |
| VendorOrder per store | implemented + SQL unique index source | pending migration |
| immutable OrderItem snapshots | implemented | pending integration test |
| financial hooks | implemented | production policies deferred |
| PaymentIntent boundary | implemented | provider initialization is P7 |
| buyer cancellation | implemented for unpaid state | pending integration test |
| vendor-order queue/detail | implemented | pending auth integration test |
| reservation expiry primitive | implemented | worker scheduler pending |
| frontend | intentionally deferred | later frontend pass |

## 22. Next Phase

P7 is **Payments, Commission, Gateway Fees, and Provider Webhooks**.

P7 must build on the P6 order/payment obligation rather than creating a second checkout model. Its core responsibilities are:

```text
P6 PaymentIntent(PENDING)
  -> provider routing
  -> Paystack attempt by default
  -> Flutterwave fallback only when safe
  -> provider verification/webhook
  -> PaymentIntent SUCCEEDED
  -> Order PAID
  -> inventory reservation COMMITTED
  -> post-payment vendor acceptance policy
  -> allocations / commission / gateway fee snapshot
  -> fulfillment becomes eligible
```
