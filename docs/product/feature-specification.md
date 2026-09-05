# CartNest Product Feature Specification

**Product:** Multi-vendor e-commerce platform for Nigerian businesses  
**Status:** Baseline scope extracted from the project proposal and refined with the confirmed architecture decisions  
**Primary market:** Nigerian businesses, SMEs, buyers, and marketplace operators

## 1. Product Vision

CartNest is a web-based multi-vendor e-commerce marketplace designed for the Nigerian business environment. Different Nigerian businesses can create and operate stores on one marketplace while customers discover products, manage carts, make local payments, track orders, and review purchases.

The platform is intended to support both B2C and B2B commerce models, with an initial emphasis on a practical consumer-facing multi-vendor marketplace.

The system must be mobile-first, work well on constrained networks, support Naira-native payments, integrate local logistics workflows, and embed privacy/security controls from the start.

## 2. User Types

### Customer / Buyer

A customer can browse the marketplace, manage a wishlist/cart, purchase products, track orders and shipments, and participate in the review system.

### Vendor Owner

A vendor owner represents a Nigerian business selling through the platform. The owner manages stores, products, inventory, orders, staff, and vendor analytics within authorized scope.

### Vendor Staff

Vendor staff are delegated users with permissions restricted to the vendor/store they are assigned to.

### Marketplace Admin

Administrators oversee vendor approval, users, stores, products/categories, orders, transactions, refunds, moderation, and platform analytics.

### Super Admin

A highly privileged platform administrator responsible for security-sensitive platform administration.

## 3. Buyer-Facing Features

| Feature | Requirement |
| --- | --- |
| Product discovery | Browse marketplace products and stores |
| Product search | Search for products by relevant text fields |
| Filtering | Filter catalog results by supported fields such as category, store, price, and availability |
| Sorting | Sort product listings by approved sort options |
| Product detail | View product description, pricing, media, availability, store/vendor information, and reviews |
| Wishlist | Save products for later consideration |
| Shopping cart | Add, remove, and change quantities before checkout |
| Secure checkout | Revalidate prices/stock and create an order through a secure flow |
| Local payments | Pay in NGN through supported payment providers/channels |
| Order history | View previous/current orders |
| Order tracking | View parent-order and vendor-order progress |
| Shipment tracking | View available tracking details for vendor shipments |
| Reviews | Create/view product reviews according to eligibility policy |
| Responsive experience | Use the marketplace effectively on smartphones and desktop devices |
| Low-bandwidth consideration | Minimize unnecessary payloads/assets and provide visible loading/error states |

## 4. Vendor / Merchant Features

### Vendor Onboarding

- create/apply for a vendor profile;
- provide required business information;
- remain in a review/pending state until platform approval if approval is required;
- receive approved/suspended/rejected status;
- support future verification requirements without redesigning the vendor model.

### Store Management

Vendors can create and manage authorized stores.

Store capabilities include:

- store name and slug;
- description/about information;
- store logo/banner/media;
- store status;
- contact/business settings;
- storefront presentation data.

Whether a vendor may own one or multiple stores remains an explicit business decision; the architecture supports multiple stores.

### Product Management

Vendors can:

- create products;
- edit product information;
- assign categories;
- manage product variants/SKUs;
- manage product images;
- set product status;
- archive products;
- manage price through the approved Money representation.

Product records must not permit a vendor to act on another vendor's store/catalog.

### Inventory Management

Vendors can:

- view inventory;
- maintain stock quantities;
- record authorized manual adjustments;
- view inventory movement/audit information;
- rely on checkout reservations to reduce overselling.

### Vendor Order Management

Vendors see only their own `VendorOrder` portions of customer orders.

Capabilities include:

- list incoming vendor orders;
- view relevant buyer/delivery information needed for fulfillment;
- accept/process orders according to final state policy;
- create/manage shipment information;
- view cancellation/refund state affecting their order;
- update allowed fulfillment statuses.

### Vendor Staff

Vendor owners can delegate work to staff.

The platform supports:

- vendor membership;
- staff status;
- role/permission assignment;
- invitation/addition workflow;
- staff update/removal;
- server-side vendor/store ownership enforcement.

### Vendor Analytics

Vendor-facing analytics may include:

- sales summary;
- order count/status trends;
- product performance;
- top products;
- inventory indicators;
- time-series sales views.

Analytics are reporting/read models and are not the source of truth for financial settlement.

## 5. Multi-Vendor Marketplace Features

CartNest is not a single-store e-commerce website. Multiple Nigerian businesses sell through the same platform.

Required marketplace capabilities include:

- multiple vendors;
- vendor/store isolation;
- independent store profiles;
- vendor-scoped products and inventory;
- one customer cart that may contain products from multiple stores;
- one customer checkout decomposed into vendor orders;
- vendor-specific fulfillment;
- vendor-specific shipment tracking;
- payment allocation across vendor orders/platform components;
- partial cancellation/refund support;
- platform-level administration/analytics.

## 6. Cart and Checkout Features

### Cart

The cart supports:

- add item;
- remove item;
- quantity update;
- clear cart;
- current price/availability estimates;
- products from multiple stores.

Cart data is not final financial truth.

### Checkout Preview

Before committing an order, the backend should:

- reload authoritative product/variant state;
- verify stores/vendors are active;
- verify inventory;
- reprice all items;
- calculate discounts/fees/tax where applicable;
- calculate delivery information/fees when available;
- return an authoritative checkout preview.

### Checkout Submission

Checkout must be idempotent and should:

1. validate the current cart;
2. reserve inventory;
3. snapshot product/price information;
4. create parent order;
5. create one vendor order per store/vendor grouping;
6. create order items;
7. persist financial allocations;
8. create/retrieve payment intent;
9. return payment authorization information.

## 7. Order Features

### Parent Order

The customer sees one checkout-level order.

It contains:

- customer/order identity;
- overall amount/currency;
- overall payment status;
- aggregate order status;
- vendor-order sections;
- delivery-address snapshot;
- relevant payment/refund summary.

### Vendor Orders

Each store/vendor has an independent order slice with:

- items;
- vendor-specific totals;
- fulfillment state;
- shipment(s);
- cancellations/refunds affecting that vendor;
- vendor financial allocation.

### Order Tracking

Customers should be able to understand partial states such as:

```text
Store A -> Shipped
Store B -> Processing
Store C -> Cancelled / Refunded
```

The parent order derives a meaningful overall state without hiding vendor-level detail.

## 8. Payment Features

CartNest must support Paystack and Flutterwave through a provider-neutral payment module.

### Payment Methods

The project scope includes support for Nigerian payment methods exposed through approved providers, including:

- card payments;
- bank transfer;
- USSD;
- NGN transactions.

Exact channel availability in MVP may vary by provider capability and final business configuration.

### Payment Abstraction

The platform must not couple orders directly to Paystack/Flutterwave SDK types.

Core concepts:

- `PaymentIntent`;
- `PaymentAttempt`;
- `PaymentAllocation`;
- `ProviderEvent`;
- `Refund`.

### Payment Verification

The browser cannot mark an order paid.

Success requires server-side validation of:

- provider authenticity/signature;
- transaction reference;
- expected amount;
- expected currency;
- expected internal order/payment intent;
- successful provider state.

### Webhooks

Provider webhooks must be:

- signature-verified;
- deduplicated;
- idempotently processed;
- mapped into platform statuses;
- auditable.

### Multi-Gateway Retry / Fallback

The original project scope calls for retry/fallback across Paystack and Flutterwave.

Safety constraint: CartNest only falls back when the prior provider outcome is definitively non-chargeable. Ambiguous payment outcomes are reconciled before another charge can be attempted.

### Refunds

Support:

- refund request;
- partial/full refund;
- provider refund execution;
- provider-confirmed refund state;
- transaction/audit history;
- reconciliation with order/vendor allocations.

## 9. Logistics Features

The platform includes localized delivery logistics support.

### MVP Scope

The original project commits specifically to a logistics-service module with mock GIG Logistics integration.

Capabilities include:

- shipment booking/creation;
- provider shipment reference;
- tracking number;
- shipment status;
- real-time/provider-fed tracking where supported;
- vendor dashboard visibility;
- customer order tracking.

### Future Providers

Sendbox and Kwik Delivery were identified as relevant Nigerian logistics providers in the source project problem statement, but direct implementation was not explicitly committed in the proposal. They remain future adapter candidates rather than current requirements.

## 10. Review and Trust Features

The project explicitly includes a review system.

Review capabilities should support:

- public approved product reviews;
- authenticated buyer review creation;
- review rating/text;
- moderation status;
- update/delete policy where approved;
- future purchase/delivery eligibility checks.

### Mentioned but Not Yet Fully Specified

The project problem statement identifies the need for stronger trust mechanisms such as:

- seller ratings;
- dispute resolution.

These are recognized product gaps but do not yet have a complete implementation workflow. They require additional product decisions before being treated as final MVP features.

## 11. Authentication and Security Features

The platform includes:

- user authentication;
- secure password hashing;
- revocable browser sessions;
- role-based access control;
- explicit permissions;
- vendor/store ownership enforcement;
- admin/super-admin access boundaries;
- session/logout/recovery capabilities;
- security audit events;
- rate limiting on sensitive routes;
- webhook verification.

Frontend UI state never replaces backend authorization.

## 12. NDPR / Privacy Features

Privacy-by-design requirements include:

- data minimisation;
- consent capture/logging where required;
- privacy policy/process support;
- data-subject rights endpoints;
- right-to-erasure/anonymization workflow;
- retention considerations;
- auditability of sensitive processing;
- DPIA documentation/template support from the project scope.

Financial/audit records that must legally/operationally remain may require anonymization rather than destructive deletion.

## 13. Admin and Platform Management Features

### Admin Dashboard

Provide a central marketplace operations workspace.

### User Management

Admins can view/manage platform user status subject to permission.

### Vendor Approval and Management

Admins can:

- review vendor applications;
- approve/reject according to final workflow;
- suspend/reactivate vendors;
- inspect relevant vendor/store information;
- audit approval/suspension actions.

### Store Management

Admins can oversee vendor stores and marketplace participation.

### Product and Category Moderation

Admins can:

- oversee products;
- moderate catalog content;
- manage marketplace categories;
- change platform-controlled moderation/status fields.

### Order Oversight

Admins can view parent and vendor-order composition for operational support.

### Payment / Transaction Monitoring

Admins can inspect:

- payment intent/attempt state;
- provider reference;
- refunds;
- reconciliation/ambiguous states;
- safe financial monitoring details.

### Platform Analytics

Admins receive marketplace-level analytics covering, as available:

- users;
- vendors;
- stores;
- orders;
- sales;
- payments;
- products;
- operational trends.

## 14. Platform, Architecture, and Developer Capabilities

These are implementation/platform capabilities required to support the product reliably.

| Capability | Decision |
| --- | --- |
| Frontend | Next.js + TypeScript |
| Backend | Fastify + TypeScript |
| Monorepo | Turborepo |
| Architecture | Modular monolith |
| Database | PostgreSQL |
| ORM | Prisma |
| API style | REST |
| Runtime validation | TypeBox |
| DTO consistency | Shared contract package |
| Frontend consumption | Typed API client |
| API docs | OpenAPI + Swagger UI |
| Database evolution | Prisma migrations |
| Containers | Docker |
| CI/CD | GitHub Actions |
| Deployment | Cloud/VPS baseline |
| Media | S3-compatible object storage baseline |
| Source control | GitHub |

## 15. API Contract and Type-Safety Features

To maintain frontend/backend consistency:

- request/response contracts are TypeBox schemas;
- TypeScript DTOs are inferred from schemas;
- Fastify validates input/output at runtime;
- OpenAPI is generated from route contracts;
- `@repo/api-client` is mechanically derived/generated;
- frontend does not import Prisma models;
- database/domain/API models are intentionally separated.

## 16. Product Media Features

Vendors can attach media to products/stores using a controlled upload workflow.

The baseline design supports:

- authorized upload intent;
- short-lived presigned upload where supported;
- object storage;
- media metadata in PostgreSQL;
- alt text;
- display order;
- type/size validation;
- future thumbnail/optimized variants.

## 17. Performance and Quality Requirements

The original project targets include:

- responsive mobile-first frontend;
- efficient behavior on low-bandwidth networks;
- functional testing;
- integration testing;
- load testing;
- usability/UAT testing;
- approximately 100 concurrent checkout sessions in the defined load scenario;
- target average checkout response time below 500 ms under the stated test conditions;
- SUS usability target of at least 75 in the original academic evaluation plan.

These are engineering/testing targets, not guaranteed production SLAs until deployment capacity and test methodology are finalized.

## 18. API Documentation and Developer Deliverables

The project will maintain:

- documented REST API;
- OpenAPI output;
- Swagger UI;
- database migrations;
- architecture documentation;
- deployment instructions/scripts;
- reusable GitHub codebase;
- CI quality gates.

## 19. Commerce Models

The architecture supports:

### B2C

Businesses sell products directly to individual buyers.

### B2B

The proposal states the platform should accommodate B2B commerce. B2B-specific workflows such as negotiated pricing, purchase orders, invoice terms, and organization accounts are not yet specified and should not be assumed as MVP features until explicitly designed.

### Multi-Vendor Marketplace

This is the confirmed primary system model: multiple Nigerian businesses operate stores and sell through one platform.

## 20. Explicitly Open Product Decisions

The following require confirmation before affected implementation is finalized:

- email, phone, or combined registration identity;
- one or multiple stores per vendor;
- vendor approval data/verification requirements;
- exact vendor staff permission matrix;
- review purchase/delivery eligibility;
- seller rating model;
- dispute-resolution workflow;
- cancellation windows;
- returns/RMA workflow;
- delivery-fee calculation;
- tax/VAT policy;
- platform commission model;
- payment gateway fee ownership;
- vendor settlement/payout strategy;
- coupon/promotion model;
- final logistics provider integrations beyond mock GIG;
- B2B-specific workflows;
- notification preferences/channels.

## 21. MVP Definition of Done — Functional Checklist

### Buyer

- [ ] register/login;
- [ ] browse/search/filter products;
- [ ] wishlist;
- [ ] cart;
- [ ] checkout preview;
- [ ] multi-vendor checkout;
- [ ] secure payment initialization/confirmation;
- [ ] order history/detail;
- [ ] shipment tracking;
- [ ] review capability according to final policy.

### Vendor

- [ ] vendor onboarding/status;
- [ ] store management;
- [ ] product/variant/media management;
- [ ] inventory management;
- [ ] vendor-order fulfillment;
- [ ] shipment management;
- [ ] vendor staff/permissions;
- [ ] vendor analytics baseline.

### Admin

- [ ] admin authentication/permissions;
- [ ] user oversight;
- [ ] vendor approval/management;
- [ ] store oversight;
- [ ] product/category moderation;
- [ ] order oversight;
- [ ] payment/refund monitoring;
- [ ] platform analytics;
- [ ] audit visibility for authorized actions.

### Platform

- [ ] shared API contracts;
- [ ] typed API client;
- [ ] runtime validation;
- [ ] PostgreSQL/Prisma migrations;
- [ ] OpenAPI/Swagger;
- [ ] Docker baseline;
- [ ] GitHub Actions quality gates;
- [ ] NDPR/privacy controls;
- [ ] test coverage for critical business/security/financial invariants.
