# Frontend FP8 — Shipping, Fulfillment, and Tracking

**Status:** Source baseline implemented; runtime/browser/provider/PostgreSQL evidence pending  
**Updated:** 6 September 2026

## 1. Scope

FP8 connects the Next.js buyer and vendor experiences to the P8 logistics domain without moving shipping authority into the browser.

The frontend now covers:

- buyer delivery-address entry and per-store shipping quotes during checkout;
- GIGL receiver-station selection when required;
- store fulfillment configuration;
- per-variant shipping weight/dimensions/pieces;
- vendor shipment creation and split shipment allocation;
- vendor manual shipment status progression;
- buyer order shipment tracking;
- shipment item allocation and event-history presentation.

The implementation consumes shared `@repo/contracts` types through the repository's `@repo/api-client` transport. Authenticated mutations continue through the shared browser fetch boundary so secure cookies and CSRF headers remain centralized.

## 2. Typed logistics client

The FP8 integration bridge now exposes the complete P8 web-facing API surface:

```text
GET  /api/v1/stores/:storeId/fulfillment-profile
PUT  /api/v1/stores/:storeId/fulfillment-profile
GET  /api/v1/variants/:variantId/shipping-profile
PUT  /api/v1/variants/:variantId/shipping-profile
GET  /api/v1/logistics/stations
POST /api/v1/logistics/quotes
POST /api/v1/vendor-orders/:vendorOrderId/shipments
GET  /api/v1/vendor-orders/:vendorOrderId/shipments
GET  /api/v1/orders/:orderId/shipments
GET  /api/v1/shipments/:shipmentId
POST /api/v1/shipments/:shipmentId/status
```

Provider DTOs and Prisma models are not duplicated in the web application.

The generated OpenAPI snapshot still requires execution/regeneration once the repository's CI/runtime blocker is resolved. The current bridge is contract-derived from `@repo/contracts`, matching the integration pattern already used for other post-P2 frontend phases.

## 3. Buyer shipping quote flow

The existing checkout screen is retained and integrated as the FP8 buyer quote surface.

Buyer flow:

```text
Delivery address
      |
      v
POST /logistics/quotes
      |
      +-- MANUAL store -> configured backend fee
      |
      +-- GIGL store -> receiver station + provider quote
      |
      v
Per-store quote display
      |
      v
Checkout refreshes quote immediately before order creation
```

The browser never supplies an authoritative delivery total. It displays the backend quote and the backend independently resolves a valid, unexpired quote during checkout.

Address edits and receiver-station changes invalidate the visible quote. `SHIPPING_QUOTE_REQUIRED` is handled as a recoverable checkout state rather than pretending order creation succeeded.

## 4. Store fulfillment settings

The vendor store-detail screen now contains an FP8 fulfillment editor.

Supported settings:

- default provider: `MANUAL` or `GIGL`;
- manual/self-delivery enablement;
- manual delivery fee in NGN;
- active/paused fulfillment state;
- dispatch-origin contact and address snapshot;
- GIGL sender station ID.

The UI mirrors important backend invariants:

- MANUAL cannot be selected as default while manual delivery is disabled;
- manual delivery requires a fee;
- GIGL as default requires a sender station;
- country remains Nigeria (`NG`) for the current marketplace baseline.

Store update controls are shown according to vendor permissions, while the backend remains the authorization authority.

## 5. Variant shipping profiles

Vendor product editing now exposes physical shipping data for every variant:

```text
weightGrams   required, positive
lengthMm      optional, positive when present
widthMm       optional, positive when present
heightMm      optional, positive when present
pieces        positive, default 1
```

This closes the frontend gap that prevented vendors from supplying the data required by GIGL quoting.

A newly created variant is explicitly surfaced as needing a shipping profile before GIGL fulfillment can quote it.

## 6. Vendor shipment operations

Vendor-order detail now contains a shipment manager for members with `order:fulfill`.

Implemented behavior:

- load all shipments for the VendorOrder;
- show shipment provider, status, tracking reference, allocations, fee, delivery timestamp, and event history;
- calculate remaining quantity per OrderItem from non-cancelled shipments;
- create a MANUAL shipment containing one or more selected OrderItems;
- support multiple/partial shipments for the same VendorOrder;
- reject invalid browser quantities before submission;
- hide shipment creation until parent payment is `SUCCEEDED`;
- hide shipment creation for cancelled/refunded VendorOrders;
- update MANUAL shipment status using only allowed state transitions;
- never expose manual status mutation for GIGL shipments.

The browser-side allocation calculation is convenience and feedback only. The P8 backend and PostgreSQL allocation guard remain authoritative against concurrent overshipment.

## 7. Buyer tracking

Buyer order detail now presents shipment tracking from the authenticated buyer logistics API.

The buyer can see:

- one or many shipments across store slices;
- provider and tracking/reference number;
- normalized CartNest shipment status;
- exactly which order items and quantities belong to each shipment;
- shipment fee when present;
- delivery timestamp;
- chronological backend shipment events, including message and location when available;
- an explicit empty state before fulfillment begins;
- refresh/error/loading states.

No GIGL provider status code becomes part of the buyer UI contract.

## 8. Buyer shipment DTO defect fixed

FP8 integration exposed a backend mapping defect in `BuyerLogisticsQueryService`.

`ShipmentDto` requires `items`, but the buyer mapper previously omitted the ShipmentItem allocations even though the repository had already hydrated them. This would make buyer tracking responses incomplete and violate the shared contract.

The mapper now returns:

```text
items[]
  -> orderItemId
  -> quantity
```

A focused regression test covers both order-level shipment listing and single-shipment buyer lookup so this allocation data cannot silently disappear again.

## 9. GIGL booking remains intentionally gated

FP8 does not invent a GIGL pre-shipment/booking payload.

The backend continues to return:

```text
GIGL_CREATION_REQUIRES_SANDBOX_CONFIRMATION
```

for GIGL shipment creation until CartNest's actual contracted GIGL sandbox request/response is confirmed.

This is an intentional safety boundary. Guessing a provider payload could create an incorrect waybill, duplicate shipment, or charge the wrong logistics account.

Manual/self-delivery remains independently usable.

## 10. Background tracking runtime

The backend contains the P8 `logistics.tracking.sync` job handler primitive, but the repository's worker application still does not run BullMQ jobs end-to-end.

The current worker process only performs startup/heartbeat behavior and its package does not yet include the queue/database dependencies needed to compose the logistics service safely.

Therefore FP8 does not claim scheduled GIGL tracking synchronization as runtime-complete. That remains part of the repository-wide BullMQ/outbox worker-runtime implementation rather than being simulated inside the browser or duplicated with an ad-hoc FP8 timer.

## 11. CI and executed evidence

Repository GitHub Actions currently fails before creating a job. The latest observed run for `main` reported `startup_failure` and its jobs endpoint returned zero jobs.

Because no runner job starts, the following have not been executed as CI evidence for FP8:

- dependency installation;
- secret scan / dependency audit;
- lint and architecture checks;
- Prisma validation;
- OpenAPI/client regeneration;
- TypeScript typecheck;
- Vitest;
- Next.js production build;
- documentation-link check.

The workflow file itself defines those steps, but a startup failure with zero jobs is not evidence that any individual source command failed or passed.

## 12. Runtime evidence still pending

Source implementation is not equivalent to a production exit gate.

The remaining evidence requirements are:

- successful repository install/lint/typecheck/test/build execution;
- OpenAPI and generated-client regeneration/inspection;
- P8 Prisma migration generation/inspection/execution against PostgreSQL;
- shipment-allocation concurrency verification against PostgreSQL;
- GIGL station/quote sandbox verification using the contracted account;
- GIGL booking request/response fixture before enabling live booking;
- BullMQ tracking-sync registration, retry/backoff, cadence and dead-letter evidence;
- browser QA for responsive, keyboard and error-state behavior.

## 13. FP8 exit-gate state

```text
Shared logistics API client                    IMPLEMENTED
Checkout shipping quotes                       IMPLEMENTED
GIGL receiver-station UX                       IMPLEMENTED
Store fulfillment-profile UI                   IMPLEMENTED
Variant shipping-profile UI                    IMPLEMENTED
Vendor shipment list                           IMPLEMENTED
Manual shipment creation                       IMPLEMENTED
Multiple/partial shipment UX                    IMPLEMENTED
Browser allocation validation                  IMPLEMENTED
Backend atomic allocation defense               IMPLEMENTED BEFORE FP8
Verified-payment shipment gate                 IMPLEMENTED
Manual status progression                      IMPLEMENTED
GIGL status mutation blocked in UI              IMPLEMENTED
Buyer order shipment tracking                   IMPLEMENTED
Shipment item allocation presentation           IMPLEMENTED
Tracking event history                          IMPLEMENTED
Buyer ShipmentDto allocation mapping fix         IMPLEMENTED
Buyer allocation regression test                COMMITTED
GIGL live booking                               INTENTIONALLY GATED
BullMQ tracking runtime                         NOT IMPLEMENTED END-TO-END
OpenAPI/client regeneration evidence            NOT EXECUTED
Prisma migration runtime evidence               NOT EXECUTED
CI typecheck/test/build evidence                 NOT EXECUTED
Provider sandbox/browser evidence               NOT EXECUTED
```

FP8 is complete at the **frontend/source-baseline level**. The remaining items are runtime/provider/platform exit evidence and must not be represented as completed production verification.

## 14. Next frontend phase

**FP9 — returns, refunds, review eligibility, review submission/moderation, and the corresponding buyer/vendor workflows.**
