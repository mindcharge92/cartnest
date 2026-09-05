# Frontend Engineering Standard

**Applies to:** `apps/web`  
**Baseline:** Next.js + TypeScript + typed API client

## 1. Purpose

This standard defines how the CartNest web application should consume backend capabilities, separate server/client concerns, structure features, handle forms and errors, protect sensitive data, and remain maintainable across buyer, vendor, and admin experiences.

## 2. Architectural Principles

1. The backend API remains the source of truth for business rules.
2. The typed API client is the supported network integration layer.
3. Prisma/database types never enter the frontend.
4. UI authorization is for user experience only; backend authorization remains mandatory.
5. Server Components are preferred for server-renderable read flows where practical.
6. Client Components are used deliberately for interactivity, browser APIs, and local interaction state.
7. Feature code should be grouped by business capability rather than by generic file type alone.

## 3. Suggested Structure

```text
apps/web/src/
  app/
    (public)/
    (customer)/
    (vendor)/
    (admin)/
  features/
    auth/
    products/
    cart/
    checkout/
    orders/
    vendor/
    admin/
  components/
    shared/
  lib/
    api/
    auth/
    formatting/
  styles/
```

Feature-local components should remain inside the feature until there is a real reuse case.

## 4. API Consumption

Do:

```text
feature -> typed API client -> Fastify API
```

Do not:

- hard-code endpoint shapes repeatedly;
- duplicate response interfaces;
- import Prisma;
- call payment providers directly from UI with server secrets;
- make business decisions from stale client state.

## 5. Server and Client Components

Prefer Server Components for:

- public product/category pages;
- initial account/order data where secure server rendering is appropriate;
- SEO-sensitive catalog pages.

Use Client Components for:

- cart interactions;
- forms;
- modals;
- browser storage where justified;
- highly interactive filters;
- upload progress;
- payment-provider client widgets where required.

A file should not become `"use client"` merely because one nested component needs interactivity.

## 6. State Classification

Separate:

- **server state:** products, orders, inventory views, vendor analytics;
- **URL state:** search, filters, sort, pagination;
- **form state:** create/update inputs;
- **local UI state:** open modal, tab, temporary selection;
- **auth/session view:** derived from secure session endpoint/server context.

Choose state tooling based on category rather than putting everything in a global store.

## 7. Forms

Forms should provide client-side usability validation, but server validation remains authoritative.

Rules:

- share contract-derived constraints where practical;
- display field-level validation errors from API safely;
- disable/reconcile repeated submission;
- use idempotency key for checkout/payment/refund actions;
- never trust hidden inputs for authorization scope.

## 8. Money

Frontend receives canonical API money representation.

Presentation layer may format:

```text
{ amountMinor: "5000000", currency: "NGN" }
```

as:

```text
₦50,000.00
```

Never use formatted strings as financial source values.

The server recalculates checkout totals.

## 9. Dates

Keep API timestamps as ISO strings until parsing/formatting.

Display local time according to product UX requirements.

Never reinterpret provider/server timestamps by string slicing.

## 10. Authentication

Do not store long-lived credentials in `localStorage`.

Browser session credentials follow the auth ADR and should be handled by secure cookies/approved transport.

Frontend responsibilities:

- show authenticated state;
- redirect to appropriate screens;
- hide irrelevant controls;
- request re-authentication when required.

Frontend must not assume that hidden controls prevent unauthorized API calls.

## 11. Role-Based Interfaces

CartNest has different workspaces:

- customer;
- vendor owner/staff;
- admin/super-admin.

Route/layout grouping may separate these experiences, but permission checks should come from server/session capabilities rather than hard-coded role assumptions scattered across components.

## 12. Error Experience

Frontend should distinguish:

- validation errors;
- authentication required;
- forbidden;
- not found;
- business conflict;
- rate limited;
- transient provider/server failure.

Stable backend error codes drive UI behavior.

Do not parse human-readable error strings to decide logic.

## 13. Loading and Empty States

Every data-driven view should define:

- initial loading;
- empty;
- partial data;
- recoverable error;
- terminal error;
- success.

For slow networks, avoid layouts that appear frozen without progress feedback.

## 14. Accessibility

Minimum baseline:

- semantic HTML;
- keyboard operability;
- visible focus;
- labels for controls;
- meaningful alt text;
- accessible errors;
- sufficient contrast;
- no information conveyed by color alone.

Product media alt text should come from intentional content, not filenames.

## 15. Performance

- optimize images;
- use pagination/infinite loading deliberately;
- avoid shipping large client bundles unnecessarily;
- keep server-only libraries out of browser bundles;
- use code splitting where meaningful;
- minimize sequential network waterfalls;
- cache public catalog reads according to freshness requirements;
- do not cache user/private data publicly.

## 16. Search and Filter State

Where practical, public catalog search/filter/sort should be URL-addressable so:

- pages are shareable;
- back/forward works;
- state survives refresh;
- SEO can reason about intended canonical pages.

## 17. Uploads

Product media upload must use backend-approved upload intents/presigned URLs.

The UI may show progress but cannot invent final media status. Backend confirmation determines whether media becomes attached/active.

## 18. Testing

Frontend tests should cover:

- business-critical components/forms;
- permission-dependent rendering;
- cart/checkout interactions;
- error handling;
- typed client integration wrappers;
- end-to-end buyer/vendor/admin flows.

Avoid snapshot-only testing as the primary confidence mechanism.

## 19. Definition of Done

- [ ] uses typed API client;
- [ ] does not duplicate backend DTOs;
- [ ] has loading/empty/error states;
- [ ] handles stable API error codes;
- [ ] meets accessibility baseline;
- [ ] no server secret enters client bundle;
- [ ] business-critical path has tests;
- [ ] money/date formatting uses approved utilities;
- [ ] authorization assumptions are not UI-only.
