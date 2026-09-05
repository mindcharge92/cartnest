# CartNest Exact Prisma Schema & Migration Specification

**Status:** Initial implementation baseline  
**Last updated:** 5 September 2026  
**Database:** PostgreSQL  
**ORM:** Prisma ORM v7 baseline  
**Companion schema:** [`reference-schema.prisma`](reference-schema.prisma)

## 1. Purpose

This specification converts the logical domain model and approved product decisions into an implementable PostgreSQL/Prisma design. It defines model ownership, identifiers, relations, enums, exact money/timestamp representation, uniqueness rules, required raw-SQL constraints/indexes, migration ordering, and data-seeding policy.

The companion `reference-schema.prisma` is the starting schema for `packages/database/prisma/schema.prisma`. It is intentionally explicit. Changes discovered during implementation must occur through reviewed migrations and documentation updates, not by using `prisma db push` against shared or production environments.

## 2. Prisma Version and Configuration

CartNest targets the current Prisma ORM v7 configuration style:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Database URLs belong in `prisma.config.ts`, not in the committed schema:

```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
    shadowDatabaseUrl: env("SHADOW_DATABASE_URL"),
  },
});
```

Production secrets are injected by deployment tooling.

## 3. Identifier Standard

Use PostgreSQL UUID columns for primary identifiers:

```prisma
id String @id @default(uuid()) @db.Uuid
```

Reasons:

- identifiers are opaque;
- safe across modules/processes;
- can be generated without central integer coordination;
- do not reveal record counts;
- work cleanly in URLs and external references.

Human-facing order numbers and provider references are separate fields and never replace database primary keys.

## 4. Timestamp Standard

All operational timestamps use timezone-aware PostgreSQL timestamps:

```prisma
createdAt DateTime @default(now()) @db.Timestamptz(3)
updatedAt DateTime @updatedAt @db.Timestamptz(3)
```

The application treats persisted timestamps as UTC. UI localization occurs only at presentation time.

## 5. Money Standard

All financial truth uses integer minor units:

```text
NGN 50,000.00 = 5,000,000 kobo
```

Prisma representation:

```prisma
amountMinor BigInt
currency    String @db.Char(3)
```

No financial column uses `Float`.

API DTOs serialize bigint-backed minor units as decimal strings according to ADR-005.

## 6. Authentication Data

### User

Contains account identity and platform-level role/state. Password hash is nullable because Google-linked accounts may exist without a local password.

Email and phone are normalized before persistence.

Required constraints:

- normalized email unique when non-null;
- normalized phone unique when non-null.

PostgreSQL permits multiple nulls in ordinary unique indexes, so Prisma unique nullable fields are acceptable.

### AuthIdentity

Stores external identity-provider linkage. Initial provider is Google.

Required unique key:

```text
(provider, providerSubject)
```

Provider tokens are not required for basic sign-in and should not be stored unless a future feature needs Google API access.

### AuthSession

Stores hashed rotating refresh-session material and revocation metadata. Raw refresh secrets are never persisted.

### MfaFactor

Stores ADMIN/SUPER_ADMIN factor configuration. TOTP secrets must be encrypted at application level using a dedicated encryption key; they are not plaintext logs or DTO fields.

## 7. Vendor and Store Data

- one Vendor has many Stores;
- one User can belong to many Vendors through VendorMember;
- VendorMember has OWNER/STAFF role;
- fine-grained permissions are rows in `VendorMemberPermission`;
- vendor verification/KYC uses `VendorVerification`;
- provider settlement/subaccount identities use `PaymentProviderAccount`.

`unique(vendorId, userId)` prevents duplicate membership rows.

## 8. Catalog and Variant Normalization

Product variants use normalized option tables:

```text
Product
  -> ProductOption (Color)
      -> ProductOptionValue (Black, White)
  -> ProductOption (Size)
      -> ProductOptionValue (42, 43)

ProductVariant
  -> VariantOptionValue -> selected ProductOptionValue rows
```

This permits structured filtering and avoids treating variant semantics as arbitrary JSON.

The order item still stores a JSON snapshot of selected attributes because historical purchases must survive catalog edits.

### SKU uniqueness

Approved rule: SKU is unique per Store.

Because Prisma cannot create a compound uniqueness constraint across an indirect relation, `ProductVariant` stores `storeId` directly and has:

```prisma
@@unique([storeId, sku])
```

Application/service code must ensure the variant's `storeId` matches its parent Product's store. A database trigger/check may be added later if needed.

## 9. Media

Media metadata supports Product or Store ownership.

The model contains nullable `productId` and `storeId`. Exactly one owner must be present.

Prisma cannot express the required XOR check. Migration SQL must add:

```sql
CHECK (
  ("productId" IS NOT NULL AND "storeId" IS NULL)
  OR
  ("productId" IS NULL AND "storeId" IS NOT NULL)
)
```

Binary data is stored in Cloudflare R2, not PostgreSQL.

## 10. Inventory

Each ProductVariant has one InventoryItem.

Conceptual invariant:

```text
onHand >= 0
reserved >= 0
reserved <= onHand
available = onHand - reserved
```

These constraints must be enforced by service transactions and supporting database checks.

InventoryReservation stores the 15-minute checkout hold and its lifecycle state.

InventoryAdjustment provides permanent/auditable movements.

## 11. Wishlist and Cart

MVP requires authenticated wishlist and checkout.

### Wishlist

One Wishlist per User through a unique `userId` relation.

### Cart

A user may retain historical converted/abandoned carts, but may have only one active cart.

Prisma cannot express a partial unique index. Migration SQL must add:

```sql
CREATE UNIQUE INDEX "Cart_one_active_per_user"
ON "Cart" ("userId")
WHERE "status" = 'ACTIVE';
```

## 12. Order Model

One customer checkout creates:

```text
Order
  -> VendorOrder per store
      -> OrderItem(s)
      -> Shipment(s)
```

`Order` stores customer-level totals and immutable delivery-address JSON snapshot.

`VendorOrder` stores store/vendor financial and fulfillment slice plus snapshots of:

- applied commission rate;
- commission amount;
- gateway-fee allocation;
- tax;
- delivery;
- discount.

`OrderItem` stores immutable product/SKU/variant/pricing snapshots.

## 13. Commission Rules

`CommissionRule` supports:

- global default: vendorId null + categoryId null;
- vendor override;
- category override;
- vendor/category override.

`rateBps` stores basis points:

```text
500 basis points = 5.00%
```

Resolution order is most-specific first:

```text
vendor + category
vendor only
category only
global default
```

The resolved rate and amount are snapshotted on VendorOrder/payment allocation.

## 14. Tax Configuration

MVP uses a configurable platform VAT/tax percentage rather than a full tax engine.

`TaxRate` is effective-dated and stores `rateBps`.

There must be at most one active applicable platform rate for an instant. Application validation plus migration/index strategy should prevent overlapping active periods where practical.

Historical orders store actual tax amounts; they do not recompute from current TaxRate.

## 15. Promotion Baseline

MVP supports platform-controlled coupon/promotions.

`Promotion` stores:

- code;
- type: percentage or fixed minor-unit amount;
- value;
- validity period;
- optional minimum order amount;
- total redemption limit;
- per-user limit;
- status.

`PromotionRedemption` links a user, promotion and completed/associated order for audit and limit enforcement.

Vendor-created promotions are intentionally not modeled as an active MVP capability, but the schema can be expanded later.

## 16. Payments

### PaymentIntent

Represents exact expected customer payment for one Order.

Multiple historical intents may exist for one order; there must never be two concurrently successful captures for the same payable obligation.

### PaymentAttempt

One provider interaction. Provider reference is unique within a provider when present.

### PaymentProviderAccount

Maps an approved vendor to Paystack/Flutterwave subaccount/split identity.

### PaymentAllocation

Records exact economic allocation across vendor order/platform components.

### ProviderEvent

Durable webhook inbox/deduplication record.

### Refund

Separate state machine with optional linkage to VendorOrder, OrderItem, or ReturnRequest.

## 17. Logistics

`Shipment` belongs to VendorOrder. Multiple Shipments are allowed.

Provider is initially:

- `GIGL`;
- `MANUAL`.

Provider-specific tracking codes are stored as external references/raw protected metadata only where needed; public APIs expose normalized shipment states.

## 18. Returns

ReturnRequest belongs to one customer and VendorOrder.

ReturnItem links specific OrderItem quantities.

Return completion and financial refund are related but separate state machines. A ReturnRequest can link to one or more Refund records through implementation logic/relations.

## 19. Reviews

Use separate tables for clean invariants:

- `ProductReview`: requires delivered `OrderItem` eligibility;
- `StoreReview`: requires delivered `VendorOrder` eligibility.

Recommended uniqueness:

```text
one ProductReview per order item
one StoreReview per vendor order
```

This avoids ambiguous polymorphic review constraints.

## 20. Reliability and Eventing Tables

### IdempotencyRecord

Unique scope:

```text
(principalId, operation, idempotencyKey)
```

Same key with conflicting request fingerprint is rejected.

### OutboxEvent

Written in the same PostgreSQL transaction as business state when a reliable asynchronous event must be published.

The worker publishes/processes it and marks it complete without losing the originating state change.

## 21. Notifications and Audit

`Notification` stores delivery attempts/state for email/SMS/in-app messages.

`AuditLog` is append-oriented and stores actor/action/entity/request context, not secrets.

## 22. Required Raw SQL Constraints

The initial migration series must add constraints Prisma cannot express sufficiently:

1. Media owner XOR (`productId` vs `storeId`).
2. Inventory nonnegative/check relationship.
3. one active cart per user partial unique index.
4. promotion percentage range where applicable.
5. commission/tax basis-point range (`0..10000`).
6. positive order-item and reservation quantities.
7. optional check that end timestamps occur after start timestamps.
8. exactly one review target is avoided by separate review tables.

## 23. Search and Performance Index Baseline

Create indexes for common access paths:

- Product `(storeId, status, createdAt)`;
- Product `(categoryId, status)`;
- ProductVariant `(productId, status)`;
- InventoryReservation `(status, expiresAt)`;
- Cart `(userId, status)`;
- Order `(userId, createdAt desc)`;
- VendorOrder `(storeId, status, createdAt desc)`;
- PaymentAttempt `(paymentIntentId, status)`;
- ProviderEvent `(provider, status, receivedAt)`;
- Shipment `(vendorOrderId, status)`;
- Notification `(status, nextAttemptAt)`;
- OutboxEvent `(status, availableAt)`;
- AuditLog `(entityType, entityId, createdAt)`.

Search-specific PostgreSQL FTS/trigram indexes should be added through a dedicated migration when catalog search implementation is introduced rather than prematurely creating unused indexes.

## 24. Migration Sequence

Recommended migrations:

```text
0001_extensions_and_identity
0002_vendor_store_membership_kyc
0003_catalog_categories_options_variants_media
0004_inventory_wishlist_cart
0005_orders_vendor_orders_items
0006_financial_rules_promotions_tax
0007_payments_provider_events_refunds
0008_logistics_shipments
0009_returns_and_reviews
0010_notifications_audit_outbox_idempotency
0011_partial_indexes_checks_and_search_support
```

A migration may be split further if reviewability improves, but dependency order must remain safe.

## 25. Migration Rules

- never edit a production-applied migration;
- never use `db push` as production schema management;
- migration PR includes generated SQL review;
- destructive changes require expand/migrate/contract strategy;
- large backfills are jobs/scripts, not long blocking migration transactions where avoidable;
- schema change is tested against representative staging data;
- production migration has backup/restore point;
- rollback is usually application rollback + forward-fix migration, not blind SQL reversal.

## 26. Seed Policy

Development seed may create:

- platform categories;
- default commission rule;
- baseline tax configuration;
- test admin only in non-production;
- synthetic vendor/store/catalog data.

Production seed must never create default credentials. Production bootstrap of SUPER_ADMIN must use a controlled operational procedure.

## 27. Schema Review Gate

Before first feature migration is merged:

- `prisma format` passes;
- `prisma validate` passes;
- migration applies cleanly to empty DB;
- migrations apply sequentially from zero;
- generated client typechecks;
- raw SQL checks/indexes are tested;
- no financial amount is Float;
- no secret-bearing field is exposed through response DTOs;
- approved vendor/store/order/payment relationships match this document.

## 28. Current Prisma References

The project should verify implementation commands against the installed Prisma major version. As of this baseline, Prisma ORM v7 uses `prisma.config.ts` for database connection configuration and the `prisma-client` generator with an explicit output directory.

Official references:

- https://docs.prisma.io/docs/orm/reference/prisma-config-reference
- https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
- https://docs.prisma.io/docs/orm/v7/prisma-schema/overview/data-sources
