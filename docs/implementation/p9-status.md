# P9 — Returns, Refunds, and Reviews Status

**Phase:** P9  
**Status:** Backend/domain source baseline implemented; Prisma migration execution, provider refund sandbox evidence, BullMQ scheduling, typed-client regeneration, frontend UI/integration, and CI exit-gate evidence remain pending  
**Updated:** 5 September 2026

## 1. Scope

P9 implements the post-delivery commerce boundary defined by the implementation plan:

- first-class ReturnRequest and ReturnItem workflow;
- explicit cancellation-vs-return boundary;
- partial and full refund requests;
- refund authorization and amount safety;
- Paystack refund submission/verification adapter behavior;
- Flutterwave v3 refund submission/verification adapter behavior;
- ambiguous refund outcome protection;
- refund reconciliation primitive;
- vendor refund request permission plus admin execution/override boundary;
- explicit returned-stock restocking policy;
- delivered-purchase product reviews;
- delivered VendorOrder store reviews;
- review moderation;
- audit/outbox events;
- TypeBox/OpenAPI contracts and tests.

Frontend/UI remains intentionally deferred until the backend phase sequence is complete, after which CartNest will circle back through the same phases for Next.js UI and generated-client integration.

## 2. Cancellation vs Return

CartNest keeps cancellation and return semantics separate.

```text
before shipment/delivery
    -> cancellation policy (P6)

after delivery
    -> ReturnRequest (P9)
```

A buyer can create a return only for a VendorOrder that:

- belongs to that authenticated buyer;
- is in `DELIVERED` state;
- contains every requested OrderItem.

A P9 return request is not a substitute for cancelling an unpaid or unfulfilled order.

## 3. Return Quantity Safety

For every requested ReturnItem, CartNest checks cumulative active return quantity across previous ReturnRequests.

Requests in `REJECTED` or `CANCELLED` do not consume returnable quantity.

Invariant:

```text
previous active return quantity
+ new requested return quantity
<= original OrderItem.quantity
```

A buyer therefore cannot open multiple return requests that collectively exceed what was purchased.

## 4. Return State Machine

Implemented transition policy:

```text
REQUESTED
  -> APPROVED
  -> REJECTED
  -> CANCELLED

APPROVED
  -> AWAITING_RETURN
  -> REFUND_PENDING

AWAITING_RETURN
  -> IN_TRANSIT
  -> RECEIVED
  -> CANCELLED

IN_TRANSIT
  -> RECEIVED

RECEIVED
  -> INSPECTING
  -> REFUND_PENDING

INSPECTING
  -> REFUND_PENDING
  -> REJECTED

REFUND_PENDING
  -> COMPLETED
```

`REJECTED`, `COMPLETED`, and `CANCELLED` are terminal in the P9 baseline.

Transition updates use the current state in the write predicate. A stale concurrent status command therefore cannot silently overwrite a newer return state.

## 5. Return Authorization

Buyer actions:

- create own return;
- list/get own returns;
- cancel own return only while still `REQUESTED`.

Vendor actions are store-scoped through the existing P3 ownership boundary:

- list store returns -> `order:read`;
- progress return workflow -> `order:process`;
- explicitly restock returned inventory -> `inventory:adjust`.

Browser-provided vendor/store identifiers never serve as ownership proof.

## 6. Explicit Restock Policy

A returned product does not automatically become sellable merely because a refund succeeded.

Restocking is a separate inventory decision and is allowed only after the return has reached a received/inspection/refund stage:

```text
RECEIVED
INSPECTING
REFUND_PENDING
COMPLETED
```

Restocking creates a normal `InventoryAdjustment`:

```text
referenceType = RETURN_RESTOCK
referenceId   = ReturnItem.id
```

A PostgreSQL partial unique index ensures one ReturnItem can be restocked at most once even under concurrent requests.

This keeps damaged/defective/wrong-item returns from automatically increasing available stock.

## 7. Refund Request Boundary

Vendor users with `refund:request` may request a refund for a VendorOrder.

The request accepts:

- amount in integer minor units;
- reason;
- optional OrderItem scope;
- optional ReturnRequest scope;
- mandatory `Idempotency-Key`.

The repository validates:

- VendorOrder exists;
- verified successful payment source exists;
- optional OrderItem belongs to that VendorOrder;
- optional ReturnRequest belongs to that VendorOrder and is not rejected/cancelled;
- amount is positive;
- sum of active/succeeded refunds plus the new refund does not exceed VendorOrder total.

Amounts in these refund states reserve refundable capacity:

```text
REQUESTED
APPROVED
PROCESSING
SUCCEEDED
```

This prevents two concurrent refund requests from both treating the same remaining balance as available.

## 8. Refund Idempotency

Refund request idempotency uses the existing `IdempotencyRecord` infrastructure.

Scope:

```text
principalId = requesting user
operation   = refund.request:<vendorOrderId>
idempotencyKey
request fingerprint
```

Replay with the same key and same payload returns the existing Refund.

Reuse of the same key with a different refund payload returns `IDEMPOTENCY_KEY_REUSED`.

## 9. Provider Execution Safety

Provider refund execution is an admin-controlled operation in the P9 baseline.

Before the external provider call, CartNest atomically claims the Refund:

```text
REQUESTED / APPROVED
      |
      | conditional UPDATE
      v
PROCESSING
```

Only the request that successfully changes the row can call the external provider. Concurrent approval requests observe the already-claimed row and cannot issue a second provider refund.

This is separate from HTTP idempotency and protects the economic side effect itself.

## 10. Ambiguous Refund Outcomes

Provider timeout/network ambiguity is treated conservatively.

```text
provider call result unknown
        -> Refund remains PROCESSING
        -> no second refund is permitted against that reserved amount
        -> reconcile before retrying economic action
```

If a provider returned a refund reference, the reconciliation primitive queries the provider by that reference.

If the provider outcome is ambiguous and no refund identifier can be recovered, the Refund intentionally remains PROCESSING for manual/provider investigation rather than risking a duplicate refund.

## 11. Paystack Refund Adapter

The Paystack adapter now supports:

- refund creation against the successful provider transaction;
- exact CartNest refund amount in provider subunits;
- provider refund identifier persistence;
- refund-status verification;
- mapping into normalized CartNest refund states.

Provider-specific responses remain confined to the adapter. CartNest API DTOs expose only normalized Refund state.

Provider sandbox verification remains mandatory before production release.

## 12. Flutterwave Refund Adapter

The existing CartNest Flutterwave adapter uses the v3 API surface. P9 keeps the refund implementation on the same API generation rather than mixing conventions.

It supports:

- transaction refund submission;
- integer-minor-unit to major-decimal conversion at the adapter boundary;
- refund retrieval/status verification;
- normalized processing/success/failure states.

Flutterwave sandbox/account capability verification remains mandatory before production release.

## 13. Refund Aggregate State

When a refund is verified `SUCCEEDED`, CartNest recomputes succeeded refund totals.

VendorOrder:

```text
refunded < VendorOrder.total -> PARTIALLY_REFUNDED
refunded >= VendorOrder.total -> REFUNDED
```

PaymentIntent/parent Order:

```text
succeeded refund total < captured amount -> PARTIALLY_REFUNDED
succeeded refund total >= captured amount -> REFUNDED
```

A linked ReturnRequest in `REFUND_PENDING` becomes `COMPLETED` after successful provider confirmation.

No browser redirect or refund-request creation itself marks money as refunded.

## 14. Review Eligibility

Product review eligibility:

```text
authenticated user
  -> owns Order
  -> OrderItem belongs to that Order
  -> VendorOrder is DELIVERED
  -> no existing ProductReview for that OrderItem
```

Store review eligibility:

```text
authenticated user
  -> owns Order
  -> VendorOrder is DELIVERED
  -> no existing StoreReview for that VendorOrder
```

The database uniqueness already gives one verified product review per purchased OrderItem and one store review per delivered VendorOrder.

A person who did not purchase the item/store order cannot create a verified-purchase review.

## 15. Review Moderation

New reviews enter the existing `PENDING` moderation state.

Public product/store review list endpoints return only `APPROVED` reviews.

Admin moderation supports:

```text
APPROVED
REJECTED
REMOVED
```

Admin moderation requires ADMIN/SUPER_ADMIN plus privileged MFA and writes an AuditLog entry.

## 16. API Surface

Buyer returns:

```text
POST /api/v1/returns
GET  /api/v1/returns
GET  /api/v1/returns/:returnRequestId
POST /api/v1/returns/:returnRequestId/cancel
```

Vendor returns/refunds:

```text
GET  /api/v1/stores/:storeId/returns
POST /api/v1/returns/:returnRequestId/status
POST /api/v1/returns/:returnRequestId/restock
POST /api/v1/vendor-orders/:vendorOrderId/refunds
```

Admin refunds/reviews:

```text
POST /api/v1/admin/refunds/:refundId/approve
POST /api/v1/admin/refunds/:refundId/reconcile
POST /api/v1/admin/reviews/:reviewId/moderate
```

Reviews:

```text
POST /api/v1/reviews/products
POST /api/v1/reviews/stores
GET  /api/v1/products/:productId/reviews
GET  /api/v1/stores/:storeId/reviews
```

## 17. Database Safety Additions

P9 adds reviewed PostgreSQL migration-source constraints/indexes for:

- positive Refund amount;
- refund completion timestamp consistency;
- return lifecycle timestamp consistency;
- processing-refund reconciliation index;
- single `RETURN_RESTOCK` InventoryAdjustment per ReturnItem;
- existing positive ReturnItem quantity and 1–5 review rating constraints.

These remain migration-source requirements until Prisma migration generation/execution is available in a trusted execution environment.

## 18. Audit and Outbox Events

P9 writes or emits events including:

```text
return.requested
return.status_changed
return.restocked
refund.requested
refund.succeeded
review.moderated
```

These events allow P10 notifications/admin read models and later background workers to react without crossing module repository boundaries.

## 19. Tests Added/Updated

Committed source tests now cover:

- Return DTO validation;
- non-empty return item requirement;
- positive refund minor units;
- mandatory refund idempotency header;
- 1–5 review rating contract;
- return status vocabulary;
- P9 OpenAPI route registration;
- invalid return route validation;
- P7 payment adapter mocks updated for the refund-capable provider interface.

The P9 economic invariants must still receive database-backed integration tests once executable CI/local database evidence is available, especially:

- concurrent refund requests;
- concurrent refund approval/execution;
- partial refund accumulation;
- provider ambiguous response/reconciliation;
- return quantity accumulation;
- concurrent restock attempts;
- verified-purchase review authorization.

## 20. Remaining P9 Exit-Gate Evidence

P9 is a source implementation baseline, not production certification.

Still required:

1. run Prisma validation/generation for all current multi-file schemas;
2. generate/review/apply migration containing P9 constraints;
3. run TypeScript typecheck;
4. run unit/route tests;
5. run database-backed return/refund/review integration tests;
6. execute Paystack sandbox refund + verify cycle;
7. execute Flutterwave sandbox refund + verify cycle;
8. wire recurring refund reconciliation through the BullMQ worker;
9. regenerate OpenAPI and typed API client;
10. implement the P9 Next.js buyer/vendor/admin UI during the planned frontend pass;
11. verify notification hooks during P10;
12. obtain normal CI job execution evidence.

## 21. P9 Exit-Gate Assessment

Source-level assessment against the implementation plan:

```text
ReturnRequest / ReturnItem                   implemented
return state machine                        implemented
cancellation-vs-return boundary             implemented
partial/full refund request                 implemented
refund amount cap                           implemented
refund idempotency                          implemented
provider refund execution                   implemented baseline
provider refund reconciliation              implemented primitive
vendor refund permission                    implemented
admin refund execution/override             implemented
explicit returned-stock restock             implemented
verified product review                     implemented
verified store review                       implemented
review moderation                           implemented
runtime/provider/database evidence           pending
frontend/generated-client integration        deferred
```

Therefore P9 may be treated as **backend/domain source baseline implemented**, but must not be described as fully production-verified until the remaining execution and provider-sandbox gates pass.
