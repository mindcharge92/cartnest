# ADR-009: Product Media Upload and Cloudflare R2 Object Storage

**Status:** Accepted  
**Accepted:** 5 September 2026  
**Initial Provider:** Cloudflare R2

## Decision

CartNest stores product/store binary media in **Cloudflare R2** and relational media metadata in PostgreSQL.

Uploads use a backend-authorized, short-lived direct-upload workflow. Fastify verifies the authenticated vendor/store scope and creates a server-controlled object key/upload authorization. The browser uploads directly to R2 rather than proxying normal product image bytes through the Fastify process.

## 1. Flow

```text
Vendor browser
  -> POST /api/v1/media/uploads
  -> Fastify authenticates + authorizes vendor/store/product
  -> validates requested media type/size policy
  -> creates upload intent + server-generated object key
  -> returns short-lived presigned R2 upload information
  -> browser uploads directly to Cloudflare R2
  -> client/backend confirms completion
  -> backend verifies object metadata where required
  -> Media record becomes ACTIVE
```

Permanent R2 credentials are never exposed to the browser.

## 2. Why R2

R2 provides an S3-compatible object-storage model suitable for the approved presigned/direct-upload architecture. The application should keep provider-specific code behind a storage adapter so moving to another S3-compatible provider does not require changes to Product/Store domain contracts.

## 3. Storage Adapter

Define an internal object-storage abstraction for operations such as:

```text
createPresignedUpload
headObject / verifyObject
createReadUrl or public URL mapping
copy/move if required
mark/delete object
```

Product/catalog code references `Media` IDs/metadata, not R2 SDK response types.

## 4. Key Strategy

Keys are server-generated and scoped. Example:

```text
vendors/{vendorId}/stores/{storeId}/products/{productId}/{mediaId}/original.webp
```

Do not use the original filename as canonical identity.

## 5. PostgreSQL Media Record

Recommended fields include:

- media ID;
- owner type / owner ID;
- vendor/store scope;
- R2 bucket/logical storage location;
- object key;
- MIME type;
- byte size;
- dimensions where available;
- checksum where useful;
- original filename metadata;
- alt text;
- display order;
- status;
- createdBy/createdAt;
- deletedAt/lifecycle metadata.

## 6. Upload Security

Required controls:

- authorize vendor/store/product ownership before issuing upload permission;
- short expiration;
- server-generated key;
- allowed MIME/type list;
- maximum object size;
- prevent arbitrary bucket/key overwrite;
- do not trust browser-declared MIME alone after upload;
- block executable/unapproved media;
- ensure vendor A cannot attach media to vendor B resources;
- log/audit abuse-relevant events without exposing credentials.

## 7. Image Processing

MVP may preserve validated originals and generate optimized variants according to frontend needs.

Future asynchronous media processing may produce:

- thumbnails;
- catalog-card sizes;
- product detail sizes;
- WebP/AVIF variants.

The canonical `Media` identity remains stable while physical variants evolve.

## 8. Delivery/CDN

Public media may be served through an approved R2/public-domain/CDN configuration.

Do not persist a transient CDN URL as the only identity. Persist object key/media ID and derive delivery URL through the media/storage layer.

## 9. Deletion and Retention

Deletion is lifecycle-based:

1. mark/detach Media record;
2. ensure retained orders/audit do not require the object;
3. enqueue/perform object deletion;
4. retain only metadata required by policy.

NDPR/privacy and business record retention requirements apply.

## 10. Still Configurable Before UI Completion

The provider is decided, but these values remain configuration/product policy:

- allowed image formats;
- max image size/count per product;
- video support (not assumed in MVP);
- image transformation pipeline;
- moderation/scanning requirements;
- retention duration for detached objects.

## Final Decision

Cloudflare R2 is CartNest's initial object-storage provider. Fastify authorizes vendor-scoped upload intents and the browser uploads directly using short-lived presigned authorization. PostgreSQL stores canonical media metadata, and storage-provider details remain behind an adapter.
