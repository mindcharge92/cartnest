# ADR-003: Turborepo Monorepo Architecture and Package Boundaries

**Status:** Accepted baseline  
**Date:** 4 September 2026  
**Tool:** Turborepo  
**Applications:** Next.js web + Fastify API  
**Related:** ADR-001, ADR-002

## Decision Summary

Use a Turborepo monorepo containing the Next.js web app, Fastify API, and narrowly scoped shared packages. Package boundaries are architectural boundaries, not a reason to place all code in shared folders. Business logic remains in the owning application/module unless true multi-app reuse exists.

## 1. Target Repository

```text
root/
  apps/
    web/                  # Next.js marketplace
    api/                  # Fastify modular monolith
  packages/
    contracts/            # TypeBox API contracts + DTO types
    api-client/           # generated/mechanically derived typed client
    database/             # Prisma schema/client/migrations
    ui/                   # intentionally reusable UI
    config/               # runtime-safe configuration helpers
    eslint-config/
    typescript-config/
    testing/              # shared test utilities only
  docs/
    product/
    architecture/
    engineering/
    api/
    security/
    data/
  turbo.json
  package.json
  pnpm-workspace.yaml
```

## 2. Package Principles

- Prefer fewer cohesive packages over many tiny packages.
- A package exists when it has a stable responsibility and multiple consumers or needs independent boundary enforcement.
- Do not move backend domain logic into packages merely to shorten imports.
- Shared packages must not become dumping grounds named `common`, `utils`, `helpers`, or `shared` without ownership.
- Apps may contain feature-local components/utilities that are not reused elsewhere.
- Package public APIs should be explicit and small.

## 3. Allowed Dependency Graph

```text
apps/web  ---> packages/api-client ---> packages/contracts
    |                |
    +---> packages/ui
    +---> packages/config

apps/api  ---> packages/contracts
    |-----> packages/database
    +-----> packages/config

packages/api-client -X-> packages/database
packages/contracts  -X-> packages/database
apps/web            -X-> packages/database
packages/ui         -X-> apps/*
```

This protects the most important boundary: frontend/browser code must never become coupled to the persistence layer.

## 4. Package Responsibilities

| Package | Contains | Must Not Contain |
| --- | --- | --- |
| `@repo/contracts` | TypeBox schemas, inferred DTO types, API enums/common envelopes | Prisma, business services, Next.js/Fastify application instances |
| `@repo/api-client` | generated endpoint client, transport/error/auth hooks | business rules, DB access |
| `@repo/database` | Prisma schema/client, migrations, persistence primitives | frontend/client contracts |
| `@repo/ui` | generic reusable presentation components | domain workflows tied to a single feature |
| `@repo/config` | validated shared configuration primitives | browser exposure of server secrets |
| `@repo/testing` | factories and test utilities truly reused | production business logic |

## 5. Workspace Baseline

Use one package manager consistently. **pnpm is the recommended baseline** because it works well with workspaces and avoids unnecessary dependency duplication.

Internal dependencies should use the workspace protocol where practical.

Example:

```json
{
  "dependencies": {
    "@repo/contracts": "workspace:*"
  }
}
```

## 6. TypeScript Boundaries

Centralize base TypeScript configuration in `packages/typescript-config`, but allow app-specific extensions.

Requirements:

- strict TypeScript mode;
- no implicit `any` baseline;
- server-only package boundaries;
- browser-safe packages must not import Node/server-only modules;
- project references/build configuration should support reliable task ordering where needed.

## 7. Lint and Architecture Enforcement

Central lint configuration may define:

- import ordering;
- forbidden dependency paths;
- server/client boundary rules;
- unused-code rules;
- generated-directory exclusions.

As implementation begins, add automated checks that prevent:

```text
apps/web -> @repo/database
@repo/contracts -> @repo/database
@repo/api-client -> @repo/database
module A infrastructure -> module B infrastructure
```

## 8. Turborepo Task Model

| Task | Cache | Dependencies | Notes |
| --- | --- | --- | --- |
| `lint` | Yes | optional upstream lint | No required output artifact |
| `typecheck` | Yes | upstream typecheck | Contracts should typecheck before consumers |
| `test` | Yes | package-specific | Unit/integration scopes may differ |
| `build` | Yes | `^build` | Outputs configured per app/package |
| `openapi:generate` | Yes | API/contracts build as needed | Deterministic OpenAPI generation |
| `api-client:generate` | Yes | OpenAPI generation | Must fail if generation fails |
| `dev` | No | persistent | Run web/API concurrently |

## 9. Suggested Root Scripts

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "openapi:generate": "turbo openapi:generate",
    "api-client:generate": "turbo api-client:generate"
  }
}
```

Exact scripts may evolve, but the root should orchestrate rather than hide package behavior.

## 10. Environment Variable Boundaries

- Server secrets belong to the Fastify runtime and must not be exposed through `NEXT_PUBLIC_*`.
- Next.js receives only browser-safe public configuration.
- Shared config validates variables but does not make server values safe for browser use.
- `.env.example` documents required variable names, not secret values.
- CI/CD owns environment injection in deployed environments.

## 11. Generated Artifacts

OpenAPI and API-client generation are part of the build discipline.

Rules:

- generated client code is not manually edited;
- generation must be deterministic;
- CI verifies stale output according to repository policy;
- the source contract is the Fastify/TypeBox route definition, not the generated client.

## 12. Internal Package Versioning

While CartNest deploys atomically, internal packages may use workspace versions without independent publishing.

Breaking contract changes can be migrated across affected packages in one pull request.

If a package later becomes externally published, adopt explicit semantic versioning and release management then.

## 13. CI Pipeline

```text
install
  -> lint
  -> typecheck
  -> unit tests
  -> API integration tests
  -> generate OpenAPI
  -> generate typed client
  -> verify generated artifacts
  -> build API + web
  -> security/dependency checks as adopted
  -> deploy
```

The same critical commands should work locally and in CI.

## 14. Ownership Guidance

Shared package ownership must be intentional.

Examples:

- contract changes require backend + affected consumer review;
- DB schema changes require backend/data review;
- UI package changes should remain generic rather than marketplace-domain specific;
- adding a new package should require a clear justification.

## 15. Definition of Done

- [ ] repo structure and package names established;
- [ ] dependency graph documented and enforceable;
- [ ] Turborepo tasks configured with correct inputs/outputs;
- [ ] typed client generation included in task graph;
- [ ] no frontend dependency on database/server-only packages;
- [ ] strict TypeScript configuration is shared;
- [ ] CI runs the same key tasks available locally.

## 16. Final Decision

CartNest will use Turborepo to coordinate a small number of cohesive applications/packages. Package boundaries will reinforce architecture, not replace business-module boundaries or create unnecessary abstraction.
