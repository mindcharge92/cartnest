# CartNest Deployment & Operations Standard

**Status:** Production deployment baseline  
**Last updated:** 5 September 2026  
**Scope:** local, staging, production, releases, networking, secrets, migrations, service lifecycle

## 1. Purpose

This document defines how CartNest is packaged, deployed, upgraded, rolled back, and operated. It is intentionally provider-neutral at the VPS level so infrastructure can move without changing the application architecture.

The initial production topology is a Dockerized modular-monolith deployment with separate web, API, worker, Redis, PostgreSQL, and external-provider responsibilities. PostgreSQL should be managed in production where budget/provider availability permits; self-hosted PostgreSQL is an explicit lower-cost exception that requires the stronger backup procedure in the disaster-recovery document.

## 2. Environments

CartNest has four environment classes:

| Environment | Purpose | Data Policy |
| --- | --- | --- |
| local | developer implementation/testing | synthetic/local only |
| CI | automated tests/builds | ephemeral synthetic data |
| staging | production-like integration/UAT | synthetic or deliberately sanitized data |
| production | live marketplace | real customer/vendor data |

Production secrets and production customer data must never be copied to local development.

## 3. Production Runtime Topology

```text
Internet
  |
  v
DNS / optional CDN / WAF
  |
  v
Caddy reverse proxy :443
  |-----------------------------|
  v                             v
Next.js web                  Fastify API
container                    container(s)
                                  |
            +---------------------+--------------------+
            |                     |                    |
            v                     v                    v
       PostgreSQL              Redis               Worker
       managed/TLS           private              container
            |                                      |
            +------------------+-------------------+
                               |
                     external provider adapters
               Paystack / Flutterwave / GIGL / R2 / notifications
```

### Process separation

- `web`: Next.js browser/server rendering application;
- `api`: Fastify HTTP server;
- `worker`: BullMQ/event/background job consumers;
- `redis`: queue coordination/cache primitives where approved;
- `postgres`: transactional source of truth, preferably managed;
- `caddy`: TLS termination and reverse proxy.

A worker failure must not terminate the API process. API and worker may use the same code packages but run as separate processes/containers.

## 4. Initial Host Baseline

For the first production deployment, a practical starting topology is:

- one Linux application VPS for Caddy + web + API + worker + Redis;
- managed PostgreSQL on a separate database service;
- Cloudflare R2 for media;
- external payment/logistics/notification providers.

If load testing shows pressure, scale in this order:

1. database connection/query/index tuning;
2. separate worker from web/API host;
3. move Redis to managed/private service;
4. run multiple API replicas behind the proxy/load balancer;
5. run multiple worker replicas by queue;
6. separate Next.js hosting if required.

Do not adopt Kubernetes merely because multiple containers exist.

## 5. Public and Private Ports

Publicly reachable:

```text
80/tcp   -> redirect to HTTPS
443/tcp  -> Caddy HTTPS
22/tcp   -> SSH only from restricted/admin sources where possible
```

Not publicly exposed:

```text
Fastify application port
Next.js application port
Redis 6379
PostgreSQL 5432
metrics endpoints
internal admin/debug endpoints
```

Provider webhooks arrive through public HTTPS routes handled by Caddy -> Fastify.

## 6. TLS and DNS

- production traffic is HTTPS only;
- Caddy manages origin TLS when directly exposed;
- if Cloudflare proxy/CDN is enabled, origin-to-Cloudflare encryption remains enabled;
- HSTS may be enabled after domain/TLS behavior is confirmed;
- callback/webhook URLs use stable production hostnames;
- provider callback URLs are never changed casually during deployment.

Recommended hostname layout:

```text
cartnest.example        -> Next.js
api.cartnest.example    -> Fastify
```

A same-site deployment topology may instead proxy `/api` under one primary domain if auth/cookie policy benefits from it. The final domain layout must remain consistent with ADR-004 CSRF/SameSite configuration.

## 7. Container Images

Every deployable process has a deterministic Docker image.

Recommended image naming:

```text
ghcr.io/daniel419797/cartnest-web:<git-sha>
ghcr.io/daniel419797/cartnest-api:<git-sha>
ghcr.io/daniel419797/cartnest-worker:<git-sha>
```

Rules:

- never deploy mutable `latest` as the only production identifier;
- tag images with immutable commit SHA;
- record deployed commit in application health/version endpoint;
- build dependencies in CI, not interactively on production server;
- run containers as non-root where practical;
- minimize final image layers and development dependencies;
- use health checks.

## 8. Configuration and Secrets

Configuration is split into:

### Public/browser-safe

Examples:

- public website origin;
- API public origin;
- analytics public identifiers if later approved.

### Server-only

Examples:

- `DATABASE_URL`;
- Redis URL/password;
- access/session signing/encryption secrets;
- Paystack secret key;
- Flutterwave credentials/webhook hash;
- Google OAuth client secret;
- Cloudflare R2 access credentials;
- GIGL access credentials;
- notification provider secrets.

Rules:

- server secrets never use `NEXT_PUBLIC_*`;
- `.env` files with real secrets are never committed;
- `.env.example` contains names and safe descriptions only;
- production secrets are stored in GitHub Environment secrets and/or host secret files with restrictive permissions;
- secrets are mounted/injected at runtime, never baked into container images;
- secret changes are auditable operational actions;
- credential rotation is documented in the production runbook.

## 9. Configuration Validation

`packages/config` validates environment variables on process startup.

A process fails fast if required configuration is invalid.

Separate schemas should exist for:

```text
web public/server config
api config
worker config
migration config
```

Optional provider configuration should still fail clearly when the corresponding feature is enabled but credentials are missing.

## 10. GitHub Actions Pipeline

### Pull request pipeline

```text
checkout
pnpm install --frozen-lockfile
lint
typecheck
unit tests
integration tests
prisma validate/format check
migration validation
OpenAPI generation
typed client generation/staleness check
build web/api/worker
security/dependency checks
```

### Main/release pipeline

```text
all PR quality gates
build immutable Docker images
push images to GHCR
deploy to staging
run smoke/integration checks
manual/environment approval for production
create DB restore point / verify backup
run production migration job
deploy production services
run production smoke checks
record release
```

## 11. Database Migration Deployment

Production migration is a one-shot controlled operation, not something every API replica runs at startup.

Sequence:

1. verify recent backup/restore point;
2. put release into maintenance/compatibility mode when migration requires it;
3. run `prisma migrate deploy` from the migration image/job;
4. verify migration exit status and schema state;
5. deploy compatible API/worker/web images;
6. run smoke tests;
7. remove maintenance mode.

For non-breaking expand/contract changes, application versions should be compatible with both old and new schema during the rolling window.

## 12. Deployment Strategy

Initial deployment uses versioned Docker Compose on the application host.

Suggested server paths:

```text
/opt/cartnest/
  compose.yaml
  releases/
  env/
  scripts/
  state/        # only non-secret operational state when required
```

Release process:

```text
pull immutable images
run migration job
start/update api + worker + web
wait for health checks
reload/confirm Caddy routing
run smoke tests
mark release successful
```

Brief maintenance windows are acceptable for early schema-breaking MVP releases. As usage grows, move toward expand/contract migrations and blue/green/rolling application instances.

## 13. Health and Readiness Endpoints

Fastify:

```text
GET /health/live
GET /health/ready
GET /version
```

- liveness: process/event loop is alive;
- readiness: critical dependencies required to serve traffic are usable;
- version: commit/build identifier without exposing secrets.

Do not make liveness fail merely because an external payment provider is temporarily down; external provider health is an operational dependency metric, not necessarily a reason to restart the API.

Worker should expose or emit a heartbeat/queue-health signal separately.

## 14. Graceful Shutdown

On SIGTERM:

### API

1. stop accepting new requests;
2. allow in-flight requests a bounded drain time;
3. close Fastify;
4. close DB/Redis connections;
5. exit.

### Worker

1. stop accepting new jobs;
2. allow current jobs to complete up to shutdown timeout;
3. release/retry jobs safely if interrupted;
4. close Redis/DB connections;
5. exit.

## 15. Resource Limits

Every production container should define CPU/memory expectations and restart policy.

Rules:

- avoid unlimited worker concurrency;
- connection pools are sized for total replicas, not per-container maximum in isolation;
- worker concurrency is configured per queue/provider limits;
- provider APIs are protected by client-side timeout and retry policy;
- logs cannot fill the root filesystem indefinitely.

## 16. Database Connections

- production connection uses TLS where provider supports/requires it;
- use bounded connection pool;
- account for web/API/worker replicas together;
- long-running reporting queries must not starve transactional checkout/payment queries;
- migrations use an appropriate direct database connection if the deployment uses a pooler.

## 17. Redis Operations

Redis initially supports BullMQ/background jobs and selected ephemeral coordination.

Redis is not financial truth.

If Redis data is lost:

- PostgreSQL business state remains authoritative;
- OutboxEvent/reconciliation logic must recreate/re-drive critical work;
- jobs that cannot be reconstructed must be designed explicitly before relying on Redis.

Do not store the only copy of a payment or order state in Redis.

## 18. Maintenance Mode

Maintenance mode may block customer/vendor mutations while allowing:

- health checks;
- provider webhooks;
- admin operational access where safe;
- read-only status pages.

Payment webhooks must normally remain receivable even during customer-facing maintenance.

## 19. Rollback Principle

Application rollback is safe only when the previous application version remains schema-compatible.

If a migration is backward-compatible:

1. redeploy previous image SHA;
2. keep new additive schema;
3. investigate/fix forward.

If schema is incompatible, use the documented migration recovery plan. Never manually delete production columns to make an old image boot.

## 20. Production Access

- no shared root credentials;
- SSH keys, not password SSH;
- restrict sudo;
- separate deployment/service user where practical;
- database access from private/trusted network only;
- production console access is exceptional and auditable;
- routine support uses admin tools, not direct SQL.

## 21. Operational Cadence

### Daily automated

- backup verification;
- failed-job/dead-letter checks;
- payment reconciliation;
- certificate/host health;
- alert evaluation.

### Weekly

- dependency/security review;
- disk/resource trend;
- slow-query review;
- provider failure trend;
- backup success report.

### Monthly/quarterly

- restore drill;
- access review;
- secret rotation according to risk policy;
- threat-model change review;
- load/capacity review.

## 22. Deployment Definition of Done

A release is not complete until:

- immutable images exist;
- migrations succeeded;
- health checks are green;
- smoke tests pass;
- webhook endpoints are reachable;
- worker is consuming critical queues;
- error/latency dashboards are normal;
- deployed commit is recorded;
- rollback target is known;
- backup/restore point was verified.
