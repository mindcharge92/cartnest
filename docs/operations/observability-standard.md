# CartNest Observability Standard

**Status:** Production baseline  
**Last updated:** 5 September 2026  
**Applies to:** web, API, worker, PostgreSQL, Redis, external-provider adapters, background jobs

## 1. Purpose

Observability must allow an operator to answer, without opening the database manually:

- Is CartNest available?
- Which request/order/payment is failing?
- Is the failure ours or an external provider's?
- Are users receiving duplicate effects?
- Are queues delayed?
- Are database/Redis resources healthy?
- Can we reconstruct the history of a high-risk action?

CartNest uses structured logs, metrics, traces, audit records, business events, health checks, dashboards, and alerts. Observability data is not allowed to become a new privacy leak.

## 2. Observability Pillars

### Logs

Fast, queryable event records for application behavior.

### Metrics

Aggregated numerical health/business indicators.

### Traces

Cross-service/request spans showing where latency/failure occurs.

### Audit events

Durable records of security/financial/administrative actions. Audit is not interchangeable with ordinary logs.

## 3. Logging Baseline

Fastify uses Pino-compatible structured JSON logging.

Every request log should include, where available and safe:

```text
timestamp
level
service
environment
version/gitSha
requestId
traceId
method
routeTemplate
statusCode
durationMs
userId (opaque ID only where appropriate)
vendorId/storeId (when operationally relevant)
errorCode
```

Do not use raw URL as the only route dimension because IDs can create unbounded cardinality and leak data.

## 4. Log Redaction

Never log:

- passwords;
- password-reset tokens;
- access/refresh tokens;
- cookie values;
- TOTP/MFA secrets;
- Paystack/Flutterwave secret keys;
- R2 credentials/presigned URLs when sensitive;
- full card/account details;
- Google OAuth client secret/codes/tokens;
- raw KYC documents;
- full provider payloads containing unnecessary PII;
- authorization headers.

Request/response logging must use allowlists/redaction, not a naive JSON dump.

## 5. Request Correlation

Fastify assigns/accepts a validated request ID.

Preferred propagation:

```text
browser/typed client
  -> X-Request-Id or trace context
  -> Fastify
  -> DB/provider span
  -> OutboxEvent/job metadata
  -> worker
  -> notification/provider
```

A payment webhook gets its own request ID while preserving provider event ID and internal payment references separately.

## 6. Distributed Tracing

Use OpenTelemetry-compatible tracing so the backend is not permanently coupled to one observability vendor.

Instrument:

- inbound Fastify requests;
- outbound HTTP provider calls;
- PostgreSQL query spans at safe granularity;
- Redis/BullMQ operations;
- background jobs;
- critical Next.js server requests if useful.

Trace attributes must avoid uncontrolled PII and high-cardinality payload data.

## 7. Core Technical Metrics

### HTTP

```text
http_requests_total{service,route,method,status_class}
http_request_duration_ms{service,route,method}
http_inflight_requests
```

### Process/runtime

```text
process_cpu
process_memory
node_event_loop_lag
process_restart_count
```

### PostgreSQL

Track through provider/exporter where available:

```text
active connections
connection saturation
query latency
slow queries
transaction rollbacks
deadlocks
storage usage
replication/PITR health where applicable
```

### Redis/queues

```text
queue_waiting
queue_active
queue_failed
queue_completed
queue_oldest_wait_seconds
dead_letter_count
worker_heartbeat_age
redis_memory
redis_connection_errors
```

## 8. Business and Financial Metrics

Business metrics must use internal state, not only frontend analytics.

Recommended metrics:

```text
registrations_total
approved_vendors
active_stores
products_active
checkout_started_total
orders_created_total
orders_paid_total
orders_cancelled_total
inventory_reservation_failures_total
payment_attempts_total{provider,status}
payment_reconciliation_pending
refunds_total{status}
shipments_total{provider,status}
notifications_total{channel,status}
```

Financial metrics displayed in dashboards must reconcile to transactional records and should not be treated as the accounting ledger by themselves.

## 9. Payment Observability

For each provider track:

- initialization request count;
- initialization errors;
- provider latency;
- webhook receipt count;
- invalid signature count;
- duplicate event count;
- successful verification count;
- amount/currency/reference mismatch count;
- ambiguous/processing attempts;
- reconciliation age;
- refund initiation/finalization failures.

A browser redirect success is not a payment-success metric.

## 10. Inventory Observability

Track:

- reservation success/failure;
- reservation expiry;
- attempted oversell prevented;
- negative/invalid stock invariant violations (should be zero);
- inventory adjustment volume by reason;
- aged held reservations.

Any invariant violation is a high-severity operational event.

## 11. Authentication/Security Observability

Track safely:

- login success/failure rate;
- rate-limit blocks;
- refresh replay detection;
- password-reset requests/completions;
- MFA failures for privileged users;
- vendor authorization denials;
- admin privilege changes;
- suspicious repeated webhook signature failures.

Do not expose security metrics to public dashboards.

## 12. Internal Service-Level Objectives

These are engineering targets, not customer contractual SLAs until explicitly published.

### API availability

Target monthly availability after production stabilization:

```text
99.9% for core authenticated/public API availability
```

Exclude approved maintenance only when the measurement policy explicitly says so.

### Latency

For application-owned work excluding unavoidable provider waiting:

```text
p95 ordinary API endpoint < 500 ms target
p99 tracked separately
```

The original academic checkout target of average response below 500 ms under the defined 100-concurrent-session test remains a test objective. Provider-hosted payment authorization latency is measured separately.

### Error rate

Sustained server-side 5xx should remain below 1% of core API requests under normal operations.

## 13. Alert Severity

### SEV-1 / Critical

Examples:

- production unavailable to most users;
- confirmed duplicate charging;
- payment success being recorded incorrectly;
- database unavailable/data corruption;
- severe authorization bypass;
- confirmed secret compromise;
- backups unusable during active data-loss incident.

### SEV-2 / High

- core API 5xx elevated for >5 minutes;
- payment provider completely unavailable with no safe fallback;
- critical queue lag >15 minutes;
- worker fleet unavailable;
- webhook endpoint failing broadly;
- database storage/connection saturation approaching outage.

### SEV-3 / Medium

- one integration degraded;
- notification backlog;
- non-critical analytics stale;
- moderate latency regression.

## 14. Suggested Alert Rules

Initial values must be tuned after real traffic, but starting triggers can include:

```text
5xx > 2% for 5 minutes                         -> high
p95 API latency > 1.5s for 10 minutes          -> high
DB connection utilization > 80% for 10 minutes -> warning/high
queue oldest critical job > 5 minutes          -> warning
queue oldest payment reconciliation > 15 min   -> high
invalid payment webhook signatures spike        -> security warning
payment mismatch count > 0                       -> immediate investigation
inventory invariant violation > 0                -> high
backup failure                                    -> high
worker heartbeat absent > 5 minutes              -> high
```

Do not page humans for every single ordinary business failure.

## 15. Dashboards

Minimum dashboards:

### Platform health

- traffic;
- latency;
- errors;
- CPU/memory;
- DB/Redis;
- deployment version.

### Payments

- provider success/failure;
- pending/ambiguous attempts;
- webhooks;
- refunds;
- reconciliation.

### Orders/inventory

- checkout rate;
- orders by state;
- reservations;
- stock errors;
- cancellation/returns.

### Background jobs

- queue depth;
- oldest job;
- failures/retries;
- dead-letter counts;
- worker heartbeat.

### Security/admin

Restricted dashboard for login anomalies, rate limiting, authorization denials, privileged changes.

## 16. Error Tracking

Unhandled application errors should be collected by an error-tracking backend or OpenTelemetry-compatible observability platform.

Error reports include:

- service/version;
- error class/code;
- stack trace;
- request/trace ID;
- safe contextual identifiers.

They must not include request bodies containing secrets/PII by default.

## 17. Log Retention

Retention is set according to operational and privacy needs.

Baseline recommendation:

- high-volume application logs: 14–30 days searchable;
- security/financial audit records: retained in PostgreSQL according to formal retention policy;
- provider raw payload retention: minimized and purpose-limited;
- debug logs: short retention and normally disabled in production.

## 18. Sampling

- errors and high-risk financial traces should not be aggressively sampled away;
- normal successful traces may be sampled as traffic grows;
- metrics remain aggregated;
- audit records are never probabilistically sampled.

## 19. Deployment Markers

Every deployment emits a release marker containing:

```text
git SHA
release time
environment
migration identifier
operator/workflow reference
```

Dashboards must make it easy to correlate a regression with a release.

## 20. Observability Definition of Done

A new critical workflow is not production-ready unless:

- logs have request/trace correlation;
- meaningful success/failure metrics exist;
- errors are redacted;
- high-risk failures create alerts;
- background work exposes queue health;
- operators can identify affected order/payment/vendor without direct DB exploration;
- dashboards have been exercised in staging failure scenarios.
