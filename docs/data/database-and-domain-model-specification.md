# Database & Domain Model Specification

**Status:** Baseline design — refine through migrations and implementation  
**Date:** 4 September 2026  
**Database:** PostgreSQL  
**ORM:** Prisma  
**Architecture:** Modular monolith

## 1. Purpose

This document defines the initial logical domain model for CartNest before Prisma schema implementation. It describes business entities, module ownership, relationships, historical snapshot requirements, financial/inventory invariants, indexes, transaction boundaries, deletion policy, audit/privacy considerations, and migration order.

Exact table/column names may evolve during implementation, but changes must preserve the business model and ADR constraints.

## 2. Domain Areas

| Domain | Core Entities |
| --- | --- |
| Identity/User | User, AuthSession, Address |
| Vendor/Store | Vendor, VendorMember, Store |
| Catalog/Media | Category, Product, ProductVariant, Media |
| Inventory | InventoryItem, InventoryReservation, InventoryAdjustment |
| Wishlist | Wishlist, WishlistItem |
| Cart | Cart, CartItem |
| Orders | Order, VendorOrder, OrderItem |
| Payments | PaymentIntent, PaymentAttempt, PaymentAllocation, Refund, ProviderEvent |
| Reliability | IdempotencyRecord |
| Logistics | Shipment, ShipmentEvent |
| Reviews | Review |
| Administration | ModerationAction, AuditLog |
| Notifications | Notification |

## 3. High-Level Relationship Model

```text
User
  +--< AuthSession
  +--< Address
  +--< VendorMember >-- Vendor --< Store
  +--1 Wishlist --< WishlistItem >-- Product/Variant
  +--< Cart --< CartItem >-- ProductVariant
  +--< Order --< VendorOrder --< OrderItem
                           |
                           +--< Shipment --< ShipmentEvent
                           +-- PaymentAllocation

Store --< Product --< ProductVariant --1 InventoryItem
  |          |              |
  |          +--< Media     +--< InventoryReservation
  |                         +--< InventoryAdjustment
  +--< Media

Order --1 PaymentIntent --< PaymentAttempt
                         --< PaymentAllocation
                         --< Refund

ProviderEvent --> PaymentAttempt / Refund
```

## 4. Ownership Principle

Logical table ownership follows backend modules.

- identity owns authentication/session tables;
- users owns profile/address data;
- vendors owns vendor/membership;
- stores owns store state;
- catalog owns product/category representation;
- inventory owns stock and reservations;
- orders owns orders/vendor orders/order items;
- payments owns payment/refund/provider-event records;
- logistics owns shipment state;
- reviews owns review state;
- audit owns audit entries.

A shared physical PostgreSQL database does not mean every module can freely update every table.

## 5. User

Purpose: marketplace identity/account root.

Representative fields:

```text
id
email? / normalizedEmail?
phone? / normalizedPhone?
passwordHash
status
createdAt
updatedAt
```

Open decisions:

- email vs phone vs both as required identity;
- verification fields/workflow;
- exact account-status enum.

Never expose `passwordHash` through API DTOs.

## 6. AuthSession

Purpose: revocable/rotating browser refresh session.

Representative fields:

```text
id
userId
tokenHash/sessionHash
issuedAt
expiresAt
revokedAt?
revokedReason?
replacedBySessionId?
createdAt
```

Optional privacy-safe device metadata may be stored if useful.

Raw refresh secrets should not be persisted where a hash/reference design is possible.

Indexes:

- `userId`;
- expiry/status cleanup path;
- unique secure session identity.

## 7. Address

Purpose: reusable user address book entry.

Representative fields:

```text
id
userId
recipientName
phone
line1
line2?
city
state
postalCode?
countryCode
type?
isDefault?
createdAt
updatedAt
```

Order delivery addresses are snapshotted into order data. Historical orders do not rely only on a mutable `Address` row.

## 8. Vendor

Purpose: Nigerian business/merchant account.

Representative fields:

```text
id
displayName
legalName?
businessRegistrationData?  # only when required
status
approvedAt?
suspendedAt?
createdAt
updatedAt
```

Possible states:

```text
PENDING
APPROVED
REJECTED
SUSPENDED
```

Vendor approval history should be auditable.

## 9. VendorMember

Purpose: connect users to vendor organizations and permissions.

Representative fields:

```text
id
vendorId
userId
role
permissions
status
createdAt
updatedAt
```

Required constraint:

```text
unique(vendorId, userId)
```

Possible roles:

```text
OWNER
STAFF
```

Detailed capabilities come from the authorization model.

## 10. Store

Purpose: customer-facing merchant storefront.

Representative fields:

```text
id
vendorId
name
slug
description?
status
createdAt
updatedAt
```

Indexes/constraints:

- unique marketplace slug;
- index `vendorId`;
- index status.

The data model supports multiple stores per vendor even if MVP later restricts that by business policy.

## 11. Category

Purpose: marketplace product taxonomy.

Representative fields:

```text
id
name
slug
parentId?
status
sortOrder?
createdAt
updatedAt
```

A self-reference can represent hierarchy.

Category changes must not corrupt historical order-item snapshots.

## 12. Product

Purpose: store-owned sellable catalog concept.

Representative fields:

```text
id
storeId
categoryId?
name
slug?
description
status
moderationStatus?
createdAt
updatedAt
archivedAt?
```

Possible status concepts:

```text
DRAFT
ACTIVE
ARCHIVED
```

Platform moderation status should be distinguishable from vendor-controlled publication intent when moderation is implemented.

Indexes:

- store + status;
- category + status;
- created time;
- search indexes later.

## 13. ProductVariant

Purpose: purchasable SKU/variation.

Representative fields:

```text
id
productId
sku
priceAmountMinor
currency
attributes
status
createdAt
updatedAt
```

Variant attributes may initially use constrained JSON if practical, but the schema must be revisited if rich option/filtering rules require normalization.

SKU uniqueness scope is still open: global, vendor, or store scoped.

## 14. Media

Purpose: metadata for product/store images stored in object storage.

Representative fields:

```text
id
ownerType
ownerId
objectKey
bucket?
mimeType
sizeBytes
width?
height?
altText?
displayOrder
status
createdBy
createdAt
deletedAt?
```

The binary object lives outside PostgreSQL.

Do not make a CDN URL the durable identity; store the canonical object key/media ID.

## 15. InventoryItem

Purpose: authoritative stock state for a product variant.

Representative fields:

```text
id
variantId
onHand
reserved
version
updatedAt
```

Required constraint:

```text
unique(variantId)
```

Conceptual availability:

```text
available = onHand - reserved
```

Concurrency protection must prevent available quantity from becoming invalid.

## 16. InventoryReservation

Purpose: temporarily hold stock during checkout/payment.

Representative fields:

```text
id
variantId
orderId?
cartId?
quantity
status
expiresAt
createdAt
committedAt?
releasedAt?
```

States:

```text
HELD
COMMITTED
RELEASED
EXPIRED
```

Indexes:

- variant + status;
- expiresAt + status;
- order reference.

Reservation creation and stock counter update must be atomic.

## 17. InventoryAdjustment

Purpose: permanent/auditable stock movement.

Representative fields:

```text
id
variantId
delta
reason
referenceType?
referenceId?
actorUserId?
createdAt
```

Use cases include:

- stock receipt;
- manual correction;
- sale commitment;
- cancellation/restock;
- return/restock when applicable.

Manual adjustments are high-risk audit events.

## 18. Wishlist and WishlistItem

Purpose: buyer saved products.

Representative logical structure:

```text
Wishlist
  id
  userId

WishlistItem
  id
  wishlistId
  productId
  variantId?
  createdAt
```

Recommended constraints:

- one active wishlist per user for MVP;
- prevent duplicate identical saved item.

## 19. Cart

Purpose: current buyer shopping basket.

Representative fields:

```text
id
userId
status
createdAt
updatedAt
```

For authenticated-first MVP, one active cart per customer is a simple baseline.

Guest-cart support is a separate product decision.

## 20. CartItem

Representative fields:

```text
id
cartId
variantId
quantity
createdAt
updatedAt
```

Do not treat a stored cart price as checkout truth. Checkout revalidates product, vendor/store, inventory, and current pricing.

## 21. Order

Purpose: customer-level checkout record.

Representative fields:

```text
id
orderNumber
userId
currency
itemSubtotalAmountMinor
discountAmountMinor
deliveryAmountMinor
taxAmountMinor
grandTotalAmountMinor
paymentStatus
status
deliveryAddressSnapshot
createdAt
updatedAt
```

Order totals must reconcile to component values.

The delivery snapshot preserves contractual history even if the user later edits an address.

## 22. VendorOrder

Purpose: vendor/store-specific fulfillment and financial slice.

Representative fields:

```text
id
orderId
vendorId
storeId
currency
itemSubtotalAmountMinor
discountAmountMinor
deliveryAmountMinor
taxAmountMinor
platformFeeAmountMinor?
totalAmountMinor
status
createdAt
updatedAt
```

Indexes:

- order ID;
- vendor/store + created time;
- vendor/store + status.

## 23. OrderItem

Purpose: immutable purchased-item snapshot.

Representative fields:

```text
id
vendorOrderId
productId
variantId
productNameSnapshot
skuSnapshot
variantAttributesSnapshot
unitPriceAmountMinor
quantity
subtotalAmountMinor
discountAmountMinor
taxAmountMinor
lineTotalAmountMinor
currency
createdAt
```

Order items are historical records. Later product edits must not rewrite them.

## 24. PaymentIntent

Purpose: one expected customer payment for an order.

Representative fields:

```text
id
orderId
amountMinor
currency
status
createdAt
updatedAt
```

A payment intent's expected economics are stable after provider attempts begin.

Recommended relationship:

```text
Order 1 -- 1/current PaymentIntent
```

The implementation may allow superseded intents when a payable order needs re-creation, but history is preserved.

## 25. PaymentAttempt

Purpose: one provider interaction.

Representative fields:

```text
id
paymentIntentId
provider
providerReference
channel?
amountMinor
currency
status
failureCategory?
initializedAt
confirmedAt?
createdAt
updatedAt
```

Recommended unique constraint:

```text
unique(provider, providerReference)
```

## 26. PaymentAllocation

Purpose: preserve how customer payment value is economically assigned.

Representative fields:

```text
id
paymentIntentId
vendorOrderId?
allocationType
amountMinor
currency
createdAt
```

Example allocation types:

```text
VENDOR_ORDER
PLATFORM_FEE
DELIVERY
TAX
```

The sum of allocations must reconcile with the captured amount according to financial policy.

## 27. Refund

Representative fields:

```text
id
paymentIntentId
paymentAttemptId?
orderId
vendorOrderId?
orderItemId?
provider
providerRefundReference?
amountMinor
currency
reason
status
requestedBy
createdAt
completedAt?
```

Refund request and refund completion are distinct states.

Total successful refunds must never exceed captured amount.

## 28. ProviderEvent

Purpose: webhook inbox/deduplication and reconciliation support.

Representative fields:

```text
id
provider
externalEventId?
fingerprint?
eventType
paymentAttemptId?
refundId?
status
receivedAt
processedAt?
metadata?
```

Recommended uniqueness:

```text
unique(provider, externalEventId)
```

where the provider guarantees a stable event ID.

Fallback fingerprint strategy must avoid unsafe false deduplication.

## 29. IdempotencyRecord

Purpose: make retry-sensitive client operations return one logical result.

Representative fields:

```text
id
principalId
operation
idempotencyKey
requestFingerprint
status
resourceType?
resourceId?
responseReference?
expiresAt
createdAt
updatedAt
```

Recommended unique scope:

```text
unique(principalId, operation, idempotencyKey)
```

A reused key with a different request fingerprint is rejected.

## 30. Shipment

Purpose: vendor-order delivery unit.

Representative fields:

```text
id
vendorOrderId
provider
providerShipmentReference?
trackingNumber?
status
feeAmountMinor?
currency?
createdAt
updatedAt
deliveredAt?
```

A vendor order may support multiple shipments even if MVP initially creates one.

## 31. ShipmentEvent

Purpose: shipment tracking history.

Representative fields:

```text
id
shipmentId
status
message?
location?
eventTime
createdAt
```

Provider-specific tracking payloads are normalized before public exposure.

## 32. Review

Representative fields:

```text
id
userId
productId
storeId?
orderItemId?
rating
text?
status
createdAt
updatedAt
```

Final review eligibility policy should decide whether a review requires a delivered order item.

Moderation status can distinguish pending/approved/rejected/removed states.

## 33. ModerationAction

Purpose: structured record of marketplace moderation commands.

Representative fields:

```text
id
actorUserId
action
entityType
entityId
reason?
metadata?
createdAt
```

Useful for vendor/store/product/user moderation where a simple current status does not provide enough history.

## 34. AuditLog

Purpose: append-oriented record of high-risk business/security actions.

Representative fields:

```text
id
actorUserId?
action
entityType
entityId
requestId?
ipHashOrLimitedContext?
metadata?
createdAt
```

AuditLog is not a substitute for proper domain records. It supplements them.

Do not store secrets in audit metadata.

## 35. Notification

Purpose: track notification delivery when the notifications module is implemented.

Representative fields:

```text
id
userId?
channel
recipientReference
notificationType
status
providerReference?
createdAt
sentAt?
failedAt?
```

Exact notification preference/template models are deferred.

## 36. Required Snapshotting

Snapshot data when future mutation must not rewrite historical meaning.

Required examples:

- order item product name;
- SKU;
- selected variant attributes;
- unit price;
- discount/tax/fee components;
- delivery address used for the order;
- commission/fee configuration or resulting calculated amounts;
- provider references;
- payment/refund amount and currency.

## 37. Soft Delete vs Hard Delete

| Data | Recommended Treatment |
| --- | --- |
| users/vendors/stores/products | status/soft deactivation where history exists |
| orders/payments/refunds/audit | never hard-delete during normal operation |
| carts/expired reservations | eligible for retention cleanup |
| media | detach/soft state then object lifecycle cleanup |
| personal data | NDPR erasure/anonymization while preserving required financial/audit integrity |

Avoid global `deletedAt` on every table without considering domain behavior.

## 38. Key Invariants

- [ ] one vendor membership per `(vendorId, userId)`;
- [ ] store slug uniqueness follows one marketplace namespace policy;
- [ ] SKU uniqueness scope is explicitly chosen and enforced;
- [ ] reserved/committed inventory never exceeds valid stock under the chosen model;
- [ ] order components reconcile exactly to order total;
- [ ] vendor-order components reconcile to vendor-order total;
- [ ] payment intent amount/currency equals expected payable amount;
- [ ] successful payment allocations reconcile to captured amount;
- [ ] successful refunds do not exceed captured refundable balance;
- [ ] provider references/events are unique where provider semantics allow;
- [ ] vendor-scoped operations always enforce membership/ownership;
- [ ] historical order financial snapshots are immutable.

## 39. Recommended Indexes / Constraints

| Entity | Index / Constraint |
| --- | --- |
| User | unique normalized email/phone where applicable; status |
| AuthSession | user; expiry/revocation cleanup |
| VendorMember | unique `(vendorId,userId)`; indexes by user/vendor |
| Store | unique slug; vendor/status |
| Product | store/status; category/status; search index later |
| ProductVariant | SKU under chosen scope; product/status |
| InventoryItem | unique variant |
| InventoryReservation | variant/status/expiry; order |
| WishlistItem | unique saved item policy |
| Cart | active cart by user if one-active-cart policy |
| CartItem | cart + variant uniqueness where appropriate |
| Order | user + created time; status; payment status; unique order number |
| VendorOrder | vendor/store + status + created time; order |
| PaymentAttempt | unique provider/reference; intent/status |
| ProviderEvent | unique provider/event ID when available |
| IdempotencyRecord | unique principal + operation + key; expiry |
| Shipment | vendor order; tracking number; status |
| Review | product/status; user; optional purchase uniqueness policy |
| AuditLog | actor/entity/requestId/time |

## 40. Transaction Boundaries

Use transactions for invariants that must commit atomically.

Examples:

- stock reservation + inventory counters;
- order + vendor orders + order items + initial totals;
- provider event dedupe + payment transition;
- refund record + refundable-balance/state transition;
- idempotency record + creation of retry-sensitive resource where design requires it.

Avoid slow provider HTTP calls while holding DB locks/transactions unless there is a justified pattern.

## 41. Data Type Rules

| Concept | Logical Type |
| --- | --- |
| IDs | opaque UUID/CUID-style identifiers; choose one standard before first migration |
| Money | bigint/integer minor units + ISO currency |
| Timestamps | timezone-aware timestamps; UTC storage baseline |
| Enums | constrained string/DB enum chosen with migration flexibility in mind |
| JSON | flexible provider/audit/variant metadata only where relational structure is not core |
| Text search | PostgreSQL full-text/trigram strategy later if required |

## 42. Prisma Rules

- Prisma schema lives in `@repo/database`;
- migrations are the production schema evolution mechanism;
- Prisma Client is backend-only;
- Next.js frontend does not import Prisma models;
- BigInt, Decimal, Date, and enums are mapped into public DTO wire formats;
- avoid destructive cascade deletes on financial/history entities;
- use explicit select/include to avoid unnecessary sensitive data retrieval.

## 43. Audit / NDPR Considerations

Audit high-risk changes such as:

- vendor approval/suspension;
- staff permission changes;
- product moderation;
- inventory adjustments;
- admin order overrides;
- refunds;
- payment reconciliation interventions.

Privacy requirements:

- minimize copied personal data;
- snapshot only order data genuinely required for contractual/fulfillment history;
- define retention before production;
- support erasure/anonymization without corrupting financial/audit records;
- avoid storing secrets/raw provider credentials in generic metadata.

## 44. Initial Migration Order

```text
1. users + auth sessions + addresses
2. vendors + vendor members + stores
3. categories + products + variants + media
4. inventory + reservations + adjustments
5. wishlist
6. carts + cart items
7. orders + vendor orders + order items
8. payment intents + attempts + allocations + refunds + provider events
9. idempotency records
10. shipments + shipment events
11. reviews
12. moderation + audit + notifications
```

Migration sequence may be combined during early development, but dependencies should remain understandable.

## 45. Open Model Decisions

- [ ] one vs multiple stores per vendor as product policy;
- [ ] global/vendor/store-scoped SKU uniqueness;
- [ ] product variant attribute normalization strategy;
- [ ] coupon/promotion entities;
- [ ] tax/VAT entities;
- [ ] vendor settlement/payout ledger;
- [ ] returns/RMA model;
- [ ] guest cart support;
- [ ] notification preference/template model;
- [ ] full-text/search indexing strategy;
- [ ] review eligibility/uniqueness rules;
- [ ] exact ID standard.

## 46. Final Baseline

PostgreSQL is the transactional source of truth. Prisma manages schema/migrations, but domain/module ownership remains explicit. Financial and order history are snapshot-based and auditable, inventory/payment invariants are protected transactionally, and public API contracts remain separate from persistence representations.
