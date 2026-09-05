# ADR-006: Multi-Vendor Checkout and Order Architecture

**Status:** Proposed baseline  
**Date:** 4 September 2026  
**Marketplace:** Multi-vendor  
**Payment model:** one customer checkout coordinated at parent-order level  
**Related:** ADR-005

## Proposed Decision

A buyer experiences one checkout, but the backend decomposes the purchase into one parent `Order` plus one `VendorOrder` per participating store/vendor. Order items belong to a `VendorOrder`, fulfillment and shipment are vendor-scoped, while payment can be initiated for the parent order.

This preserves a coherent customer experience without forcing unrelated vendors to share fulfillment state.

## 1. Aggregate Structure

```text
Customer Checkout
      |
      v
Parent Order
  +-- VendorOrder A
  |     +-- OrderItem A1
  |     +-- OrderItem A2
  |     +-- Shipment A
  |
  +-- VendorOrder B
        +-- OrderItem B1
        +-- Shipment B

Parent Payment / PaymentIntent
  -> allocation to VendorOrder A
  -> allocation to VendorOrder B
  -> platform fees
```

## 2. Why Split by Vendor

- different vendors accept and fulfill at different times;
- each vendor owns separate inventory;
- each vendor may have different logistics/shipment state;
- partial cancellation/refund may affect one vendor without cancelling the whole checkout;
- vendor dashboards must expose only that vendor's slice;
- commission, settlement, and analytics are naturally vendor-scoped.

## 3. Core Entities

| Entity | Purpose | Important Concepts |
| --- | --- | --- |
| `Order` | customer-level checkout record | customer, grand totals, currency, overall/payment status |
| `VendorOrder` | vendor/store-specific fulfillment record | vendor/store, subtotal, fees, fulfillment state |
| `OrderItem` | immutable purchased-item snapshot | product/variant refs, name/SKU snapshot, price, qty |
| `InventoryReservation` | temporary/confirmed stock hold | item, qty, expiry, status |
| `PaymentIntent` | expected customer payment | order, amount, currency, status |
| `PaymentAllocation` | financial split | vendor-order/platform amounts |
| `Shipment` | delivery/fulfillment unit | vendor order, provider, tracking, status |
| `Refund` | economic reversal | payment/order/vendor-order/item references, amount, state |

## 4. Parent Order Responsibilities

The parent order owns the customer-level view of one checkout:

- customer identity;
- billing/delivery snapshots as required;
- overall grand total;
- currency;
- payment state;
- customer-facing aggregate status;
- references to vendor orders.

The parent order should not try to make all vendor fulfillment statuses identical.

## 5. Vendor Order Responsibilities

A `VendorOrder` owns the store/vendor-specific portion:

- store/vendor ID;
- item lines;
- vendor subtotal;
- allocated discounts/fees;
- fulfillment status;
- shipment(s);
- vendor cancellation/refund implications;
- vendor financial allocation.

Vendor APIs should normally operate on `VendorOrder`, not the entire parent order.

## 6. Order Item Snapshot

Each item should preserve historical purchase data even if catalog data changes later.

Typical snapshot:

```text
productId
variantId
productName
sku
selected attributes
unitPrice
quantity
discount allocation
tax allocation if applicable
line total
currency
```

The live product remains useful for navigation/reference, but is not the historical financial source of truth.

## 7. Status Models

Illustrative parent order states:

```text
PENDING_PAYMENT
PAID
PARTIALLY_FULFILLED
FULFILLED
PARTIALLY_CANCELLED
CANCELLED
PARTIALLY_REFUNDED
REFUNDED
```

Illustrative vendor-order states:

```text
PENDING
ACCEPTED
PROCESSING
SHIPPED
DELIVERED
CANCELLED
PARTIALLY_REFUNDED
REFUNDED
```

Illustrative payment states:

```text
PENDING
REQUIRES_ACTION
PROCESSING
SUCCEEDED
FAILED
CANCELLED
PARTIALLY_REFUNDED
REFUNDED
```

Illustrative reservation states:

```text
HELD
COMMITTED
RELEASED
EXPIRED
```

Final state machines must define allowed transitions explicitly.

## 8. Checkout Flow

Recommended sequence:

```text
1. load current cart
2. validate stores/vendors are active
3. revalidate product/variant availability
4. reprice server-side
5. create immutable item snapshots
6. reserve stock
7. calculate parent and vendor-order totals
8. create Order + VendorOrders + OrderItems
9. create PaymentIntent
10. return payment authorization/instructions
11. provider webhook/server verification confirms payment
12. commit reservations / mark order paid
13. vendor fulfillment begins
```

`POST /checkout` must be idempotent.

## 9. Inventory Reservation

Do not decrement or reserve inventory solely from frontend/cart assumptions.

Rules:

- reserve using current server state;
- reservation has expiry/release behavior;
- payment confirmation commits the reservation;
- failed/abandoned payment releases stock;
- all reservation actions are idempotent;
- concurrency protection prevents overselling.

## 10. Payment Relationship

The customer may make one parent-level payment even when many vendors are involved.

The platform records allocations:

```text
PaymentIntent
  -> VendorOrder A allocation
  -> VendorOrder B allocation
  -> platform allocation
```

This makes partial refund and future settlement deterministic.

## 11. Fulfillment

Vendors fulfill independently.

A customer order may therefore have:

- Store A shipped;
- Store B still processing;
- Store C cancelled/refunded.

The parent order derives a meaningful aggregate customer state rather than forcing all suborders into one status.

## 12. Shipment Model

A shipment belongs to a vendor order.

The design should permit more than one shipment per vendor order if future partial fulfillment requires it, even if MVP restricts it to one.

Shipment metadata may include:

- provider;
- external shipment reference;
- tracking number;
- fee;
- state;
- timestamps;
- tracking events.

## 13. Cancellation Matrix

| Situation | Expected Behavior |
| --- | --- |
| Before payment | cancel parent order and release all reservations |
| Paid, before processing | policy may allow item/vendor-order cancellation + refund |
| One vendor cannot fulfill | cancel affected VendorOrder, refund allocation, others continue |
| Already shipped | likely transition to return/refund workflow instead of cancellation |
| All vendor orders cancelled | parent becomes cancelled/refunded as appropriate |

The exact cancellation window is a business decision still to confirm.

## 14. Refund Design

Refunds must reference the original financial allocation being reversed.

Rules:

- a partial refund can target vendor orders/items;
- refund amount cannot exceed remaining refundable amount;
- refund creation is not the same as refund completion;
- final order/payment statuses derive from successful provider outcomes;
- vendor/platform allocation reversal must be deterministic.

## 15. Customer View

The customer should see:

- one order number;
- parent payment/total summary;
- vendor/store sections;
- per-vendor fulfillment state;
- potentially multiple tracking numbers;
- cancellation/refund state by relevant section.

## 16. Vendor View

A vendor sees only its authorized vendor order data:

- items;
- quantities;
- buyer delivery information required for fulfillment;
- allowed financial summary;
- shipment controls;
- fulfillment actions;
- refund/cancellation state relevant to that vendor.

No vendor may read another vendor's order slice.

## 17. Admin View

Admin may view parent + vendor-order composition for operational oversight, subject to permission and audit requirements.

Admin overrides must be explicit rather than bypassing state machines silently.

## 18. Idempotency and Concurrency

Required controls:

- checkout uses an idempotency key;
- stock reservation uses transaction/locking/atomic-update strategy;
- payment webhooks are deduplicated;
- fulfillment transitions verify expected current state;
- cancellation/refund creation is retry-safe.

## 19. Auditability

Audit significant transitions such as:

- manual order override;
- vendor acceptance/rejection where applicable;
- cancellation;
- shipment creation/status override;
- refund request/completion;
- admin intervention.

## 20. Open Business Decisions

- can one vendor own multiple stores?;
- can one vendor order produce multiple shipments in MVP?;
- does vendor acceptance happen automatically after payment or manually?;
- cancellation window/policy;
- delivery-fee calculation across vendors;
- whether platform collects funds and settles vendors or gateway split settlement is used;
- returns/RMA workflow.

## 21. Final Baseline

CartNest models one customer checkout as a parent order composed of independent vendor orders. Inventory, fulfillment, shipment, refunds, and financial allocation follow those boundaries so vendors remain isolated while customers retain a single coherent checkout experience.
