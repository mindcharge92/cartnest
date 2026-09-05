# ADR-006: Multi-Vendor Checkout, Order, Fulfillment, Returns, and Review Eligibility

**Status:** Accepted  
**Accepted:** 5 September 2026  
**Marketplace:** Multi-vendor  
**Related:** ADR-005, ADR-007, ADR-010

## Decision

A customer may place products from multiple stores/vendors into one cart and complete one checkout. The backend creates one parent `Order` plus one `VendorOrder` per participating store/vendor.

Each VendorOrder owns its fulfillment lifecycle and may contain multiple shipments. Payment is coordinated at parent-order level and allocated to VendorOrders/platform components.

## 1. Aggregate Structure

```text
Cart
  -> Checkout
      -> Parent Order
          -> VendorOrder A
              -> OrderItems
              -> Shipment A1
              -> Shipment A2
          -> VendorOrder B
              -> OrderItems
              -> Shipment B1
      -> PaymentIntent
          -> PaymentAllocations
```

## 2. Store/Vendor Assumptions

- one vendor may own multiple stores;
- one checkout may include multiple stores;
- grouping is store/vendor scoped according to fulfillment rules;
- vendor APIs operate only on authorized VendorOrders;
- a vendor cannot access another vendor's slice.

## 3. Product and Inventory Assumptions

Products support variants and inventory is tracked at variant level.

SKU uniqueness is per store.

Inventory reservation is authoritative backend behavior, not a frontend cart guarantee.

## 4. Inventory Reservation

Standard reservation window: **15 minutes**.

Flow:

```text
checkout validation
  -> atomic/concurrency-safe stock check
  -> reserve variant quantities for 15 minutes
  -> create order/payment flow
  -> payment success commits reservation
  -> failure/expiry/cancellation releases reservation
```

Reservations must have explicit expiry and idempotent commit/release behavior.

## 5. Checkout Flow

1. authenticate customer;
2. load cart;
3. verify stores/vendors active and approved;
4. verify products/variants are purchasable;
5. load current server-authoritative prices;
6. check/reserve inventory;
7. apply platform promotion and tax policy;
8. compute per-store delivery fees;
9. resolve commission/gateway-fee allocation;
10. snapshot product and financial data;
11. create parent Order;
12. create VendorOrders and OrderItems;
13. create PaymentIntent and allocations;
14. return payment authorization;
15. provider verification/webhook confirms payment;
16. commit inventory;
17. VendorOrders enter fulfillment.

Checkout is idempotent.

## 6. Vendor Acceptance

Default behavior after successful payment is **automatic vendor-order acceptance** so the order can proceed without unnecessary manual blocking.

A store/product/business rule may explicitly require manual processing. The state model therefore supports manual acceptance when configured, but it is not the default marketplace behavior.

## 7. Shipment Model

A VendorOrder may have **multiple shipments**.

This supports:

- partial fulfillment;
- products leaving from different fulfillment locations later;
- replacement shipments;
- split delivery without distorting the parent order.

Shipment contains provider/method, tracking reference, fee allocation, state, timestamps, and tracking events where supported.

## 8. Logistics Fees

Delivery is calculated per VendorOrder/store.

A customer may therefore see:

```text
Store A delivery: ₦X
Store B delivery: ₦Y
Parent delivery total: X + Y
```

The parent order aggregates these amounts without pretending the purchase is one physical shipment.

## 9. Cancellation Policy

Cancellation is driven by VendorOrder/order state.

Baseline:

| State | Behavior |
| --- | --- |
| `PENDING_PAYMENT` | immediate cancellation; release reservation |
| paid but not processing | automatic cancellation or short grace policy where allowed; refund if captured |
| `PROCESSING` | cancellation request evaluated by policy/vendor/admin |
| `SHIPPED` | ordinary cancellation disabled; use return workflow |
| `DELIVERED` | return/refund policy applies |

A cancellation request is not allowed to bypass a shipment/return state machine.

## 10. Return / RMA Model

CartNest models returns from the beginning even if the complete customer UI is delivered later.

Core concepts:

- `ReturnRequest`;
- `ReturnItem`;
- return reason;
- requested quantity;
- evidence/media references where later required;
- return status/history;
- received/inspection state where applicable;
- linked Refund(s).

Suggested states:

```text
REQUESTED
APPROVED
REJECTED
IN_TRANSIT
RECEIVED
INSPECTED
COMPLETED
CANCELLED
```

The exact return window/reasons remain configurable marketplace policy.

## 11. Refund Authority

Vendor users with explicit refund permission may request/approve refunds within configured limits.

Admin users may review or override according to permission. High-risk/manual overrides are audited.

Provider confirmation determines financial completion.

## 12. Review Eligibility

A buyer may review only after an eligible purchased item/order has reached **DELIVERED** state.

CartNest supports:

- product review/rating;
- store/vendor review/rating.

The backend proves eligibility from order history; the client cannot submit an arbitrary product/store ID and claim purchase eligibility.

A policy must prevent duplicate/abusive reviews for the same eligible purchase according to the final review-key design.

## 13. Parent Order Status

Parent status is derived from payment and VendorOrder states rather than forcing all vendors to move together.

Example:

```text
Vendor A -> DELIVERED
Vendor B -> SHIPPED
Vendor C -> CANCELLED/REFUNDED
Parent   -> PARTIALLY_FULFILLED / derived customer state
```

## 14. Idempotency and Concurrency

Required controls:

- idempotent checkout;
- concurrency-safe inventory reservation;
- idempotent payment initialization;
- webhook deduplication;
- expected-state checks for fulfillment transitions;
- retry-safe cancellation/refund/return creation.

## 15. Audit

Audit significant state changes, including:

- manual acceptance/rejection;
- cancellation decisions;
- shipment status override;
- return approval/rejection;
- refund approval/override;
- admin intervention.

## Final Decision

CartNest supports one multi-vendor cart and checkout, decomposed into parent and vendor orders; 15-minute variant-level inventory reservation; automatic fulfillment entry by default; multiple shipments per VendorOrder; state-based cancellation; first-class return/RMA modeling; and delivered-purchase-only product/store reviews.
