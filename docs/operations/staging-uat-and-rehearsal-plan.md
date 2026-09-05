# CartNest Staging, UAT, and Operational Rehearsal Plan

**Phase:** P12  
**Status:** Execution plan and evidence contract  
**Environment:** staging only; production data is prohibited  
**Updated:** 5 September 2026

## 1. Purpose

P12 converts CartNest's implementation, runbooks, and recovery procedures into executed evidence. A written runbook is not considered rehearsed until the relevant command or operational procedure has been performed against a production-like staging environment and the result has been recorded.

This plan is deliberately evidence-oriented. Every exercise has:

- prerequisites;
- execution steps;
- pass criteria;
- evidence to retain;
- rollback/cleanup notes;
- a blocking/non-blocking classification.

The P12 exit gate remains:

> Production runbook steps have been executed in staging rather than only written down.

## 2. Staging Topology

The production-like baseline is:

```text
Internet
   |
 Caddy
   |----------------|
   v                v
Next.js           Fastify
                     |
          +----------+----------+
          |                     |
      PostgreSQL              Redis
                                |
                              Worker

External provider sandboxes/test modes:
Paystack / Flutterwave / GIGL / Cloudflare R2 / Google where enabled
```

`deploy/staging/compose.release.yaml` is the immutable-image staging release composition. `deploy/staging/compose.yaml` is the self-contained build/rehearsal composition.

## 3. Evidence Rules

Evidence must never contain:

- passwords;
- access/refresh tokens;
- provider secret keys;
- OAuth client secrets;
- MFA seeds;
- complete webhook signatures;
- private KYC documents;
- plaintext database URLs containing credentials.

Permitted evidence includes:

- Git SHA;
- migration names/checksums;
- timestamps;
- HTTP status codes;
- redacted provider reference IDs;
- order numbers/test IDs;
- test account aliases;
- aggregate timings;
- backup checksum;
- screenshots with secrets/PII redacted;
- command exit codes;
- sanitized logs.

Repository evidence belongs under `artifacts/p12/` during execution and may be uploaded as CI artifacts. Long-lived evidence may be summarized in a dated rehearsal report without committing secrets or personal data.

## 4. Preflight

Run:

```bash
pnpm p12:preflight
```

The preflight checks:

- staging Docker source files exist;
- Docker, Node, pnpm, pg_dump, and pg_restore are executable;
- staging Compose parses;
- at least one executable Prisma `migration.sql` exists.

A failed migration-history check is launch-blocking for P12. The current repository must not claim a clean migration rehearsal until a reviewed executable migration exists.

## 5. Exercise Matrix

| Exercise | Required | Primary evidence |
| --- | --- | --- |
| CI-driven staging deployment | yes | workflow/deploy record + SHA |
| clean migration | yes | migration output + schema check |
| upgrade migration from previous release | yes once previous staging release exists | migration output |
| application rollback | yes | before/after SHA + smoke evidence |
| database backup/restore | yes | dump checksum + restore validation |
| expired reservation cleanup | yes | before/after reservation/stock evidence |
| Paystack test payment/webhook/refund | yes before launch | provider refs + CartNest states |
| Flutterwave test payment/webhook/refund | yes before launch | provider refs + CartNest states |
| GIGL sandbox path | where credentials/contract permit | quote/tracking/booking evidence |
| R2 upload/delete lifecycle | yes before launch | object/media lifecycle evidence |
| admin MFA recovery | yes | recovery procedure record |
| payment/logistics provider outage | yes | degraded behavior + recovery |
| worker failure/retry/dead-letter | yes | queue/outbox evidence |
| basic load test | yes | p50/p95/error-rate record |
| UAT/usability session | yes | signed issue/result matrix |

## 6. Production-Like Deployment Rehearsal

### CI path

The repository contains `.github/workflows/staging.yml`.

Required GitHub `staging` environment configuration:

```text
Secrets
STAGING_HOST
STAGING_USER
STAGING_SSH_PRIVATE_KEY
STAGING_SSH_KNOWN_HOSTS

Variables
STAGING_WEB_URL
STAGING_API_URL
```

The staging host must already contain:

```text
/opt/cartnest/env/staging.env
```

with staging-only credentials and must be authenticated to GHCR for the private CartNest images.

### Expected release flow

```text
quality gates
   ↓
build immutable web/api/worker images
   ↓
push SHA-tagged images to GHCR
   ↓
upload release compose + Caddyfile
   ↓
prisma migrate deploy
   ↓
start/update services
   ↓
smoke test
   ↓
retain evidence artifact
```

### Pass criteria

- quality gates pass;
- migration exits 0;
- API `/ready` returns 200;
- web health returns 200;
- catalog read path returns 200;
- security-header smoke checks pass;
- deployed image tags equal the recorded Git SHA.

## 7. Clean Migration Rehearsal

Use a fresh staging database with no application tables.

Procedure:

1. create an isolated empty database;
2. set staging migration `DATABASE_URL` to it;
3. run `pnpm --filter @repo/database db:migrate:deploy` or the `migrate` Compose profile;
4. run Prisma validation/generation;
5. verify required PostgreSQL extensions/indexes/constraints from reviewed migrations;
6. start API against that database;
7. verify `/ready`;
8. run seed/test fixture process if available;
9. run smoke reads;
10. destroy the temporary database after evidence is captured.

Pass criteria:

- no `db push` is used;
- migration history is complete and reproducible;
- required constraints exist;
- API boots without schema drift;
- repeated `migrate deploy` is a no-op/safe.

## 8. Upgrade Migration Rehearsal

Once staging has a previous release:

1. record current release SHA and migration state;
2. take staging backup;
3. deploy the next migration using the release procedure;
4. run previous-version compatibility checks if migration is expand/contract;
5. deploy new API/worker/web;
6. run smoke tests;
7. preserve migration output and timing.

Schema-destructive changes require a dedicated migration/recovery plan and are not covered by a generic rollback claim.

## 9. Application Rollback Rehearsal

Prerequisite: previous application image remains schema-compatible.

Procedure:

1. record current SHA and previous known-good SHA;
2. deploy current release and run smoke;
3. intentionally select previous web/API/worker image tags;
4. redeploy without reversing additive database migration;
5. run smoke again;
6. restore current release;
7. run final smoke.

Evidence:

```text
current SHA
rollback target SHA
migration state
rollback start/end timestamps
smoke evidence before rollback
after rollback
after restoration
```

Pass criteria: no direct database edits are required to make the previous compatible application start.

## 10. PostgreSQL Backup and Restore Rehearsal

Backup:

```bash
DATABASE_URL=<staging-db> BACKUP_DIR=artifacts/p12/backups pnpm db:backup
```

Record SHA-256 of the dump outside any secret-bearing log.

Restore must target a new isolated database and requires the explicit guard:

```bash
RESTORE_CONFIRM=RESTORE_STAGING_ONLY \
DATABASE_URL=<isolated-restore-db> \
BACKUP_FILE=<dump> \
pnpm db:restore
```

Never point the rehearsal restore command at production.

Validation after restore:

- migration table readable;
- representative users/orders/payment intents exist when fixture data expected;
- financial totals remain internally consistent;
- API can start against restored DB;
- smoke read path passes;
- restore elapsed time is recorded against RTO target.

## 11. Expired Inventory Reservation Cleanup

Prepare fixture:

- one product variant with known `onHand` and `reserved`;
- one `HELD` reservation already past `expiresAt`;
- one non-expired `HELD` reservation.

Run the configured reservation-expiry worker/job primitive.

Pass criteria:

```text
expired reservation -> EXPIRED
expired quantity     -> removed from reserved
live reservation     -> unchanged
onHand               -> unchanged
inventory version    -> advanced safely
```

Repeat the cleanup. The second run must not release the same quantity again.

## 12. Paystack Test Exercise

Use Paystack test mode only.

Exercise:

1. create test buyer/cart/order;
2. initialize payment;
3. complete a provider test payment;
4. receive webhook;
5. verify transaction server-side;
6. confirm `PaymentIntent=SUCCEEDED`;
7. confirm stock reservation commits once;
8. replay same webhook;
9. confirm no duplicate financial/stock effect;
10. create partial refund;
11. verify provider refund state;
12. reconcile CartNest refund/order/payment state.

Additional negative tests:

- invalid HMAC;
- amount mismatch;
- currency mismatch;
- reference mismatch;
- duplicate event.

All must fail closed.

## 13. Flutterwave Test Exercise

Use the enabled staging Flutterwave API generation consistently; do not mix API generations in one adapter test.

Exercise mirrors Paystack:

- initialization;
- successful test charge;
- verified webhook/provider verification;
- duplicate webhook;
- partial refund;
- refund verification/reconciliation.

Safe-fallback exercise:

```text
definite Paystack non-charge failure
        ↓
Flutterwave fallback permitted

Paystack timeout/unknown
        ↓
Flutterwave fallback forbidden
        ↓
reconciliation required
```

Pass criterion: no test scenario can produce two successful charges from one logical PaymentIntent through an ambiguous automatic fallback.

## 14. GIGL Sandbox Exercise

Where contracted sandbox credentials permit:

1. resolve/reference valid origin station;
2. request quote using staged package dimensions/weight;
3. confirm normalized NGN delivery fee;
4. if the contracted preshipment payload has been verified, create a sandbox shipment;
5. read/sync tracking status;
6. confirm provider status maps to CartNest enum;
7. repeat event/sync and confirm idempotent state handling.

If the account does not expose verified shipment booking, record the booking step as **BLOCKED BY PROVIDER CONTRACT/SANDBOX** rather than fabricating a successful exercise.

Manual/self-delivery must be exercised independently even when GIGL is unavailable.

## 15. R2 Media Lifecycle Exercise

Use a staging-only bucket/prefix.

1. authenticate as an authorized vendor user;
2. request media upload intent;
3. PUT an allowlisted image through the presigned URL;
4. call completion/verification endpoint;
5. confirm R2 HEAD metadata matches expected size/type;
6. confirm media becomes ACTIVE;
7. verify public/catalog rendering URL where configured;
8. attempt unauthorized cross-vendor media action and expect denial;
9. exercise delete/archive lifecycle;
10. confirm DB/object lifecycle matches policy.

Negative tests:

- oversized object;
- wrong MIME;
- expired presigned URL;
- arbitrary object key attempt;
- cross-vendor product ID.

## 16. Admin MFA Recovery Rehearsal

This exercise must use a staging administrator, never a production admin.

Procedure:

1. verify ADMIN/SUPER_ADMIN privileged route requires MFA;
2. invalidate/remove the test factor through the approved recovery mechanism;
3. revoke active admin sessions;
4. re-enrol TOTP;
5. confirm privileged route access only after successful MFA challenge;
6. verify audit/security events.

If no safe admin-recovery mechanism exists beyond direct database modification, P12 records a launch blocker rather than normalizing direct SQL as an operational procedure.

## 17. Simulated Provider Outage

### Payment provider

Point one staging adapter at a controlled unreachable/failed endpoint or use a network-level deny in a disposable rehearsal environment.

Verify:

- timeout is bounded;
- API does not hang indefinitely;
- ambiguous payment state becomes PROCESSING/reconciliation-required;
- no unsafe fallback occurs;
- provider recovery allows reconciliation.

### Logistics provider

Verify GIGL failure does not modify an order to shipped/delivered and manual/self-delivery remains independent.

### R2

Verify upload intent/completion fails without corrupting catalog media state.

## 18. Worker Failure and Dead-Letter Exercise

Required once the BullMQ/outbox runtime is active.

1. create reconstructable asynchronous work;
2. stop the worker;
3. verify API remains healthy;
4. verify pending durable state remains in PostgreSQL/outbox;
5. restart worker;
6. verify work resumes without duplicate business effect;
7. inject a deterministic failing job;
8. allow bounded retry policy to exhaust;
9. verify dead-letter/failed state is observable;
10. redrive after fixing the failure;
11. verify exactly-once business effect despite at-least-once delivery.

If worker runtime is still a heartbeat skeleton, this exercise is **BLOCKED** and P12 cannot exit.

## 19. Basic Load Test

Use the committed benchmark harness:

```bash
TARGET_URL=https://api.staging.example/api/v1/catalog/products?page=1&pageSize=20 \
REQUESTS=500 \
CONCURRENCY=20 \
pnpm perf:benchmark
```

Run separate read and controlled mutation scenarios where safe.

Record:

- request count;
- concurrency;
- success/error counts;
- p50/p95/p99 latency;
- CPU/memory/DB pressure during run;
- provider calls excluded or stubbed where load would violate provider terms.

Initial pass criteria should be set from observed staging capacity rather than invented numbers. Any threshold selected for launch must then be recorded and reproducible.

## 20. UAT Session

Use seeded/synthetic personas:

```text
buyer
vendor owner
vendor staff
admin
super admin
```

Core buyer UAT:

- register/login/session refresh;
- browse/search/filter;
- wishlist;
- multi-store cart;
- shipping quote;
- promotion;
- checkout;
- test payment;
- order tracking;
- return/refund;
- review.

Core vendor UAT:

- application/KYC status;
- store setup;
- catalog/variants/media;
- inventory adjustment;
- order queue;
- shipment/manual fulfillment;
- return/refund actions;
- analytics;
- staff permission boundaries.

Core admin UAT:

- MFA;
- vendor/KYC review;
- category/product moderation;
- tax/promotion management;
- payment/refund/order operations view;
- privacy request review;
- notification operations.

Every failure becomes an issue with severity and reproduction steps. UAT is not passed while a launch-blocking defect remains open.

## 21. Severity for P12 Findings

### Blocker

- security/authorization bypass;
- duplicate charge/refund risk;
- financial reconciliation mismatch;
- unrecoverable backup;
- migration cannot be reproduced;
- checkout/paid-order path broken;
- worker cannot recover critical work;
- provider webhook verification broken.

### High

- major vendor/admin workflow unusable;
- data loss without financial impact;
- persistent inventory inconsistency;
- serious performance saturation under expected staging load.

### Medium/Low

Usability and non-critical defects may be scheduled if they do not invalidate launch criteria.

## 22. P12 Exit Checklist

P12 is complete only when all applicable items have dated evidence:

```text
[ ] CI-driven staging deployment
[ ] executable reviewed migration history
[ ] clean migration rehearsal
[ ] upgrade migration rehearsal or documented first-release exception
[ ] application rollback rehearsal
[ ] database restore rehearsal
[ ] reservation-expiry rehearsal
[ ] Paystack test lifecycle
[ ] Flutterwave test lifecycle
[ ] GIGL sandbox exercise or explicit provider blocker
[ ] R2 lifecycle
[ ] admin MFA recovery
[ ] provider outage simulation
[ ] worker failure/dead-letter recovery
[ ] load test
[ ] buyer/vendor/admin UAT
[ ] no open P12 blocker
```

Until those checks are supported by actual staging evidence, P12 remains **prepared but not exit-gate verified**.
