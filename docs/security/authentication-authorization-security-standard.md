# Authentication, Authorization, and Security Standard

**Related ADR:** ADR-004  
**Status:** Living implementation standard

## 1. Security Authority

Fastify is the authoritative security boundary for application APIs.

Next.js may render different experiences based on the session, but all protected operations are re-validated by the backend.

## 2. Identity Roles

Baseline roles:

| Role | Scope |
| --- | --- |
| CUSTOMER | own profile, cart, checkout, orders, reviews |
| VENDOR_OWNER | own vendor/store administration and delegated staff |
| VENDOR_STAFF | granted capabilities inside assigned vendor/store scope |
| ADMIN | marketplace operations and moderation |
| SUPER_ADMIN | highly privileged platform administration |

Roles do not replace ownership checks.

## 3. Authentication Baseline

For browser users, proposed baseline:

- short-lived access credential/session;
- revocable rotating refresh session;
- Secure HttpOnly cookies;
- explicit CSRF protection appropriate to deployment topology;
- server-side session revocation.

Exact lifetime values must be chosen before implementation.

## 4. Passwords

- hash using approved modern parameters;
- never encrypt passwords reversibly;
- never log password values;
- enforce reasonable password policy;
- password reset tokens are single-use and expire;
- password change/recovery can revoke existing sessions according to policy.

## 5. Session Storage

Refresh/session records should support:

- user ID;
- token hash or server-generated session identity;
- issued time;
- expiry;
- last-used time where useful;
- revoked time/reason;
- device/user-agent metadata only where justified and privacy-safe.

Raw refresh secrets should not be stored when a secure hash/reference pattern can be used.

## 6. Authorization Evaluation

A privileged action is allowed only if all required layers pass:

```text
identity
+ role/permission
+ vendor/store/resource scope
+ business-state policy
```

Example:

A `VENDOR_STAFF` user with `product:update` permission still cannot update a product owned by another vendor.

## 7. Permissions

Representative vendor permissions:

```text
store:read
store:update
product:create
product:update
product:archive
inventory:read
inventory:adjust
order:read
order:accept
order:fulfill
staff:invite
staff:update
staff:remove
analytics:read
```

Representative admin permissions:

```text
vendor:review
vendor:approve
vendor:suspend
product:moderate
user:suspend
order:override
refund:review
payment:read
audit:read
```

Final permission granularity should be validated against product requirements.

## 8. Vendor Isolation

Every vendor-scoped repository operation should receive or derive authorized scope.

Bad:

```text
SELECT product WHERE id = request.params.id
```

without later ownership verification.

Better:

```text
load product within allowed store/vendor scope
```

or verify scope immediately and fail before mutation.

## 9. Admin Security

ADMIN and especially SUPER_ADMIN represent elevated risk.

Recommended controls:

- MFA before production;
- shorter privileged session policy;
- strong audit logging;
- no shared admin accounts;
- re-authentication for high-risk actions where appropriate;
- explicit reason fields for suspensions/refund overrides where operationally useful.

## 10. CSRF

If browser authentication relies on cookies, state-changing requests require a CSRF posture.

Use:

- secure SameSite cookie policy;
- origin/referer validation where appropriate;
- anti-CSRF token mechanism when required by deployment topology.

CORS is not a CSRF defense by itself.

## 11. CORS

Only trusted frontend origins should be allowed for credentialed browser API calls.

Do not deploy:

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Credentials: true
```

## 12. Rate Limiting

Protect abuse-prone routes:

- login;
- password reset;
- registration;
- verification;
- review creation;
- media upload-intent creation;
- checkout/payment initiation.

Rate-limit keys may combine IP, user identity, route, and risk signals.

## 13. Secrets

Secrets include:

- payment gateway secret keys;
- cookie/session signing keys;
- DB credentials;
- object-storage credentials;
- email/SMS provider credentials.

Rules:

- environment/secret manager only;
- never commit;
- never place in `NEXT_PUBLIC_*`;
- rotate when compromised;
- use least-privilege provider credentials.

## 14. Webhook Security

For payment/logistics webhooks:

1. receive raw body if signature scheme requires it;
2. validate signature;
3. deduplicate event;
4. validate referenced transaction/resource;
5. enforce amount/currency invariants;
6. process idempotently;
7. acknowledge safely.

## 15. Data Protection

NDPR-aligned principles:

- minimization;
- purpose limitation;
- consent where required;
- access controls;
- erasure/anonymization workflows;
- retention policy;
- privacy-safe logs;
- auditability of sensitive administration.

## 16. Security Logging

Audit:

- login failures/success as appropriate;
- session revocation;
- password/security changes;
- vendor approval/suspension;
- staff permission changes;
- admin actions;
- refunds;
- payment-state overrides if any;
- inventory manual adjustments.

Do not log raw secrets or full payment credentials.

## 17. Response Security

Explicit response DTOs act as allowlists.

Never expose:

- password hash;
- refresh/session secret;
- provider secret;
- private moderation note to unauthorized roles;
- internal fraud/risk metadata;
- private audit fields;
- arbitrary Prisma record.

## 18. Security Testing Checklist

- [ ] authentication required where expected;
- [ ] vertical privilege escalation blocked;
- [ ] horizontal/vendor isolation blocked;
- [ ] forged webhook blocked;
- [ ] CSRF posture tested;
- [ ] rate-limit behavior tested;
- [ ] sensitive fields absent;
- [ ] session revocation works;
- [ ] reset token replay blocked;
- [ ] admin actions audited.
