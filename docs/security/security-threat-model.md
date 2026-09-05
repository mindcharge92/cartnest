# CartNest Security Threat Model

**Status:** Security baseline  
**Last updated:** 5 September 2026  
**Method:** asset/trust-boundary analysis + STRIDE-style threat review + marketplace abuse cases

## 1. Purpose

CartNest handles identities, vendor KYC, addresses, inventory, orders, payments, refunds, provider credentials, media uploads, and administrative actions. This threat model identifies credible attack paths and the controls required before production.

The objective is not to prove the system is “secure”; it is to make assumptions, trust boundaries, abuse cases, residual risks, and verification requirements explicit.

## 2. Primary Assets

### High criticality

- customer/vendor/admin identities and sessions;
- password hashes and MFA secrets;
- payment state and provider references;
- order/refund/commission records;
- vendor settlement/subaccount mapping;
- provider secret keys;
- database backups;
- admin privileges/audit records.

### Sensitive personal data

- email/phone;
- delivery addresses;
- vendor KYC/business verification data;
- limited device/IP context where retained;
- support/return information.

### Business assets

- catalog/product data;
- inventory;
- reviews/ratings;
- media;
- analytics/read models.

## 3. Trust Boundaries

```text
Untrusted browser
   |
   | HTTPS
   v
Caddy / public edge
   |
   v
Fastify API --------------------> External Providers
   |                                Paystack
   |                                Flutterwave
   |                                GIGL
   |                                Google
   |                                Notification provider
   |                                R2 signing/API
   |
   +--> PostgreSQL
   +--> Redis/BullMQ
   +--> Worker

Direct browser PUT -------------> R2 presigned object
```

Every arrow crossing into CartNest or from CartNest to a provider is a trust boundary.

## 4. Threat Rating

Use qualitative likelihood/impact:

```text
Likelihood: Low / Medium / High
Impact:     Low / Medium / High / Critical
Priority:   derived from both + detectability/business exposure
```

Production-blocking security findings include critical authorization, payment-integrity, secret-exposure, or data-loss threats without compensating controls.

## 5. Authentication Threats

### Credential stuffing / brute force

**Likelihood:** High  
**Impact:** High

Controls:

- strong password hashing;
- login/reset rate limiting;
- IP + account risk signals;
- generic login/reset errors;
- MFA required for ADMIN/SUPER_ADMIN;
- security-event monitoring;
- optional compromised-password screening later.

### Session theft

Controls:

- Secure HttpOnly cookies;
- short 15-minute access lifetime;
- 30-day rotating revocable refresh sessions;
- no localStorage refresh token;
- TLS only;
- CSRF protection;
- replay detection;
- session revocation after password/security events.

### Refresh replay

Controls:

- hashed refresh/session secrets;
- rotate on successful refresh;
- reject old credential replay;
- revoke session family/related sessions according to final implementation;
- security alert/audit.

### Password reset takeover

Controls:

- single-use short-lived token;
- no account-existence disclosure;
- token hashed server-side where applicable;
- invalidate after use;
- session revocation option;
- rate limit.

## 6. Authorization and Multi-Tenant Threats

### Horizontal privilege escalation

Example: Vendor A changes `storeId` in URL to edit Vendor B product.

**Likelihood:** High if not systematically controlled  
**Impact:** Critical

Controls:

- never treat client ID as ownership proof;
- server resolves VendorMember scope;
- repository/use-case queries include authorized vendor/store scope;
- integration tests for Vendor A vs Vendor B on every protected domain;
- no shared “isVendor” check without resource scope.

### Vendor staff over-privilege

Controls:

- OWNER/STAFF + granular permissions;
- deny by default;
- least privilege;
- permission change audit;
- active membership required.

### Admin privilege abuse

Controls:

- ADMIN vs SUPER_ADMIN separation;
- MFA;
- explicit permissions;
- reason required for high-risk override where useful;
- immutable/append-oriented audit;
- no MVP user impersonation;
- periodic access review.

## 7. API/Input Threats

### Injection

Controls:

- Prisma parameterized query patterns;
- avoid raw SQL with interpolated input;
- TypeBox validation;
- allowlisted sort/filter fields;
- raw SQL migration/repository queries use parameters;
- fuzz/integration tests for risky search/filter endpoints.

### Mass assignment

Example: vendor sends `moderationStatus: APPROVED`.

Controls:

- request DTO contains only caller-controlled fields;
- map DTO -> domain explicitly;
- separate admin/vendor contracts.

### Broken object-level authorization

Addressed as a first-class test requirement on every ID-based route.

## 8. Browser/Web Threats

### XSS

Controls:

- React/Next.js escaping defaults;
- sanitize any intentional rich HTML;
- strict CSP where practical;
- do not dangerously inject vendor product HTML;
- validate external URLs/media;
- HttpOnly cookies limit token extraction impact.

### CSRF

Cookie-based authenticated mutations require:

- appropriate SameSite configuration;
- trusted Origin/Referer checks;
- CSRF token mechanism where topology requires;
- no state-changing GET endpoints.

CORS is not treated as CSRF protection.

### Clickjacking

Use CSP `frame-ancestors`/equivalent response headers for authenticated/admin interfaces unless embedding is explicitly required.

## 9. Payment Threats

### Client price tampering

Controls:

- browser price ignored at checkout;
- backend reprices catalog;
- integer minor units;
- immutable order snapshots.

### Forged webhook

Controls:

- Paystack HMAC signature verification;
- Flutterwave signature verification;
- raw-body correctness;
- provider verification API;
- event dedupe;
- never trust browser callback.

### Webhook replay

Controls:

- ProviderEvent dedupe identity/fingerprint;
- state transition compare-and-set;
- payment success applied once.

### Duplicate charge through fallback

**Impact:** Critical

Controls:

- ambiguous != failed;
- reconcile timed-out attempts before switching provider;
- PaymentIntent idempotency;
- provider references;
- operational alert on multiple successful attempts.

### Refund abuse

Controls:

- authorization matrix;
- remaining refundable balance;
- idempotency;
- provider verification;
- vendor limit/admin override policy;
- audit.

### Commission manipulation

Controls:

- commission rules server/admin controlled;
- resolved commission snapshotted;
- vendor cannot set arbitrary applied commission in checkout payload;
- PaymentAllocation reconciliation.

## 10. Inventory/Order Threats

### Overselling race

Controls:

- PostgreSQL atomic transaction/conditional update;
- reservation model;
- DB constraints;
- 15-minute expiry;
- concurrency tests.

### Duplicate order

Controls:

- `Idempotency-Key`;
- request fingerprint;
- unique logical scope;
- same key/different request rejected.

### Unauthorized order visibility

Vendor gets only VendorOrder slice and minimum buyer data required for fulfillment.

## 11. Media Upload Threats

### Arbitrary object overwrite

Controls:

- server-generated unique object key;
- ownership authorization before signing;
- short presigned URL;
- no client-chosen arbitrary bucket/key.

### Malicious file/content

Controls:

- MIME/type allowlist;
- size limit;
- image decoding/validation before ACTIVE where needed;
- block executable types;
- malware/content scanning can be added for higher-risk formats;
- public media served from separate media origin where practical.

### Presigned URL theft

Controls:

- treat URL as bearer secret;
- 5-minute default;
- HTTPS;
- don't log full URL;
- one operation/object.

## 12. SSRF

Potential sources include image import, webhook callbacks, vendor-configured URLs, logistics integrations.

Controls:

- do not provide arbitrary server-side URL fetch feature by default;
- allowlist provider hosts;
- block link-local/private metadata targets if URL fetching is later introduced;
- enforce DNS/IP validation carefully;
- provider callback URLs are configured, not user-controlled.

## 13. Provider/Supply-Chain Threats

### Compromised provider credential

Controls:

- secrets server-only;
- least-privilege credential where provider supports;
- environment separation;
- rotation runbook;
- provider logs/alerts;
- never commit secrets.

### Dependency compromise

Controls:

- lockfile;
- dependency review/scanning;
- minimal dependencies;
- CI build provenance/immutable images;
- avoid install scripts/packages without need;
- timely critical updates.

## 14. Queue/Event Threats

### Duplicate/replayed job

Controls:

- at-least-once design;
- job/event IDs;
- consumer idempotency;
- DB state check.

### Poison job / retry storm

Controls:

- bounded retries;
- non-retryable classification;
- dead-letter;
- provider rate-limit aware backoff;
- alert.

### Redis compromise/loss

Redis cannot be source of financial truth. Private network/auth and outbox reconstruction reduce blast radius.

## 15. Database Threats

### Unauthorized direct access

Controls:

- 5432 not public;
- TLS/private networking;
- separate app/admin/backup roles where feasible;
- least privilege;
- production SQL access exceptional.

### Data exfiltration through logs/backups

Controls:

- log redaction;
- encrypted backups;
- backup access isolation;
- retention policy;
- audit.

### Accidental destructive migration

Controls:

- reviewed Prisma migrations;
- no production `db push`;
- backup before release;
- expand/contract migrations;
- staging rehearsal.

## 16. KYC and Privacy Threats

Vendor verification may contain sensitive documents/data.

Controls:

- collect only required KYC data;
- restrict access to authorized admins;
- avoid embedding documents in ordinary logs/audit metadata;
- object storage/private access for documents if introduced;
- retention/deletion policy;
- NDPR rights/process.

## 17. Review and Marketplace Abuse

Threats:

- fake reviews;
- self-review;
- review bombing;
- prohibited product listing;
- vendor evasion after suspension.

Controls:

- review requires delivered OrderItem/VendorOrder;
- moderation;
- risk/flag workflow;
- audit/linkage to account/vendor;
- rate limits;
- future fraud signals without making opaque automated sanctions the only decision path.

## 18. Denial of Service / Resource Exhaustion

Controls:

- rate limits;
- request-body limits;
- upload-size limits;
- pagination maximums;
- DB query timeout/indexing;
- provider request timeout;
- bounded worker concurrency;
- CDN/cache for public media/content where safe;
- monitor event-loop/DB/Redis saturation.

## 19. Security Headers Baseline

Review/configure:

```text
Content-Security-Policy
Strict-Transport-Security (after TLS validation)
X-Content-Type-Options: nosniff
Referrer-Policy
Permissions-Policy
frame-ancestors via CSP
secure cookie flags
```

Do not copy a generic CSP without testing Next.js and payment-provider requirements.

## 20. Data Classification

### Restricted

- passwords/hashes;
- session secrets;
- MFA secrets;
- provider credentials;
- private KYC documents;
- backup encryption keys.

### Confidential

- addresses;
- phone/email;
- order details;
- provider transaction metadata;
- vendor bank/subaccount data.

### Internal

- moderation notes;
- operational analytics;
- internal error detail.

### Public

- approved product/store/catalog/review information intended for marketplace display.

Controls depend on classification.

## 21. Security Verification Matrix

Before production:

- [ ] authentication/session integration tests;
- [ ] cross-vendor authorization tests for every vendor module;
- [ ] admin permission tests;
- [ ] CSRF/CORS test;
- [ ] XSS/rich content review;
- [ ] rate-limit tests;
- [ ] payment webhook forgery/replay tests;
- [ ] duplicate-payment fallback test;
- [ ] refund over-limit test;
- [ ] inventory concurrency test;
- [ ] presigned upload ownership test;
- [ ] secret scan/dependency scan;
- [ ] backup access review;
- [ ] production headers/TLS review;
- [ ] logging redaction test.

## 22. Residual Risks

Even with controls:

- external provider outages/compromise remain possible;
- sophisticated account takeover may bypass password-only customer accounts;
- malicious vendors may attempt fraud/social engineering;
- application bugs can still create financial discrepancies;
- single-region initial deployment has infrastructure concentration risk;
- privileged insiders remain a risk requiring audit/access review.

Residual risks should be revisited as transaction volume increases.

## 23. Threat-Model Change Triggers

Review this model when:

- new payment/logistics provider is added;
- mobile app/third-party API access launches;
- guest checkout is added;
- vendor payouts/ledger change materially;
- file types expand beyond images;
- admin impersonation is introduced;
- architecture moves to multiple services/regions;
- KYC/document collection expands;
- security incident reveals a new threat path.
