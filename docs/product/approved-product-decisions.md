# CartNest Approved Product & Architecture Decisions

**Status:** Approved baseline  
**Approved:** 5 September 2026  
**Applies to:** MVP architecture, first Prisma migrations, API contracts, frontend/backend implementation, and future implementation planning

This document records the business and product decisions confirmed before implementation begins. Where an earlier ADR/specification still contains an open-question section, this document is authoritative until that document is updated.

## 1. Vendor and Store Model

1. A vendor may own **multiple stores**.
2. A user may belong to **multiple vendors**. A user can own one vendor and be staff of another.
3. New vendors require **admin approval before they may sell publicly**.
4. Vendor access uses **roles plus granular permissions**, with resource ownership enforced by the backend.
5. A customer may become a vendor using the **same CartNest user account**; separate customer/vendor identities are not required.
6. Vendor subscription plans are **not part of MVP**, but the model must not prevent future subscription tiers.
7. Admin impersonation of customer/vendor accounts is **not included in MVP**.

## 2. Catalog, Products, Variants, and Inventory

1. SKU uniqueness is **per store**.
2. Products support **variants**.
3. Variant options/values use a **normalized relational model**, not an unstructured JSON-only model as the primary source of truth.
4. Inventory is tracked at **variant level**.
5. Marketplace categories are **admin-controlled**.
6. Product publication uses **risk-based moderation**: normal products may publish without mandatory manual approval, while flagged/high-risk products can require moderation.
7. Catalog authorization is store/vendor scoped; a vendor must never mutate another vendor's catalog by changing an ID.

Example:

```text
Product: Running Shoe
  -> Variant: Black / 42 -> SKU RUN-BLK-42 -> Inventory
  -> Variant: Black / 43 -> SKU RUN-BLK-43 -> Inventory
  -> Variant: White / 42 -> SKU RUN-WHT-42 -> Inventory
```

## 3. Authentication, Accounts, and Vendor Verification

1. CartNest supports **email + phone** as account contact identities.
2. One verified identifier may be sufficient for initial registration, while the other can be added/verified according to workflow requirements.
3. Vendors undergo **additional verification/KYC** beyond ordinary customer registration.
4. MFA is **required for ADMIN and SUPER_ADMIN** before production; it is optional for customers/vendors initially.
5. MVP social authentication supports **Google**. Social login must not block delivery of the core email/phone authentication flow.
6. Browser authentication uses **short-lived access credentials plus rotating, revocable refresh sessions in Secure, HttpOnly cookies**.
7. Approved durations:
   - access credential: **15 minutes**;
   - refresh session: **30 days**;
   - logout/password-reset/security events may revoke sessions.
8. Fastify remains the security authority. Next.js role-aware UI is UX only and never replaces backend authorization.

## 4. Cart, Checkout, Orders, and Inventory Reservations

1. One cart may contain products from **multiple vendors/stores**.
2. One customer checkout creates:

```text
Parent Order
  -> VendorOrder A
  -> VendorOrder B
  -> VendorOrder C
```

3. Each VendorOrder may have **multiple shipments**.
4. After successful payment, vendor orders are **automatically accepted by default**, unless a product/store/business rule requires manual processing.
5. Inventory is reserved for **15 minutes** during the standard payment window.
6. Cancellation is **state-based**:
   - `PENDING_PAYMENT`: immediate cancellation and reservation release;
   - `PAID` / pre-processing: automatic cancellation or short grace policy where allowed;
   - `PROCESSING`: cancellation request/policy evaluation;
   - `SHIPPED`: use return workflow instead of ordinary cancellation.
7. Inventory reservation, checkout creation, payment initialization, and cancellation/refund mutations must be idempotent and concurrency-safe.

## 5. Payments and Marketplace Revenue

1. **Paystack is the default gateway** for MVP.
2. **Flutterwave is the secondary/fallback provider**.
3. Customers do **not** choose the payment gateway directly; CartNest routes providers internally.
4. Gateway fallback follows the safe-failover rule:
   - definite non-charge failure -> retry/fallback allowed;
   - unknown/processing/timeout after initiation -> reconcile before retry;
   - successful charge -> never retry.
5. For MVP, **gateway transaction fees are borne by the vendor** and must be represented separately from platform commission. This policy should remain configurable so the business can change it later without rewriting order history.
6. MVP monetization is **percentage commission on sales**.
7. Commission is **configurable per vendor and/or category**, with a platform default. The actual applied rate/amount is snapshotted on the VendorOrder/payment allocation so later configuration changes do not rewrite history.
8. Future business plans may add vendor subscription tiers, but subscriptions are not launch scope.
9. Preferred vendor settlement model is **gateway split-payment/subaccount settlement where provider/business requirements allow it**.
10. Settlement eligibility is tied to **delivery confirmation**, then released through a configurable scheduled settlement window (baseline target: **T+2 after delivery eligibility**, subject to provider capability and final operations policy).
11. Refunds may be partial and can target item/vendor-order components.
12. Vendors may initiate/approve refunds within defined limits; admins may review/override according to permission and policy.

## 6. Money, Tax, Promotions, and Refund Economics

1. Financial truth uses **integer minor units** with explicit currency.
2. NGN representation:

```text
NGN 50,000.00 = 5,000,000 kobo
```

3. Persisted/accounting amounts must not use binary floating point.
4. Backend calculations are authoritative; frontend formatting is presentation only.
5. MVP supports a **configurable platform VAT/tax percentage** rather than a full tax engine.
6. MVP promotions begin with **platform-controlled coupons/promotions**.
7. Architecture must permit future vendor-level promotions as well.
8. Price, commission, gateway fee, tax, discount, delivery fee, and allocation values used for an order must be snapshotted for reconciliation.

## 7. Logistics and Delivery

1. Implement a **provider-neutral logistics abstraction from day one**.
2. **GIG Logistics is the first adapter/integration target**.
3. Vendors may also use **self-managed/manual delivery** where marketplace policy permits.
4. Delivery fees are calculated **per VendorOrder/store**, not as one arbitrary global shipment fee.
5. Future adapters may include Sendbox, Kwik, or other providers without rewriting the orders module.

## 8. Returns and Reviews

1. Model proper return/RMA entities from the beginning, even if the full return UI ships later:
   - `ReturnRequest`;
   - `ReturnItem`;
   - return state/history;
   - linkage to refunds.
2. A product review requires an eligible purchase that has reached **DELIVERED** state.
3. Reviews support both **product reviews** and **store/vendor reviews/ratings**.
4. Review moderation and anti-abuse rules remain backend-controlled.

## 9. Product Media

1. Product/store media uses **direct-to-object-storage uploads using short-lived presigned authorization**.
2. Fastify authorizes the upload and owns object-key policy; the browser never receives permanent storage credentials.
3. **Cloudflare R2** is the approved initial object-storage provider.
4. PostgreSQL stores media metadata; R2 stores binary objects.
5. Media keys are server-generated and vendor/store scoped.
6. Image optimization/variants may be asynchronous and added without changing the canonical Media model.

## 10. Buyer Account Scope

1. **Account is required for MVP checkout**. Guest checkout is a future enhancement.
2. Wishlist requires an authenticated account for MVP.
3. The same user identity can act as customer and vendor member/owner.

## 11. API Consumer Strategy

CartNest APIs must be designed for more than the current Next.js app.

The API baseline must remain suitable for:

- Next.js web client;
- future mobile application;
- approved internal/admin clients;
- future third-party integrations.

Therefore `/api/v1`, OpenAPI, shared DTO contracts, explicit authentication/authorization, compatibility rules, and a generated typed API client remain required architectural decisions.

## 12. Decisions That Remain Configurable Rather Than Hard-Coded

The following are approved concepts but must be configuration/domain data rather than source-code constants where practical:

- commission default and vendor/category overrides;
- gateway fee policy;
- vendor staff permissions;
- risk/moderation rules;
- VAT/tax percentage;
- coupon rules;
- settlement delay/window;
- supported payment channels;
- shipping methods/provider availability;
- return/cancellation windows.

## 13. Implementation Rule

When implementation begins, code, migrations, DTOs, tests, and API documentation must follow this register and the ADRs. A developer or AI coding agent must not silently choose a different behavior because a framework default or generated scaffold suggests one.

Any intentional change to an approved item must be documented as a new/updated ADR or product decision before it becomes the new baseline.
