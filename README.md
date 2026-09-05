# CartNest

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses.

The repository is intentionally starting with architecture, product, security, API, data, and engineering standards before implementation code is introduced.

## Planned Stack

- Next.js + TypeScript
- Fastify + TypeScript
- Turborepo
- PostgreSQL + Prisma
- Modular monolith
- TypeBox shared contracts
- OpenAPI + typed API client
- Paystack + Flutterwave
- Docker + GitHub Actions

## Documentation

Start with [`docs/README.md`](docs/README.md).

The documentation covers:

- product feature scope;
- system architecture;
- API contract strategy;
- modular monolith boundaries;
- monorepo/package boundaries;
- authentication, RBAC, and resource ownership;
- money and currency handling;
- multi-vendor orders;
- payment gateway architecture;
- API versioning;
- media/object storage;
- idempotency and concurrency;
- backend/frontend standards;
- error handling;
- testing and quality gates;
- API endpoint design;
- database/domain model.

## Current Phase

**Phase: Architecture and specification**

No production application code should be added until the baseline documentation has been reviewed and the remaining proposed decisions required by the first implementation slice are confirmed.
