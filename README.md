# CartNest

CartNest is a documentation-first multi-vendor e-commerce marketplace for Nigerian businesses.

The repository is intentionally starting with architecture, product, security, API, data, implementation, operations, and engineering standards before implementation code is introduced.

## Planned Stack

- Next.js + TypeScript
- Fastify + TypeScript
- Turborepo
- PostgreSQL + Prisma
- Modular monolith
- TypeBox shared contracts
- OpenAPI + typed API client
- Paystack + Flutterwave
- Cloudflare R2
- Docker + GitHub Actions

## Documentation

Start with [`docs/README.md`](docs/README.md).

The documentation covers:

- product feature scope and approved business decisions;
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
- database/domain model;
- exact implementation phases;
- Prisma schema and migrations;
- deployment and operations;
- observability;
- background jobs and events;
- notifications;
- provider integrations;
- threat modeling;
- backup/disaster recovery;
- production runbooks.

## Current Phase

**Phase: Architecture, specification, and implementation planning**

Production application code should follow the approved documentation baseline. If implementation intentionally deviates from an accepted decision, update or supersede the relevant ADR/specification first.
