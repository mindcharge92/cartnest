# ADR-009: Product Media Upload and Object Storage

**Status:** Proposed baseline  
**Date:** 5 September 2026

## Context

Products and stores require images and potentially future video/media. PostgreSQL should store relational metadata, not large binary objects.

Media upload must also prevent users from writing arbitrary objects, overwriting another vendor's content, or using unrestricted upload URLs.

## Decision

Use S3-compatible object storage for binary media and PostgreSQL for media metadata.

The backend controls upload authorization. The browser may upload directly to object storage using a short-lived presigned upload request when supported.

## Target Flow

```text
Vendor browser
  -> POST /api/v1/media/uploads
  -> Fastify verifies identity, vendor ownership, MIME/size policy
  -> Fastify creates upload intent / object key
  -> returns short-lived presigned upload data
  -> browser uploads object
  -> browser/API confirms completion
  -> backend verifies metadata where necessary
  -> media record becomes ACTIVE
```

## Storage Key Strategy

Keys must not rely only on original filenames.

Example:

```text
vendors/{vendorId}/stores/{storeId}/products/{productId}/{mediaId}.webp
```

Original filename may be retained as metadata but not trusted as the storage key.

## Metadata

Recommended media record:

- id;
- owner type;
- owner ID;
- object key;
- bucket;
- MIME type;
- byte size;
- width/height where available;
- original filename;
- alt text;
- display order;
- status;
- createdBy;
- createdAt;
- deletedAt where required.

## Security Rules

- validate MIME type and extension policy;
- enforce maximum size;
- generate server-controlled object keys;
- authorize vendor/store ownership before creating upload intent;
- use short-lived presigned credentials;
- never expose permanent provider credentials to the browser;
- block executable/unapproved content types;
- consider malware/image validation for risky content;
- ensure vendor A cannot attach media to vendor B resources.

## Image Processing

MVP may store original validated images and optionally derive optimized variants.

Future processing may create:

- thumbnails;
- storefront cards;
- product detail images;
- WebP/AVIF variants.

Media processing can later move to an asynchronous worker without changing the public product model.

## Deletion

Deleting a product should not blindly delete media synchronously if order/history/audit views still reference it.

Use a lifecycle policy:

1. detach or mark media deleted;
2. verify no retained business record requires it;
3. remove binary object asynchronously;
4. preserve required audit metadata.

## CDN

A CDN may front public product/store images. CDN URL shape must not become the persistent identity; the object key/media ID remains canonical.

## Open Questions

- storage provider;
- allowed image types;
- maximum upload size;
- whether video is in MVP;
- moderation flow;
- image transformation provider/library;
- retention policy after deletion.
