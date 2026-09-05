# CartNest Data Retention, Export, and Erasure Standard

**Status:** P11 implementation baseline  
**Updated:** 5 September 2026  
**Applies to:** customer, vendor-member, administrator, order, notification, authentication, KYC, audit, and provider-linked data

## 1. Purpose

CartNest follows data-minimisation and purpose-limitation principles. Personal data must not be retained simply because storage is cheap, but financial, fraud, dispute, security, marketplace-integrity, and regulatory obligations may prevent immediate physical deletion of every row associated with an account.

This standard separates:

1. data that may be deleted when no longer required;
2. data that must be anonymised/pseudonymised while relational or commercial evidence is retained;
3. data that requires legal/business retention approval before a numeric retention period is configured;
4. active obligations that block automatic account erasure.

No engineer should invent a legal retention duration in application code. Numeric retention periods for financial/KYC/audit records must be approved before production and then represented as configuration/operations policy.

## 2. Data Subject Export

Authenticated users may request a machine-readable export through:

```text
GET /api/v1/privacy/export
```

The export intentionally excludes secrets and internal security material such as:

- password hashes;
- refresh/session token hashes;
- MFA secrets;
- provider secret keys;
- internal fraud/security rules;
- other users' private data.

The baseline export includes the subject's account profile, addresses, vendor memberships/permissions, orders and commercial snapshots, reviews, returns, and notification preferences.

Export responses are authenticated and marked `Cache-Control: no-store`.

## 3. Erasure Request Workflow

```text
User requests erasure
        ↓
PrivacyRequest
        ↓
Automatic blocker assessment
        ↓
PENDING or REQUIRES_REVIEW
        ↓
ADMIN/SUPER_ADMIN + MFA review
        ↓
ANONYMIZE or REJECT
        ↓
Audit record
```

Only one active erasure request per user is permitted by the reviewed PostgreSQL partial unique-index source.

## 4. Automatic Erasure Blockers

The P11 baseline blocks automated anonymisation while any of the following is true:

- the subject currently holds ADMIN/SUPER_ADMIN platform privileges;
- the subject is an ACTIVE vendor OWNER;
- the customer has an open order requiring payment/fulfilment action;
- the customer has an active return workflow;
- the subject has an unresolved refund that they initiated.

These blockers prevent erasure from destroying fulfillment, ownership-transfer, refund, or privileged-account evidence while the obligation is still active.

A blocker does not mean the right is permanently rejected. Operations must resolve the underlying obligation, transfer/close ownership where appropriate, or document the lawful reason for retention before the request is reconsidered.

## 5. Approved Anonymisation Effect

When an administrator approves a request with no active blocker, CartNest's source baseline:

- deletes OAuth identities;
- deletes refresh/auth sessions;
- deletes MFA factors;
- deletes saved addresses;
- deletes wishlist and cart data;
- removes notification read-state/preferences;
- redacts notification recipient/payload data;
- removes free-text review content associated with the user;
- redacts return free-text reasons;
- redacts historic order delivery-address snapshots;
- removes active STAFF memberships;
- clears email/phone/password/verification fields;
- resets platform role to USER;
- disables the account;
- preserves the opaque User UUID where relational commercial/audit evidence requires a stable pseudonymous key;
- records the decision in AuditLog.

This is anonymisation/pseudonymisation of the application identity, not a claim that every provider or backup copy has instantly disappeared.

## 6. Data Classes and Retention Treatment

| Data class | Example | P11 treatment |
|---|---|---|
| Authentication secrets | sessions, MFA factor | delete during approved erasure; purge expired material through operational retention jobs |
| Saved profile/contact | email, phone, addresses | clear/delete during approved erasure |
| Shopping intent | wishlist, active/abandoned cart | delete during approved erasure; may be aged out earlier |
| Order financial record | amounts, tax, commission, provider references | retain as commercial evidence; remove/redact personal address/contact where lawful |
| Fulfillment record | shipments, tracking events | retain while operational/legal need exists; avoid unnecessary personal fields |
| Returns/refunds | return/refund state and financial amount | retain commercial evidence; redact unnecessary free text |
| Reviews | ratings and purchase proof | preserve marketplace integrity as appropriate; remove personal free text during erasure baseline |
| Notifications | recipient, payload, provider reference | redact personal recipient/payload; technical delivery evidence may be retained according to policy |
| Audit/security evidence | AuditLog, provider events | retain according to approved security/legal schedule; use pseudonymous subject IDs where possible |
| Vendor KYC | verification metadata/documents | separate restricted retention schedule and access controls; not automatically destroyed by customer erasure when business/legal obligations remain |
| Backups | PostgreSQL/R2 backups | expire according to backup schedule; erasure propagates through normal backup expiration rather than destructive backup rewriting |

## 7. Backup Interaction

Backups are immutable recovery evidence and should not be individually rewritten for each erasure request. Instead:

1. production data is anonymised;
2. backup retention remains bounded by the approved backup schedule;
3. restored old backups must not be returned directly to normal service without replaying required privacy/erasure actions after the restore point;
4. restoration runbooks must record the privacy-reconciliation step.

## 8. Provider Data

Paystack, Flutterwave, GIGL, Google, notification providers, and Cloudflare may hold provider-side records. CartNest must maintain a provider-data inventory and use provider deletion/retention capabilities when contractually and legally appropriate.

The application erasure endpoint must not claim that an external provider has deleted data unless provider evidence confirms it.

## 9. Logging

Do not place the following in ordinary logs:

- passwords;
- access/refresh tokens;
- MFA secrets/codes;
- full cookies;
- payment-provider secret keys;
- full KYC documents;
- full delivery addresses unless a narrowly scoped operational need is approved.

P11 uses a hardened generic error handler that logs only a small error classification rather than the nested error/provider payload.

## 10. Production Configuration Gate

Before P13, the business/legal owner must approve numeric retention values for at least:

```text
financial/order evidence
provider event evidence
refund/dispute evidence
KYC records/documents
audit/security logs
notification delivery evidence
backups
expired sessions/tokens
abandoned carts
```

Those values must then be reflected in worker/operations retention jobs and the production runbook.

## 11. Verification

Before production:

- export returns only the authenticated subject's data;
- export excludes password/session/MFA secrets;
- cross-user export access is impossible;
- duplicate active erasure requests are prevented;
- active vendor ownership/open commerce blocks automatic anonymisation;
- approved erasure invalidates sessions;
- approved erasure removes direct account identifiers;
- retained orders remain financially reconcilable after anonymisation;
- privacy decisions are audited;
- backup restore rehearsal includes privacy reconciliation.
