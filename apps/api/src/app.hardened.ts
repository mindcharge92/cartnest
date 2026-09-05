import { getApiEnvironment } from "@repo/config/api";
import type { DatabaseClient } from "@repo/database";
import type { FastifyServerOptions } from "fastify";
import { buildApp, type ReadinessProbes } from "./app.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { registerPrivacyRoutes } from "./modules/privacy/privacy.routes.js";
import { PrivacyService } from "./modules/privacy/privacy.service.js";
import { registerP11SecurityHardening } from "./p11.security.js";

/**
 * P11 composition layer. Keeping hardening and NDPR routes outside the older
 * base builder lets the backend-first phase remain reviewable while still
 * making the production server/OpenAPI generator use the hardened surface.
 */
export function buildHardenedApp(
  options: FastifyServerOptions = {},
  probes?: ReadinessProbes,
  database?: DatabaseClient,
) {
  const environment = getApiEnvironment();
  const app = buildApp(options, probes, database);
  registerP11SecurityHardening(app, environment);

  const authService = database
    ? new AuthService(new PrismaAuthRepository(database), environment)
    : undefined;
  const privacyService = database ? new PrivacyService(database) : undefined;
  registerPrivacyRoutes(app, { service: privacyService, authService });

  return app;
}
