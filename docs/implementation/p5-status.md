# P5 — Inventory, Wishlist, Cart, and Checkout Preview Status

**Phase:** P5  
**Status:** Backend/domain baseline implemented; typed-client regeneration, database migration execution, buyer UI, and full CI exit-gate verification remain pending  
**Updated:** 5 September 2026

## 1. Scope

P5 establishes three related but separate marketplace boundaries:

1. vendor-owned inventory;
2. authenticated buyer wishlist;
3. authenticated multi-store cart and a non-mutating checkout preview.

It builds directly on the P3 vendor/store ownership boundary and the P4 catalog boundary. P5 does not let the cart or inventory modules reinterpret product/store ownership from client-supplied identifiers.

The authority chain is:

```text
Inventory mutation
  -> authenticated CartNest user
  -> catalog resolves variant -> store
  -> vendor module resolves VendorMember
  -> active membership + inventory:adjust permission
  -> optimistic stock version
  -> database stock constraints

Cart/wishlist mutation
  -> authenticated CartNest user
  -> server resolves public/purchasable catalog state
  -> server resolves current inventory availability
  -> buyer-owned wishlist/cart persistence
```

The browser never supplies an authoritative product price, available quantity, vendor identity, or stock balance.

## 2. Shared Contracts

`@repo/contracts` now contains TypeBox runtime schemas and inferred TypeScript DTOs for:

- vendor inventory items;
- stock adjustment requests and adjustment history;
- optimistic inventory versions;
- authenticated wishlist items;
- product-level and variant-specific wishlist requests;
- active cart and cart items;
- add/update/remove cart operations;
- server-computed line subtotals and cart subtotal;
- checkout-preview store grouping;
- checkout-preview validation issues.

The checkout preview can report:

```text
PRODUCT_UNAVAILABLE
VARIANT_UNAVAILABLE
STORE_UNAVAILABLE
VENDOR_UNAVAILABLE
INSUFFICIENT_STOCK
PRICE_CHANGED          # reserved contract code for a future client/snapshot comparison path
```

P5 itself does not trust or persist a frontend price snapshot in the cart, so checkout preview simply recalculates using current catalog prices. The future P6 Order/OrderItem snapshot is the financial record of purchase-time pricing.

## 3. Inventory Ownership and Data Model

Inventory remains variant-scoped:

```text
Product
  -> ProductVariant
       -> InventoryItem
       -> InventoryAdjustment[]
```

`InventoryItem` tracks:

```text
onHand
reserved
version
updatedAt
```

Availability is derived server-side:

```text
available = onHand - reserved
```

P5 does not allow `available` to be written directly.

Inventory rows are safely created through an idempotent `upsert` when a variant first enters the inventory boundary. Listing a store's inventory ensures every listed variant has an inventory row. This gives existing P4 variants a safe zero-stock baseline without requiring a destructive schema rewrite.

A later migration/application optimization may create the zero-stock row in the same transaction as variant creation. The service invariant remains unchanged.

## 4. Inventory Concurrency

Every manual inventory adjustment requires `expectedVersion`.

Example:

```text
InventoryItem
  onHand = 12
  reserved = 2
  version = 7

Vendor request
  delta = -3
  expectedVersion = 7

conditional update
  version 7 -> 8
  onHand 12 -> 9
```

If another operation changes the row first, the stale request receives:

```text
409 INVENTORY_VERSION_CONFLICT
```

The caller must reload and make a conscious retry rather than silently overwriting another change.

P5 also rejects an adjustment if the resulting `onHand` would become negative or lower than the quantity already reserved.

The database source constraints now additionally require:

```text
onHand >= 0
reserved >= 0
reserved <= onHand
version >= 0
InventoryAdjustment.delta != 0
```

P6 inventory-reservation mutations must participate in the same concurrency model; they must not update `reserved` without preserving the version/invariant strategy.

## 5. Inventory Ledger and Audit

A stock mutation creates an immutable `InventoryAdjustment` record containing:

- variant ID;
- signed delta;
- reason;
- optional reference type/reference ID;
- actor user ID;
- timestamp.

The mutation also creates a platform audit record for high-risk operational traceability.

The inventory ledger is not reconstructed from the final stock balance. Both the current balance and the history are preserved.

## 6. Vendor Inventory API

P5 adds:

```text
GET  /api/v1/stores/:storeId/inventory
GET  /api/v1/inventory/:variantId
POST /api/v1/inventory/:variantId/adjust
GET  /api/v1/inventory/:variantId/adjustments
```

Authorization rules:

```text
list/read history -> inventory:read
manual adjustment -> inventory:adjust
OWNER             -> effective full vendor permission set
```

Store/variant scope is resolved server-side through the P4 catalog boundary and P3 vendor ownership boundary.

## 7. Wishlist Boundary

The approved MVP requires an authenticated account for wishlist use.

P5 creates one wishlist per user:

```text
User
  -> Wishlist
       -> WishlistItem(productId, optional variantId)
```

Supported use cases:

```text
GET    /api/v1/wishlist
POST   /api/v1/wishlist/items
DELETE /api/v1/wishlist/items/:wishlistItemId
```

An item can reference:

- a whole public product; or
- one active public variant of that product.

P5 validates the product and optional variant through the public catalog boundary before creating the item.

The existing PostgreSQL partial unique index prevents duplicate product-only wishlist rows where `variantId IS NULL`, while the Prisma composite uniqueness handles variant-specific duplicates.

Wishlist removal is scoped by the authenticated user's own wishlist. A buyer cannot remove another user's item by guessing an ID.

Unavailable/archived products are not exposed through the buyer wishlist response. The persistence row may remain for lifecycle/audit flexibility; public read mapping filters it until the product becomes valid again or a later cleanup policy removes it.

## 8. Cart Boundary

P5 implements an authenticated multi-store cart:

```text
User
  -> Cart(ACTIVE)
       -> CartItem Variant A / Store 1
       -> CartItem Variant B / Store 2
       -> CartItem Variant C / Store 1
```

API:

```text
GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:cartItemId
DELETE /api/v1/cart/items/:cartItemId
```

The existing PostgreSQL partial unique index is the authoritative database rule for:

```text
one ACTIVE cart per user
```

Cart item quantity is positive and bounded by the API contract. The database also rejects non-positive quantities.

Adding an already-present variant increases its cart quantity rather than creating a duplicate line.

## 9. Cart Price and Stock Rules

The frontend never submits an authoritative price.

On every cart read/mutation, the service resolves the current catalog variant and current inventory availability.

```text
browser
  -> variantId + quantity

server
  -> catalog product/variant state
  -> current priceAmountMinor
  -> store/vendor state
  -> current inventory availability
  -> calculated lineSubtotal
```

If requested quantity exceeds current availability, the mutation fails with `INSUFFICIENT_STOCK`.

Adding to cart **does not reserve stock**. This is intentional.

Stock reservation begins in P6 when checkout creates the 15-minute reservation boundary. A normal cart is therefore an expression of buyer intent, not a claim on inventory.

## 10. Checkout Preview

P5 adds:

```text
GET /api/v1/checkout/preview
```

The endpoint is deliberately read-only. It does not:

- create an Order;
- reserve stock;
- create a PaymentIntent;
- decrement inventory;
- trust cached frontend totals.

Instead it re-evaluates every cart line using current server state.

For each line it validates:

```text
variant exists
vendor == APPROVED
store == ACTIVE
product == ACTIVE
moderation state permits public sale
variant == ACTIVE
quantity <= current available inventory
```

It then calculates current minor-unit subtotals and groups valid lines by store.

Example conceptual response:

```text
Cart
  Store A
    Item 1
    Item 2
    subtotal

  Store B
    Item 3
    subtotal

Current cart subtotal
Validation issues
ready = true/false
```

This is the direct input preparation boundary for P6 multi-vendor checkout, but P6 must repeat all critical validations inside its checkout transaction. Preview success is not a lock and is never sufficient proof that stock still exists later.

## 11. Cross-Module Dependency Direction

P5 preserves the modular-monolith rules:

```text
inventory -> catalog public boundary
inventory -> vendor ownership boundary

wishlist -> catalog public boundary

cart -> catalog public boundary
cart -> inventory public service
```

The cart/wishlist modules do not import `PrismaCatalogRepository`, and inventory does not read `VendorMember` directly.

A new `DefaultCatalogCommerceBoundary` exposes the small internal catalog read surface needed by downstream commerce modules without making catalog repositories public infrastructure.

## 12. Runtime Contract Validation

P5 routes use TypeBox schemas through the existing Fastify TypeBox provider.

Committed tests cover:

- inventory adjustment contract shape;
- integer stock deltas and optimistic version requirement;
- product/variant wishlist request shapes;
- non-positive cart quantity rejection;
- checkout-preview response contract;
- OpenAPI registration of the P5 endpoint groups;
- Fastify runtime rejection of an invalid cart quantity.

## 13. Database Constraints Used by P5

The migration source already includes or now strengthens:

```text
InventoryItem_onHand_nonnegative
InventoryItem_reserved_nonnegative
InventoryItem_reserved_lte_onHand
InventoryItem_version_nonnegative
InventoryAdjustment_delta_nonzero
Cart_one_active_per_user
CartItem_quantity_positive
WishlistItem_product_without_variant_unique
```

These are source requirements for the reviewed migration. They are not claimed as applied to a live database until migration execution evidence exists.

## 14. API Client and Frontend Status

The checked-in OpenAPI-generated client snapshot still predates the later implementation phases because the repository's GitHub Actions execution environment has been failing before jobs start.

Therefore P5 does **not** add ad-hoc handwritten frontend endpoint types or scatter raw `fetch` calls across Next.js components simply to bypass the approved architecture.

The required path remains:

```text
Fastify TypeBox routes
  -> OpenAPI generation
  -> openapi-typescript
  -> @repo/api-client
  -> Next.js wishlist/cart/vendor inventory screens
```

Once `pnpm api:generate` can execute and the generated client includes P3/P4/P5 routes, the buyer wishlist/cart UI and vendor inventory UI can be wired through the typed client.

## 15. P5 Exit Gate Assessment

### Source-level implementation

- [x] inventory contracts;
- [x] inventory repository/service/routes;
- [x] vendor-scoped inventory authorization;
- [x] optimistic inventory adjustment versioning;
- [x] stock adjustment ledger;
- [x] inventory database constraint source;
- [x] authenticated wishlist contracts/repository/service/routes;
- [x] wishlist ownership checks;
- [x] cart contracts/repository/service/routes;
- [x] multi-store cart behavior;
- [x] server-authoritative price/stock handling;
- [x] checkout-preview endpoint;
- [x] P5 route/contract tests committed;
- [x] modular catalog commerce boundary introduced.

### Execution evidence still required

- [ ] `pnpm install --frozen-lockfile` succeeds from a fresh clone;
- [ ] Prisma validation/generation succeeds;
- [ ] required SQL constraints are present in the reviewed migration;
- [ ] migrations apply to an empty PostgreSQL database;
- [ ] migration contains/produces a safe zero-stock baseline for existing variants where required;
- [ ] TypeScript typecheck succeeds;
- [ ] contract/API tests execute successfully;
- [ ] OpenAPI regenerates with P3/P4/P5 routes;
- [ ] typed API client regenerates and typechecks;
- [ ] database-backed horizontal authorization test proves vendor A cannot change vendor B inventory;
- [ ] database-backed concurrent inventory adjustment test proves stale versions cannot overwrite stock;
- [ ] database-backed cart ownership test proves one user cannot mutate another user's cart item;
- [ ] database-backed one-active-cart constraint is proven;
- [ ] Next.js wishlist/cart and vendor inventory screens use the regenerated typed client;
- [ ] full build passes.

## 16. Current Verification Blocker

The repository has had a continuing GitHub Actions infrastructure/startup problem in which runs finish as `startup_failure` with zero jobs created. Until that is resolved, a workflow run is not evidence that source compilation/tests failed, because the jobs did not start.

P5 should therefore be described as **implemented at source level, not execution-verified**.

## 17. Handoff to P6

P6 may now build the actual checkout transaction on top of these P5 boundaries.

The most important rules P6 must preserve are:

```text
cart is not inventory reservation
preview is not checkout authorization
frontend totals are never authoritative
reservation mutations must preserve inventory concurrency invariants
checkout must be idempotent
one checkout -> parent Order + VendorOrders by store
```

P6 is responsible for the 15-minute reservation lifecycle, immutable order-item price/product snapshots, parent/vendor order creation, cancellation/release behavior, and logical PaymentIntent creation boundary.
