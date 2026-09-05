# CartNest Frontend & Integration Pass

**Status:** Active implementation plan  
**Started:** 5 September 2026  
**Scope:** Next.js buyer, vendor and admin interfaces + integration with the Fastify API

## 1. Purpose

The backend/domain pass established P0–P12 source baselines. This pass now implements the web application and connects every user-facing workflow to those backend boundaries.

The frontend pass mirrors the backend phases so UI work does not become a separate, untraceable project.

```text
FP0  Web foundation / design system / app shell
FP1  Typed API integration / transport / shared states
FP2  Identity / sessions / verification / MFA
FP3  Vendor onboarding / stores / KYC / staff
FP4  Marketplace catalog / products / variants / media
FP5  Inventory / wishlist / cart
FP6  Checkout / reservations / orders
FP7  Payments / provider handoff / payment state
FP8  Shipping quotes / fulfillment / tracking
FP9  Returns / refunds / reviews
FP10 Admin / analytics / promotions / tax / notifications
FP11 Privacy / accessibility / security / performance
FP12 End-to-end integration / UAT / staging evidence
```

## 2. Frontend Architecture

The governing flow is:

```text
Next.js feature
   ↓
frontend integration wrapper
   ↓
@repo/api-client / shared contracts
   ↓
Fastify /api/v1
   ↓
backend authorization + domain rules
```

Rules:

- Prisma types never enter `apps/web`;
- the browser never calls payment/logistics providers with server credentials;
- UI permission checks improve UX but never replace backend authorization;
- money remains integer minor-unit data until presentation formatting;
- public catalog state should be URL-addressable where useful;
- authenticated mutations use secure cookies + CSRF header handling;
- every data screen must define loading, empty, error and success states;
- no long-lived auth token is stored in localStorage.

## 3. Workspace Model

CartNest will expose three coherent experiences:

```text
Buyer Marketplace
├── home / categories / search
├── product detail
├── wishlist / cart
├── checkout / payment
├── orders / tracking
├── returns / reviews
└── account / privacy

Vendor Workspace
├── onboarding / KYC
├── stores
├── products / variants / media
├── inventory
├── orders / fulfillment
├── returns / refunds
├── staff / permissions
└── analytics / notifications

Admin Workspace
├── marketplace operations
├── vendors / KYC
├── categories / moderation
├── orders / payments / refunds
├── tax / promotions
├── analytics
├── privacy requests
└── notification operations
```

## 4. Phase Exit Rule

A frontend phase is complete only when the relevant backend capability has:

1. a user-facing route or intentional non-visual integration;
2. typed/shared-contract API consumption;
3. loading, empty, error and success behavior;
4. responsive and keyboard-accessible interaction;
5. authentication/permission-aware rendering where relevant;
6. stable backend error-code handling for important paths;
7. no duplicated Prisma/provider DTOs;
8. tests for critical frontend logic where execution is available;
9. documentation updated with remaining runtime gaps.

## 5. Current Starting Point

P2 already contained an early authentication UI. It is being treated as a prototype and hardened into the FP0–FP2 foundation before vendor/catalog screens are added.

The generated OpenAPI client snapshot currently covers the P2 auth surface only. FP0–FP2 can therefore remain on the approved generated-client path. Before FP3 integration, the client-generation gap must be resolved or an explicitly approved contract-derived integration bridge must be introduced without duplicating DTOs.

## 6. Order of Work

The frontend pass proceeds in the same order as the backend because later screens depend on earlier identity and ownership state:

```text
FP0/FP1/FP2
      ↓
FP3 vendor workspace
      ↓
FP4 catalog/storefront
      ↓
FP5 cart/inventory
      ↓
FP6 checkout/orders
      ↓
FP7 payment UX
      ↓
FP8 shipping/tracking
      ↓
FP9 returns/reviews
      ↓
FP10 admin/operations
      ↓
FP11 hardening
      ↓
FP12 E2E/UAT
```

## 7. Verification Constraint

GitHub Actions is still failing before creating jobs, so source changes cannot currently be represented as successful build/test evidence. Each frontend status document must distinguish committed implementation from executed evidence until that infrastructure issue is resolved.
