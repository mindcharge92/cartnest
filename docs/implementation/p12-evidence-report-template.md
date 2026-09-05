# P12 Staging Rehearsal Evidence Report — Template

> Copy this file to a dated evidence report after an actual staging rehearsal. Do not put secrets, full tokens, private KYC data, or unredacted customer data in the report.

## Release

- Date/time:
- Operator(s):
- Git SHA:
- Web image:
- API image:
- Worker image:
- Staging hostname(s):
- Database environment/instance alias:
- Migration(s):
- Evidence artifact/run ID:

## Gate Summary

| Exercise | Result | Evidence reference | Blocking issue |
| --- | --- | --- | --- |
| CI-driven deploy | NOT RUN | | |
| clean migration | NOT RUN | | |
| upgrade migration | NOT RUN / FIRST-RELEASE N/A | | |
| rollback | NOT RUN | | |
| DB backup/restore | NOT RUN | | |
| reservation expiry | NOT RUN | | |
| Paystack lifecycle | NOT RUN | | |
| Flutterwave lifecycle | NOT RUN | | |
| GIGL sandbox | NOT RUN | | |
| R2 lifecycle | NOT RUN | | |
| admin MFA recovery | NOT RUN | | |
| provider outage | NOT RUN | | |
| worker/dead-letter | NOT RUN | | |
| load test | NOT RUN | | |
| buyer UAT | NOT RUN | | |
| vendor UAT | NOT RUN | | |
| admin UAT | NOT RUN | | |

## Deployment Evidence

- Workflow/run ID:
- Deployment start:
- Deployment end:
- Migration exit status:
- API readiness result:
- Web health result:
- Smoke artifact:
- Rollback target SHA:

## Migration Evidence

- Fresh DB created at:
- Migration history before:
- Migration history after:
- `migrate deploy` repeated safely: YES / NO
- Required raw PostgreSQL constraints verified: YES / NO
- Schema drift detected: YES / NO
- Notes:

## Backup/Restore Evidence

- Backup filename/ID:
- SHA-256:
- Backup start/end:
- Restore target alias:
- Restore start/end:
- Restore duration:
- Schema validation:
- Financial/invariant checks:
- API read smoke against restored DB:

## Provider Evidence

### Paystack

- test PaymentIntent:
- redacted provider reference:
- verified amount/currency:
- duplicate-webhook result:
- refund reference/status:
- negative tests:

### Flutterwave

- test PaymentIntent:
- redacted provider reference:
- verified amount/currency:
- duplicate-webhook result:
- refund reference/status:
- safe-fallback result:

### GIGL

- quote result:
- tracking result:
- booking result or provider blocker:

### R2

- test object key prefix:
- upload result:
- metadata verification:
- cross-vendor denial:
- delete/lifecycle result:

## Resilience Evidence

### Provider outage

- provider simulated:
- method:
- observed bounded timeout:
- application state after outage:
- recovery/reconciliation result:

### Worker failure/dead-letter

- job/event ID:
- durable PostgreSQL source state:
- worker stop/start timestamps:
- retries:
- failed/dead-letter state:
- redrive result:
- duplicate business effect: YES / NO

## Performance

- target:
- requests:
- concurrency:
- successful:
- failed:
- p50:
- p95:
- p99:
- API CPU/memory notes:
- DB/Redis notes:
- threshold decision:

## UAT Findings

| ID | Persona | Workflow | Severity | Result | Issue/ref | Retest |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## Security/Privacy Checks

- cross-vendor authorization tests:
- privileged MFA:
- CSRF/origin tests:
- security headers:
- log redaction:
- privacy export:
- erasure review workflow:
- secret/dependency scan:

## Blockers

List every unresolved launch blocker. `None` is valid only when the evidence above supports it.

## Decision

- P12 exit gate: PASS / FAIL
- Eligible to begin P13 launch preparation: YES / NO
- Approver(s):
- Date:
