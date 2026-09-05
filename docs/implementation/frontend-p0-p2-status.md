# Frontend FP0–FP2 — Foundation, API Integration, and Identity

**Status:** Source baseline implemented; execution evidence pending  
**Updated:** 5 September 2026

## Scope

This batch establishes the web foundation needed by every later frontend phase and upgrades the earlier P2 prototype into a reusable identity/session experience.

Implemented source work:

- responsive CartNest marketplace shell and visual tokens;
- accessible global focus, form, button, panel and state styles;
- reusable loading/error/empty UI states;
- authenticated/role/MFA-aware frontend guard;
- safer session provider with explicit unavailable/error state;
- auth-session adoption after login/register/MFA without unnecessary refetch;
- logout and logout-all session actions;
- secure mutation transport retaining cookie credentials + CSRF header behavior;
- safe internal return-path utility;
- customer-facing landing page rather than a repository placeholder;
- sign-in, registration, password recovery/reset, account and MFA UX pass;
- identifier-verification confirmation page;
- top-level loading, not-found and recoverable error screens;
- initial frontend unit-test hook for pure navigation logic;
- frontend integration roadmap for FP0–FP12.

## Security Invariants

The browser continues to rely on the P2 cookie model:

```text
cartnest_access      HttpOnly
cartnest_refresh     HttpOnly
cartnest_mfa_grant   HttpOnly
cartnest_csrf        browser-readable only for CSRF header echo
```

No access/refresh token is written to localStorage or exposed through React state.

Mutating API calls continue to include `credentials: include`; the central browser fetch wrapper adds `x-csrf-token` when the CSRF cookie exists.

## Session State

The frontend now distinguishes:

```text
loading
 authenticated
 unauthenticated
 error/unavailable
```

A transient API/storage outage is no longer presented to the user as if they were definitely logged out.

The session endpoint is attempted first. Only an explicit `401` causes one refresh attempt. Other failures surface as a recoverable session-service error.

## Authentication UX

Implemented routes:

```text
/login
/register
/forgot-password
/reset-password
/verify
/mfa
/account
```

Login accepts a safe internal `returnTo` path. Absolute/protocol-relative redirect targets are rejected.

Registration requires at least one of email or phone at the UI layer while backend TypeBox validation remains authoritative.

Password reset keeps the anti-enumeration message and revocation semantics established by P2.

## Accessibility Baseline

The foundation now includes:

- semantic header/nav/main structures;
- visible `:focus-visible` states;
- explicit labels and autocomplete attributes;
- `aria-live`/alert status messages;
- keyboard-usable links/buttons;
- disabled/busy state styling;
- responsive navigation and auth layouts;
- non-color-only status labels.

## Integration Boundary

FP0–FP2 use the existing P2 generated client snapshot because those routes are represented in it.

The snapshot is still stale for P3+ routes. Before FP3 UI is connected, CartNest must either successfully regenerate OpenAPI/types or introduce a contract-derived API-client facade that keeps request/response DTOs sourced from `@repo/contracts` rather than hand-copying backend shapes.

## Verification Status

```text
Source implementation            COMPLETE
Generated client for P2          AVAILABLE
Frontend runtime build           NOT VERIFIED
Frontend unit tests              NOT EXECUTED
Browser/API integration          NOT EXECUTED
Cross-browser/responsive QA      NOT EXECUTED
GitHub Actions                   BLOCKED: startup_failure / zero jobs
```

## Next Frontend Phase

**FP3 — Vendor onboarding, vendor workspace, stores, KYC, staff and permissions.**
