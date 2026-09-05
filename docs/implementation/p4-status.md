# P4 — Catalog, Variants, Categories, Media, and Moderation Status

**Phase:** P4  
**Status:** Backend/domain baseline implemented; executable codegen, database/index migration, R2 integration evidence, vendor product UI, and full CI exit-gate verification remain pending  
**Updated:** 5 September 2026

## 1. Scope

P4 establishes the product-catalog boundary on top of the P3 vendor/store ownership model. It uses the existing normalized Prisma catalog schema rather than replacing it with JSON product blobs or frontend-owned product shapes.

The phase follows this authority chain for protected catalog work:

```text
CartNest session
  -> server-resolved Store
  -> server-resolved VendorMember
  -> active membership
  -> product permission
  -> matching store ownership
  -> product/store business state
```

A `storeId`, `productId`, SKU, hidden UI control, or browser-supplied vendor identifier is never proof of catalog authorization.

## 2. Shared Contract Surface

`@repo/contracts` now defines runtime TypeBox contracts and inferred TypeScript DTOs for:

- category status, hierarchy, creation, update, and responses;
- product status and moderation status;
- normalized product options and option values;
- product variants and variant option selections;
- vendor-facing product responses;
- buyer-safe product summary/detail responses;
- product create/update payloads;
- variant create/update payloads;
- catalog query, search, filters, sorting, and pagination;
- media ownership, lifecycle, upload intent, completion, ordering, and alt text;
- admin moderation requests.

The buyer product-detail response is a closed response contract and does not expose the vendor-facing moderation/storage fields.

## 3. Category Model

Marketplace categories remain administrator-controlled.

P4 implements:

```text
Category
  -> parent Category (optional)
  -> child Categories
  -> Products
```

Administrative operations require `ADMIN` or `SUPER_ADMIN` plus privileged MFA.

Hierarchy protections include:

- globally unique category slugs;
- parent category must exist;
- a category cannot parent itself;
- an update cannot create an ancestor cycle;
- inactive categories cannot be assigned to newly created/updated products;
- public category responses return active categories only.

Catalog filtering by a category includes its active descendants so a query for a parent category can match products in child categories.

## 4. Normalized Products and Variants

P4 uses the approved relational shape:

```text
Product
  -> ProductOption
       -> ProductOptionValue
  -> ProductVariant
       -> VariantOptionValue
```

Example:

```text
Running Shoe
  Option: Color
    -> Black
    -> White
  Option: Size
    -> 42
    -> 43

Variants
  Black / 42 -> RUN-BLK-42
  Black / 43 -> RUN-BLK-43
  White / 42 -> RUN-WHT-42
```

Product creation validates before persistence that:

- option names are unique;
- values inside an option are unique;
- each variant selects exactly one defined value for every product option;
- a variant cannot select one option twice;
- duplicate variant combinations are rejected;
- duplicate SKUs inside one product request are rejected;
- a product without options has exactly one variant;
- all variant prices cross the API as lossless minor-unit money values.

The database remains authoritative for the final `@@unique([storeId, sku])` guarantee. P4 also performs an application-level collision check so the API can return a domain-specific conflict rather than relying only on a raw database exception.

This means:

```text
Store A / SKU-001 + Store A / SKU-001 -> rejected
Store A / SKU-001 + Store B / SKU-001 -> allowed
```

## 5. Money Baseline for the Catalog

Persisted variant prices use integer `BigInt` minor units. JSON transport uses the existing lossless decimal-string `Money` contract.

For P4, product-price creation and public catalog filtering currently enforce **NGN**.

This is an implementation/MVP baseline for the Nigerian marketplace, not a claim that the architecture can never support another currency. Mixed-currency marketplace behavior would require an explicit pricing/FX product decision rather than silently comparing unrelated currencies in catalog sorting/filtering.

## 6. Vendor Product Lifecycle

Products begin as:

```text
status = DRAFT
moderationStatus = NOT_REQUIRED
```

Authorized vendor members may prepare draft products before the vendor is approved, consistent with the P3 rule that operational preparation is allowed while selling is not.

Publishing requires all of the following:

```text
Vendor == APPROVED
Store == ACTIVE
Product != ARCHIVED
moderationStatus in { NOT_REQUIRED, APPROVED }
active category when a category is assigned
at least one ACTIVE variant
```

Archiving requires the separate `product:archive` permission.

Protected catalog operations reuse the P3 public ownership boundary instead of directly querying a client-selected vendor identity.

## 7. Risk-Based Moderation Foundation

The approved product decision permits ordinary products to publish without mandatory manual review while flagged/high-risk products can require moderation.

P4 makes those states executable:

```text
NOT_REQUIRED -> ordinary publish path
FLAGGED      -> publish blocked
APPROVED     -> publish allowed
REJECTED     -> product returned to DRAFT
```

Admins can list moderation work and mark products `FLAGGED`, `APPROVED`, or `REJECTED`; moderation mutations require privileged admin MFA and are audited.

P4 does **not** invent a legal/compliance risk classifier or hard-coded prohibited-product policy. Automatic rules that decide which products become high-risk remain a policy/operations concern for later admin-hardening work. The important P4 invariant is that a flagged/rejected product cannot remain publicly sellable.

## 8. Cloudflare R2 Media Lifecycle

Cloudflare R2 is implemented behind an S3-compatible media-storage adapter.

The browser does not receive permanent storage credentials and Fastify does not proxy the image bytes during the normal upload path.

```text
Browser
  -> POST upload intent to Fastify
       -> authorize vendor/store ownership
       -> generate server-controlled object key
       -> create Media(PENDING)
       -> return short-lived presigned PUT

Browser
  -> PUT bytes directly to R2

Browser
  -> POST media completion to Fastify
       -> authorize ownership again
       -> HEAD object in R2
       -> verify object exists
       -> verify exact byte size
       -> verify MIME type when provider reports it
       -> Media(ACTIVE)
```

Accepted P4 image types are:

```text
image/jpeg
image/png
image/webp
```

The upload-intent contract currently limits one object to 10 MiB.

Object keys are generated on the server and scoped by store/product, for example:

```text
stores/{storeId}/products/{productId}/{uuid}.webp
stores/{storeId}/branding/{uuid}.png
```

Media metadata remains in PostgreSQL; the binary object remains in R2. Alt text and display order are updateable after authorization.

The API config now supports:

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_BASE_URL
```

When R2 is not configured, normal system/catalog endpoints remain available but media-upload operations return `MEDIA_STORAGE_UNAVAILABLE`; absence of optional media configuration does not falsely report PostgreSQL/Redis readiness as healthy or unhealthy.

## 9. Buyer Catalog Boundary

Public catalog reads require all of these conditions:

```text
Product == ACTIVE
moderationStatus in { NOT_REQUIRED, APPROVED }
Store == ACTIVE
Vendor == APPROVED
at least one ACTIVE matching variant
```

The buyer response intentionally contains public commerce data only. It does not expose:

- `moderationStatus`;
- R2 bucket name;
- R2 object key;
- media creator user ID;
- vendor membership/permissions;
- KYC records;
- provider-account data;
- internal admin reasons/audit metadata.

Buyer catalog capabilities implemented in the backend include:

- text search over product name/description;
- category + descendant filtering;
- store filtering;
- minimum/maximum price filtering;
- newest/name sorting;
- bounded pagination;
- buyer product detail with active variants and active media.

## 10. API Surface Added

### Public

```text
GET /api/v1/categories
GET /api/v1/catalog/products
GET /api/v1/catalog/products/:productId
```

### Vendor catalog

```text
GET   /api/v1/stores/:storeId/products
POST  /api/v1/stores/:storeId/products
GET   /api/v1/products/:productId
PATCH /api/v1/products/:productId
POST  /api/v1/products/:productId/variants
PATCH /api/v1/variants/:variantId
POST  /api/v1/products/:productId/publish
POST  /api/v1/products/:productId/archive
```

### Media

```text
POST  /api/v1/media/upload-intents
POST  /api/v1/media/:mediaId/complete
PATCH /api/v1/media/:mediaId
```

### Admin

```text
GET   /api/v1/admin/categories
POST  /api/v1/admin/categories
PATCH /api/v1/admin/categories/:categoryId
GET   /api/v1/admin/products/moderation
POST  /api/v1/admin/products/:productId/moderation
```

## 11. Database and Search Index Source

The existing Prisma schema already contains the P4 persistence model, including:

- category hierarchy;
- per-store product slug uniqueness;
- normalized options and values;
- per-store SKU uniqueness;
- BigInt variant prices;
- moderation state;
- exact product/store media ownership shape.

The PostgreSQL migration-source file now also records P4 index requirements:

- partial public-catalog created-date index;
- `pg_trgm` extension requirement;
- GIN trigram index for product name;
- GIN trigram index for product description.

As with the P1 native constraints, these statements are **migration review source**, not evidence that the indexes have already been applied. They must be incorporated into a reviewed Prisma/PostgreSQL migration when the executable database gate is available.

## 12. Tests and Quality-Gate Wiring

Committed API tests now check that P4 public/vendor/media/admin routes appear in generated OpenAPI, that unavailable catalog persistence returns the standard CartNest error envelope, and that an invalid product payload is rejected by runtime contract validation before application logic.

Database-backed tests are still required to prove:

1. normalized product/option/variant persistence;
2. same-store duplicate SKU rejection;
3. same SKU in two different stores is allowed;
4. cross-store authorization is rejected;
5. publish-state invariants;
6. category-cycle behavior against persistence;
7. catalog filtering and pagination against PostgreSQL;
8. buyer DTOs contain no protected fields;
9. R2 upload intent and successful object-completion verification;
10. size/MIME mismatch cannot activate media.

## 13. Generated OpenAPI and Typed Client

P4 routes are registered through executable Fastify TypeBox schemas, so the existing generation pipeline will include them when this command can run successfully:

```bash
pnpm api:generate
```

The checked-in generated typed-client bootstrap snapshot predates P3/P4 and must not be treated as proof that P4 code generation has already succeeded.

The vendor product-management frontend is therefore deliberately **not wired with ad-hoc `fetch` calls**. The approved API-contract standard requires the Next.js application to consume the generated typed API client. Once generation can execute, P4 frontend product-management screens can be built against the generated client without duplicating endpoint DTOs.

This is an explicit remaining P4 deliverable, not a hidden claim of completion.

## 14. Current P4 Exit-Gate Status

| Criterion | Status |
| --- | --- |
| Shared TypeBox catalog/media contracts | IMPLEMENTED |
| Admin-controlled category API | IMPLEMENTED |
| Normalized option/value/variant service | IMPLEMENTED |
| Per-store SKU checks + DB uniqueness | IMPLEMENTED IN SOURCE |
| Integer minor-unit prices | IMPLEMENTED |
| Vendor/store ownership boundary | IMPLEMENTED |
| Publish-state restrictions | IMPLEMENTED |
| Risk/moderation state foundation | IMPLEMENTED |
| R2 presigned upload adapter | IMPLEMENTED |
| Media completion verification | IMPLEMENTED |
| Buyer-safe catalog/detail API | IMPLEMENTED |
| Search/filter/sort/pagination logic | IMPLEMENTED |
| PostgreSQL catalog index source | IMPLEMENTED; MIGRATION PENDING |
| OpenAPI route-registration tests | COMMITTED; EXECUTION PENDING |
| Database-backed catalog tests | PENDING EXECUTION/IMPLEMENTATION |
| Real R2 integration evidence | PENDING CONFIGURATION/EXECUTION |
| Regenerated OpenAPI + typed client | PENDING EXECUTION |
| Vendor product-management screens using typed client | PENDING CODEGEN |
| Full lint/typecheck/test/build evidence | PENDING EXECUTION |

## 15. P5 Readiness

P5 inventory/wishlist/cart work can build on the P4 variant IDs and P3 store authorization boundary, but it must not redefine product price or product ownership rules.

In particular:

```text
InventoryItem belongs to ProductVariant
frontend price is presentation data only
backend ProductVariant price remains authoritative
vendor inventory mutations must resolve variant -> store -> VendorMember
```

P5 implementation may proceed while the existing CI infrastructure blocker is unresolved, but release-readiness must not be claimed until P1-P4 executable gates have been demonstrated.
