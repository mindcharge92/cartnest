# Frontend FP4 — Marketplace Catalog, Products, Variants, and Media

**Status:** Source baseline implemented; runtime/browser execution evidence pending  
**Updated:** 5 September 2026

## 1. Scope

FP4 integrates the P4 catalog and media domain into the Next.js frontend without introducing a second set of API DTOs.

Implemented buyer routes:

```text
/marketplace
/products/:productId
```

Implemented vendor routes:

```text
/vendor/:vendorId/products
/vendor/:vendorId/products/new
/vendor/:vendorId/products/:productId
```

The frontend continues to call CartNest through `@repo/api-client` using DTOs from `@repo/contracts`. The only direct browser `fetch` in this feature is the presigned PUT to Cloudflare R2, which is an external object-storage upload rather than a normal CartNest API request.

## 2. Public Marketplace

`/marketplace` now supports:

- full-text product search;
- admin-controlled category filtering, including category hierarchy labels;
- minimum and maximum NGN price filters;
- newest/name sorting;
- pagination;
- loading, empty, validation, and recoverable error states;
- responsive product cards;
- server-authoritative product/store/vendor visibility.

The backend exposes only ACTIVE products from ACTIVE stores owned by APPROVED vendors and only moderation states allowed for public sale.

Price filtering and displayed `priceFrom` now use the same eligible active-variant price range. A product matched by a high minimum-price variant will not misleadingly display a cheaper variant that was outside the active filter.

## 3. Product Detail and Variant Selection

`/products/:productId` exposes:

- product media gallery;
- store/vendor identity;
- category;
- product description;
- normalized option/value selectors;
- current variant SKU and price.

Variant selection does not invent combinations. The selector now handles sparse variant matrices correctly: choosing a value that exists only in another valid combination moves the selection directly to the best compatible real variant instead of disabling both sides of the transition or silently falling back to an unrelated variant.

The variant-selection behavior is isolated in testable catalog utilities and has a regression test for a sparse `Red/Small` + `Blue/Large` catalog.

## 4. Vendor Product Management

The vendor catalog supports:

- listing products by store;
- dedicated `product:read` permission;
- product draft creation;
- normalized option definitions;
- Cartesian variant generation capped at the 250-variant contract limit;
- per-store SKU validation;
- integer minor-unit NGN pricing;
- product metadata editing;
- adding and editing variants;
- variant activation/deactivation;
- publishing and archiving;
- moderation-state visibility;
- product media management.

Existing staff that previously received `product:create`, `product:update`, or `product:archive` retain effective product-read access. This avoids breaking previously configured memberships when `product:read` was introduced as a first-class permission.

## 5. Vendor Context Integrity

`VendorProductDto` now carries the authoritative `vendorId` derived by the backend from `Product -> Store -> Vendor`.

The product editor compares that value with the vendor workspace in the route before rendering the product. This replaces the earlier weaker client check and avoids requiring an unrelated `store:read` permission merely to prove which vendor owns the product.

The Fastify authorization boundary remains authoritative for every product/variant/media request; the frontend check exists to prevent confusing cross-vendor workspace rendering for users who belong to more than one vendor.

## 6. Moderation Invalidation

A product that has entered moderation must not keep a stale approval after vendor-editable commercial content changes.

The repository now performs the content mutation and moderation invalidation in the same PostgreSQL transaction for:

```text
product metadata update
variant creation
variant update
product media completion
product media metadata update
product media deletion
```

For products whose moderation state is not `NOT_REQUIRED`, these mutations atomically move the product to:

```text
moderationStatus = PENDING
status           = DRAFT
```

This removes the prior visibility window in which changed content could be committed while the older approval still existed.

## 7. Cloudflare R2 Media

FP4 follows ADR-009:

```text
Vendor browser
   -> CartNest upload intent
   -> backend authorizes product/store scope
   -> server-generated R2 object key
   -> short-lived presigned PUT
   -> browser uploads directly to R2
   -> CartNest completion endpoint
   -> backend HEAD + byte-signature verification
   -> Media ACTIVE
```

Supported MVP image types remain JPEG, PNG, and WebP up to 10 MB.

The completion boundary no longer trusts only the browser-supplied `Content-Type`. R2 storage inspection validates the actual JPEG/PNG/WebP signature bytes before the Media record becomes ACTIVE.

Media deletion is lifecycle-safe: CartNest first marks the media record DELETED so it stops being public, then performs the idempotent R2 object delete. A temporary R2 deletion failure is retryable.

## 8. Contract and Integration Fixes

Issues found and fixed during FP4 include:

1. product viewing incorrectly depended on mutation permissions — `product:read` is now first-class;
2. existing product managers could have lost read access — legacy product permissions imply read access;
3. filtered catalog cards could show a price outside the active filter — `priceFrom` now uses matching variants;
4. option selection could deadlock on sparse variant combinations — changing a value now moves to a real compatible variant;
5. product detail could silently select an unrelated variant — no fallback variant is fabricated;
6. vendor product route context was not independently represented by the product DTO — backend-derived `vendorId` is now explicit and checked by the editor;
7. moderated content mutations could preserve stale approval briefly — invalidation is now transactional with product/variant/media mutations;
8. object validation trusted declared MIME too heavily — stored image signatures are checked;
9. media had no complete vendor-facing deletion operation — DELETE + R2 cleanup is implemented;
10. catalog API integration was missing from the shared client bridge — `createCatalogApi` now centralizes the contract-derived calls;
11. the public product detail JSON Schema intersection issue is avoided by the dedicated closed-object public detail schema exported as the API response schema.

## 9. Tests Added

Source tests now cover:

- FP4 OpenAPI route presence;
- media DELETE route presence;
- rejection of unsupported SVG upload intents;
- NGN parsing/formatting;
- slug normalization;
- variant-combination generation and the 250-variant limit;
- sparse valid-variant switching;
- `product:read` contract support;
- required vendor ownership in `VendorProductDto`.

These tests are committed, but GitHub Actions has not executed them because of the existing workflow-startup failure.

## 10. External / Runtime Items Still Pending

### GitHub Actions

The repository continues to receive synthetic runs with:

```text
path: BuildFailed
conclusion: startup_failure
jobs: 0
```

No runner job starts, so there is still no CI evidence for install, lint, typecheck, tests, build, or generated OpenAPI-client refresh.

### Browser and R2 evidence

The following still require an executable local/staging environment:

- responsive browser QA;
- real buyer/vendor API integration;
- real R2 presigned PUT;
- R2 bucket CORS allowing the CartNest web origin, PUT, and required headers;
- upload completion against actual R2 object metadata;
- generated OpenAPI client regeneration.

R2 CORS is infrastructure/provider configuration and cannot be proven by repository source alone.

## 11. FP4 Exit-Gate State

```text
Public marketplace                    IMPLEMENTED
Search/category/price/sort/page       IMPLEMENTED
Public product detail                 IMPLEMENTED
Valid normalized variant selection    IMPLEMENTED
Vendor product list/create/edit       IMPLEMENTED
Product read authorization            IMPLEMENTED
Per-store SKU + NGN variant editing   IMPLEMENTED
R2 direct-upload frontend             IMPLEMENTED
Stored image-signature verification   IMPLEMENTED
Media update/delete lifecycle         IMPLEMENTED
Transactional moderation invalidation IMPLEMENTED
Vendor workspace ownership check      IMPLEMENTED
Shared contract-derived API client    IMPLEMENTED
Source tests                          COMMITTED
Runtime build/test evidence           NOT EXECUTED
Browser/R2 integration evidence       NOT EXECUTED
```

FP4 is therefore complete at the **source-baseline level**, with execution evidence still blocked by the repository's external CI/runtime constraints.

## 12. Next Frontend Phase

**FP5 — inventory, authenticated wishlist, and multi-store cart frontend/integration.**
