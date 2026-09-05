# Frontend FP5 — Inventory, Wishlist, and Cart

**Status:** Source baseline implemented; runtime/browser execution evidence pending  
**Updated:** 5 September 2026

## 1. Scope

FP5 integrates the P5 inventory, wishlist, cart, and checkout-preview capabilities into the Next.js application while preserving the approved shared-contract boundary.

Implemented buyer routes:

```text
/wishlist
/cart
/products/:productId  (cart + wishlist actions added)
```

Implemented vendor route:

```text
/vendor/:vendorId/inventory
```

The web application consumes the new domain surfaces through `@repo/api-client` wrappers backed by DTOs from `@repo/contracts`. Normal CartNest API requests still pass through the shared browser transport, which supplies cookies and CSRF headers for authenticated mutations.

## 2. Shared FP5 Client Bridge

The shared API client now exports:

```text
createInventoryApi
createWishlistApi
createCartApi
```

Supported operations are:

```text
Inventory
GET  /api/v1/stores/:storeId/inventory
GET  /api/v1/inventory/:variantId
POST /api/v1/inventory/:variantId/adjust
GET  /api/v1/inventory/:variantId/adjustments

Wishlist
GET    /api/v1/wishlist
POST   /api/v1/wishlist/items
DELETE /api/v1/wishlist/items/:wishlistItemId

Cart
GET    /api/v1/cart
POST   /api/v1/cart/items
PATCH  /api/v1/cart/items/:cartItemId
DELETE /api/v1/cart/items/:cartItemId
GET    /api/v1/checkout/preview
```

`apps/web/lib/api.ts` wires these clients through the same authenticated browser transport as the existing vendor and catalog clients.

## 3. Product Detail Commerce Actions

The public product detail page now supports authenticated commerce actions against the selected real variant:

- quantity entry;
- add selected variant to cart;
- save selected variant to wishlist;
- backend stock/availability errors surfaced to the buyer;
- unauthenticated users receive sign-in links that preserve the product return path;
- session-service failure is distinguished from a signed-out state and disables mutations until session verification succeeds.

Sparse option matrices remain governed by the FP4 valid-variant selector, so a cart/wishlist mutation never receives a fabricated option combination from the UI.

## 4. Wishlist

`/wishlist` is authenticated and supports:

- available saved products and variants;
- current variant/product pricing from the public catalog boundary;
- add a saved variant to cart;
- open a product to choose a variant when the wishlist entry was product-level;
- remove saved items;
- loading, empty, error, success, and mutation states.

### Unavailable wishlist records

The earlier P5 response silently omitted saved rows when a product or selected variant stopped being publicly available. That created an invisible record that the buyer could not remove.

The shared contract now returns:

```text
items
unavailableItems
```

Unavailable rows retain the wishlist item ID and product/variant IDs so the UI can explain that the saved item is unavailable and still let the user remove it.

## 5. Cart

`/cart` now supports:

- multi-store grouping;
- product/variant identity and current server-authoritative line subtotal;
- quantity editing;
- available-quantity feedback;
- item removal;
- cart unit/store/subtotal summary;
- checkout readiness preview;
- preview issue display;
- loading, empty, error, success, and mutation states.

The cart deliberately does **not** reserve stock. Checkout remains the reservation boundary. The frontend displays current availability, while the backend revalidates again in the checkout preview and later order-creation transaction.

### Recoverable stale cart lines

Previously `CartService.toResponse()` filtered unavailable product/variant rows out of the visible cart even though they remained in the database and could block checkout.

The contract now returns:

```text
items
unavailableItems
```

Unavailable rows retain enough context to display and remove them, including:

- cart item ID;
- variant ID;
- known product/store/SKU context where available;
- quantity;
- stable issue code;
- explanatory message.

This avoids hidden, undeletable cart records.

## 6. Vendor Inventory Workspace

`/vendor/:vendorId/inventory` now supports:

- store selection;
- product/variant/SKU identity;
- normalized variant option labels;
- on-hand quantity;
- reserved quantity;
- available quantity;
- inventory version;
- search by product, SKU, or option value;
- read-only rendering for `inventory:read` staff;
- manual adjustment for `inventory:adjust` staff;
- non-zero integer delta validation;
- mandatory adjustment reason;
- adjustment ledger/history;
- optimistic version-conflict recovery.

When an `INVENTORY_VERSION_CONFLICT` occurs, the UI attempts to reload the current variant inventory automatically and asks the operator to review the refreshed values before retrying.

The inventory DTO was expanded to include normalized option selections so operators do not have to infer a variant only from an SKU.

## 7. Vendor Permission Fixes

FP5 exposed an authorization usability problem: an operator could be granted a scoped capability such as `inventory:adjust` but still lack the read permission needed to navigate to the relevant store or inspect the resource before acting.

Server-side effective permissions now derive prerequisite read capabilities without granting unrelated mutation powers.

Examples:

```text
inventory:adjust -> inventory:read -> store:read
product:update   -> product:read   -> store:read
order:fulfill    -> order:read     -> store:read
staff:update     -> staff:read
```

The backend remains authoritative. These are capability prerequisites, not broad administrative escalation.

## 8. Concurrency and Duplicate-Save Fixes

### Active cart creation

The reviewed PostgreSQL source already defines:

```text
Cart_one_active_per_user
```

as a partial unique index for `status = 'ACTIVE'`.

`PrismaCartRepository.getOrCreateActive()` now handles the race where two first requests both observe no active cart. If one request loses the unique-index race, it reloads and returns the winning active cart rather than surfacing a database error.

### Wishlist creation and duplicate saves

Wishlist creation now uses `upsert` on the unique `userId` instead of a find-then-create race.

The database source also defines a partial unique index for product-level wishlist entries where `variantId IS NULL`, because PostgreSQL normally treats NULL values as distinct inside a composite unique index.

Concurrent duplicate saves are now treated idempotently: a Prisma unique-constraint race reloads and returns the existing wishlist item.

## 9. Navigation and Session-State Fixes

The authenticated header now exposes:

```text
Marketplace
Saved
Cart
Seller
Account
```

The expanded navigation receives a small-screen horizontal overflow treatment rather than forcing links outside the viewport.

A session lookup error is no longer presented as definite signed-out state. The header offers a session retry, and product commerce mutations remain disabled until the session is known.

The vendor workspace sidebar now exposes Inventory when the effective membership includes `inventory:read`.

## 10. Tests and Contract Coverage

Committed source tests now additionally cover:

- inventory DTO option selections;
- recoverable unavailable wishlist entries;
- recoverable unavailable cart lines;
- prerequisite vendor read-permission derivation;
- existing optimistic inventory contract behavior;
- existing cart quantity and checkout-preview contract behavior.

The existing P5 Fastify route-contract test continues to verify inventory, wishlist, cart, and checkout-preview OpenAPI registration.

## 11. Intentional FP6 Boundary

The cart shows checkout readiness, but the final order-creation action remains disabled in FP5.

This is intentional. The next phase owns:

```text
checkout address snapshot
idempotency key
15-minute reservation creation
parent Order creation
per-store VendorOrder decomposition
order confirmation/history UI
```

FP5 therefore does not create a dead `/checkout` link or bypass the P6 order transaction.

## 12. Runtime / Infrastructure Evidence Still Pending

GitHub Actions remains unable to start jobs for repository pushes. Until that infrastructure issue is resolved, there is no trusted CI execution evidence for:

- install;
- lint;
- typecheck;
- tests;
- Next.js build;
- generated OpenAPI-client regeneration.

Browser-level evidence is also still required for:

- responsive cart/wishlist/inventory QA;
- keyboard interaction checks;
- authenticated cookie + CSRF integration against a running API;
- optimistic inventory conflict behavior against PostgreSQL;
- real multi-store cart data;
- unavailable-item recovery against real state changes.

## 13. FP5 Exit-Gate State

```text
Shared inventory API client             IMPLEMENTED
Shared wishlist API client              IMPLEMENTED
Shared cart API client                  IMPLEMENTED
Product -> cart integration             IMPLEMENTED
Product -> wishlist integration         IMPLEMENTED
Wishlist route/UI                       IMPLEMENTED
Unavailable wishlist recovery           IMPLEMENTED
Multi-store cart route/UI               IMPLEMENTED
Unavailable cart recovery               IMPLEMENTED
Checkout readiness preview UI           IMPLEMENTED
Vendor inventory route/UI               IMPLEMENTED
Variant option identity in inventory    IMPLEMENTED
Optimistic inventory adjustment UI      IMPLEMENTED
Inventory adjustment history            IMPLEMENTED
Scoped read-permission prerequisites    IMPLEMENTED
Active-cart creation race recovery      IMPLEMENTED
Wishlist race/idempotency hardening     IMPLEMENTED
Responsive authenticated nav treatment  IMPLEMENTED
Source tests                            COMMITTED
Runtime build/test evidence             NOT EXECUTED
Browser/PostgreSQL integration evidence NOT EXECUTED
```

FP5 is complete at the **source-baseline level**. Runtime exit evidence remains blocked by the repository's existing CI/runtime constraint.

## 14. Next Frontend Phase

**FP6 — checkout, inventory reservations, parent/vendor orders, cancellation, and buyer/vendor order interfaces.**
