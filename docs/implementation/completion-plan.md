# Completion plan

Updated: 8 September 2026

The approved product decisions and existing P0–P13 implementation plan remain the
scope. Existing architecture records are the project methodology; no duplicate
EDID scaffold is needed.

## Delivery sequence

1. Reproducible dependency installation and full local quality checks.
2. Generated, reviewed PostgreSQL migrations, including custom constraints;
   clean deployment, repeat deployment, and isolated recovery verification.
3. Durable notification delivery and provider reconciliation with bounded retries,
   idempotency, explicit failures, and provider-independent tests.
4. Buyer, vendor, and admin integration checks, responsive browser verification,
   security checks, and production build.
5. Staging/provider/UAT/recovery evidence and the existing P12 release gate.

## Architecture decision

Retain the documented modular monolith, separate Next.js/Fastify/worker processes,
PostgreSQL authority, and Redis/BullMQ delivery. Replacing the stack or introducing
microservices adds migration and operational risk without an evidenced need.
Business mutations stay behind domain services; workers must not duplicate financial
settlement logic. External providers remain adapters with configured credentials.

Security, data integrity, and reliability are hard gates: no credential logging,
cross-tenant mutations, duplicate financial execution, or fabricated release evidence.
Verify database constraints and concurrent claims against PostgreSQL, retries against
Redis, and privileged workflows through API authorization. Bound batch sizes, request
timeouts, retry counts, and recovery windows to control load and cost. Retain module
ownership and generated contracts for collaboration, readability, maintainability,
and testability. Keep operational failures observable and replay auditable.

Performance and scalability targets remain those in the existing engineering and
operations standards; measure rather than infer them. Verify keyboard interaction,
loading/error states, and 390px layouts for accessibility and UX resilience.
Prefer existing dependencies and local disposable infrastructure for delivery speed,
cost, and reversibility. Reassess architecture only if measured capacity, provider
contracts, security boundaries, or independent team ownership require it.

## Evidence rules

Cached tests are identified as cached. Local verification does not certify external
providers or production. Missing staging credentials, provider contracts, and human
UAT approvals remain explicit dependencies rather than automatic passes.
