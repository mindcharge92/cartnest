# CartNest Production Runbook

**Status:** Operational baseline  
**Last updated:** 5 September 2026  
**Audience:** operators, maintainers, on-call engineers

## 1. Purpose

This runbook gives concrete actions for normal releases and common production incidents. It is designed so an engineer does not invent recovery steps while the system is failing.

Before executing destructive steps, preserve evidence and confirm the incident scope. Payment/order incidents require particular caution because retrying an uncertain operation can cause duplicate economic effects.

## 2. First Response to Any Incident

1. acknowledge alert/incident;
2. assign incident severity;
3. capture start time;
4. identify affected services/users/providers;
5. identify current deployed Git SHA and recent deployments;
6. check database/Redis/worker health;
7. check external-provider status if relevant;
8. stop harmful automated actions when necessary;
9. preserve request/payment/order/provider references;
10. open an incident record.

Do not start by restarting every service indiscriminately.

## 3. Incident Severity

### SEV-1

- broad production outage;
- incorrect payment confirmation/duplicate charging;
- authorization bypass/data exposure;
- database corruption/loss;
- active secret compromise.

### SEV-2

- core workflow materially degraded;
- one payment provider unavailable with significant impact;
- worker/critical queue stopped;
- severe API error/latency increase.

### SEV-3

- non-critical feature degradation;
- notification/analytics delay;
- limited provider degradation with workaround.

## 4. Standard Production Deployment

Preconditions:

- CI green;
- staging validation green;
- migration reviewed;
- recent backup/restore point verified;
- target commit/image SHA recorded.

Procedure:

```text
1. approve production GitHub environment deployment
2. build/pull immutable web/api/worker images
3. run controlled prisma migrate deploy job
4. verify migration exit code
5. update api/worker/web containers
6. wait for health/readiness
7. run smoke tests
8. confirm workers consuming queues
9. confirm webhook endpoints reachable
10. watch dashboards for at least the initial observation window
11. record deployed SHA/migration/release time
```

## 5. Production Smoke Test

Minimum:

- home/catalog loads;
- `/health/live` and `/health/ready` green;
- login/session refresh works with test operator account;
- catalog API returns expected DTO;
- R2 media resolves;
- admin operational page reachable for authorized admin;
- worker heartbeat current;
- payment webhook route returns expected behavior to signed test path/sandbox where possible.

Do not run an uncontrolled real customer charge as a casual smoke test.

## 6. Application Rollback

Use when application regression exists and schema remains backward-compatible.

1. identify previous known-good SHA;
2. confirm current migration does not prevent old code;
3. deploy previous web/api/worker images;
4. do not revert additive DB migration merely for cosmetic rollback;
5. smoke test;
6. monitor error rate;
7. create forward-fix issue/incident notes.

If schema is incompatible, do not force old code against it. Follow database recovery/forward-fix plan.

## 7. API Unavailable / High 5xx

Check in order:

```text
Caddy/TLS/DNS
container status/restarts
health endpoints
recent deploy
CPU/memory/disk
DB connectivity/pool
Redis connectivity
external provider timeouts
logs/traces for dominant error
```

Actions:

- rollback recent app deployment if strongly correlated and safe;
- reduce/disable non-critical provider-dependent features if provider failures exhaust resources;
- scale/restart only the failing process after capturing logs;
- enable maintenance mode if writes are unsafe.

## 8. Database Unavailable

1. stop/limit write traffic;
2. determine managed provider vs host/network issue;
3. inspect DB connection saturation and provider status;
4. do not repeatedly restart DB during possible recovery;
5. if primary is unrecoverable, invoke database DR procedure;
6. keep payment webhooks receivable only if they can be durably queued/stored safely; otherwise provider redelivery/reconciliation must handle the gap;
7. validate restored/failover DB before accepting writes.

## 9. Database Corruption or Bad Migration

1. stop harmful writes;
2. capture current migration/version;
3. preserve logs and DB state;
4. determine whether forward-fix is safer than PITR;
5. for PITR, restore into separate instance to timestamp before incident;
6. validate financial/inventory invariants;
7. switch application deliberately;
8. reconcile provider events received during outage.

Never manually edit production migration history to make Prisma appear healthy.

## 10. Redis / Queue Failure

Because PostgreSQL remains authoritative:

1. restore Redis availability;
2. restart workers;
3. check OutboxEvent pending/processing rows;
4. check payment reconciliation state;
5. check held inventory reservations;
6. check unsent notifications;
7. re-enqueue reconstructable work;
8. monitor duplicate protection/idempotency.

Do not recreate financial state from Redis alone.

## 11. Worker Stuck / Queue Backlog

Check:

- worker heartbeat;
- queue oldest age;
- dominant failing job type;
- Redis connection;
- provider rate limits/timeouts;
- poisoned job repeatedly failing;
- DB pool exhaustion.

Actions:

- pause problematic non-critical queue;
- fix/provider-throttle issue;
- move exhausted jobs to dead-letter state;
- increase worker concurrency only after confirming downstream capacity;
- replay dead-letter jobs only after root cause is fixed.

## 12. Paystack Outage

CartNest default provider is Paystack.

1. classify current attempts as succeeded/failed/unknown;
2. never route unknown/processing attempts to Flutterwave automatically;
3. reconcile uncertain Paystack references;
4. for definitively uninitialized/failed attempts, provider router may offer Flutterwave;
5. communicate degraded payment state to users;
6. monitor delayed Paystack webhooks when service recovers.

## 13. Flutterwave Outage

Because Flutterwave is secondary:

- stop creating new Flutterwave attempts if provider is confirmed unavailable;
- preserve existing ambiguous attempts for reconciliation;
- Paystack may remain primary for new unaffected customers;
- do not convert an ambiguous Flutterwave charge into a Paystack retry until verified non-chargeable.

## 14. Payment Webhook Signature Failures

1. verify provider configuration/secret rotation history;
2. verify raw-body handling has not changed;
3. compare failure rate against normal malicious noise;
4. do not process unverified events;
5. if legitimate events are rejected, rely on provider verification/reconciliation to prevent lost payment state while fixing webhook validation;
6. rotate webhook secret only through controlled provider procedure.

## 15. Payment Amount/Currency/Reference Mismatch

Treat as high severity.

- do not mark order paid;
- store mismatch event safely;
- prevent fulfillment;
- query provider directly;
- compare PaymentIntent, Attempt, provider transaction and Order;
- escalate to operations/security if unexplained;
- never “fix” by changing expected order amount to match the provider response.

## 16. Duplicate Charge Report

SEV-1 until disproven.

1. identify user/order/payment intent;
2. list all PaymentAttempts/provider references;
3. query both Paystack and Flutterwave independently;
4. freeze automated retry/fallback for affected intent;
5. determine actual captures;
6. initiate controlled refund for confirmed duplicate according to policy;
7. inspect idempotency/fallback/reconciliation logs;
8. preserve evidence and add regression test.

## 17. R2 Media Failure

If uploads fail:

- disable new media upload feature gracefully;
- catalog/order core may continue;
- inspect R2 credentials/CORS/presigned expiration;
- do not expose credentials to browser as workaround.

If public reads fail:

- verify custom domain/CDN/R2 status;
- preserve DB Media records;
- restore missing objects from media backup if deletion occurred.

## 18. GIGL Outage

- stop/queue new GIGL provider requests as appropriate;
- do not lose VendorOrder fulfillment state;
- allow manual/self-delivery path when business policy permits;
- continue shipment-sync reconciliation when GIGL recovers;
- normalize delayed tracking events idempotently.

## 19. Notification Provider Outage

- queue messages with bounded retry;
- authentication-critical message failure is surfaced clearly to user/operator;
- routine marketing/non-critical messages must not block checkout/order commits;
- dead-letter after configured attempts;
- avoid retry storms.

## 20. Authentication Incident

Examples: refresh replay spike, suspected cookie/session theft, signing secret compromise.

Actions depend on scope:

- revoke affected sessions;
- force password reset where justified;
- rotate signing/encryption secret through planned multi-key transition if required;
- invalidate all sessions if key compromise is confirmed and design requires it;
- preserve audit/security logs;
- verify ADMIN/SUPER_ADMIN MFA;
- communicate appropriately.

## 21. Secret Leak

1. remove/revoke exposed secret immediately at provider;
2. issue replacement;
3. update production/staging secrets;
4. deploy/restart dependent services safely;
5. inspect provider/audit logs for misuse;
6. rotate related secrets if blast radius uncertain;
7. remove secret from Git history if committed, but assume compromise remains even after history rewrite;
8. document incident.

## 22. Admin Locked Out

Production SUPER_ADMIN recovery must use a controlled server/database operation documented and audited, not a public hidden endpoint.

Procedure should require:

- operator authorization;
- identity verification;
- secure one-time recovery action;
- forced MFA re-enrollment where necessary;
- audit record.

Never keep a permanent universal backdoor password.

## 23. Inventory Invariant Failure

If `reserved > onHand`, negative stock, or unexplained stock drift is detected:

1. stop checkout for affected variant/store if necessary;
2. inspect InventoryAdjustments and Reservations;
3. identify concurrent operation/retry;
4. avoid arbitrary stock overwrite without audit;
5. perform explicit corrective InventoryAdjustment with reason/incident reference;
6. add concurrency regression test.

## 24. Backup Restore Procedure

High-level:

```text
choose restore point
restore to isolated DB
validate migrations
run invariant queries
connect staging API/worker
validate representative orders/payments
freeze production writes
switch DATABASE_URL / provider endpoint
restart services
run smoke tests
reconcile post-restore provider events
monitor closely
```

Full requirements are in `backup-and-disaster-recovery-plan.md`.

## 25. Emergency Maintenance Mode

Use when writes are unsafe.

Maintenance should:

- block checkout/vendor/admin mutations except explicitly allowed operations;
- keep status/health available;
- keep provider webhooks receivable when durable processing is safe;
- show a clear user-facing message;
- be reversible without redeploy when practical.

## 26. Post-Incident Review

For SEV-1/SEV-2:

- timeline;
- customer/business impact;
- root cause;
- detection quality;
- actions taken;
- what worked/failed in runbook;
- corrective code/config/documentation changes;
- owner/deadline;
- regression test/alert addition.

Postmortems should improve systems rather than focus on individual blame.

## 27. Emergency Contact Inventory

Do not commit private phone numbers or passwords here.

Maintain secure operational contact references for:

- domain/DNS provider;
- VPS/cloud provider;
- PostgreSQL provider;
- Paystack;
- Flutterwave;
- Cloudflare;
- GIGL;
- notification provider;
- security/engineering owner.

## 28. Runbook Readiness Gate

Before production launch, the team must have executed in staging:

- deployment;
- application rollback;
- DB restore;
- Redis/worker restart/reconstruction;
- payment webhook test;
- provider outage simulation;
- R2 upload failure behavior;
- secret rotation for at least one non-production provider;
- maintenance mode;
- incident alert/acknowledgement flow.
