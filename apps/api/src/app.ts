import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  TypeBoxTypeProvider,
  TypeBoxValidatorCompiler,
} from "@fastify/type-provider-typebox";
import { getApiEnvironment } from "@repo/config/api";
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  SystemInfoResponseSchema,
} from "@repo/contracts";
import type { DatabaseClient } from "@repo/database";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { registerAuthRoutes, registerSecurityPlugins } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";

export interface ReadinessProbes {
  readonly database: () => Promise<boolean>;
  readonly redis: () => Promise<boolean>;
}

const unavailableProbe = async () => false;
const defaultProbes: ReadinessProbes = { database: unavailableProbe, redis: unavailableProbe };

export function buildApp(
  options: FastifyServerOptions = {},
  probes: ReadinessProbes = defaultProbes,
  database?: DatabaseClient,
) {
  const environment = getApiEnvironment();
  const app = Fastify({ logger: environment.nodeEnv !== "test", ...options })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request does not match the required contract.",
          requestId: request.id,
          details: error.validation,
        },
      });
    }
    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500).send({
      error: {
        code: error.statusCode === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: error.statusCode === 429 ? "Too many requests." : "An unexpected error occurred.",
        requestId: request.id,
      },
    });
  });

  registerSecurityPlugins(app, environment);

  void app.register(swagger, {
    openapi: {
      info: {
        title: "CartNest API",
        description: "Contract-first REST API for the CartNest multi-vendor marketplace.",
        version: "1.0.0",
      },
      tags: [
        { name: "system", description: "Platform health, readiness, and API metadata" },
        { name: "auth", description: "Identity, sessions, verification, OAuth, and MFA" },
      ],
    },
  });

  if (environment.nodeEnv !== "production") {
    void app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: { docExpansion: "list", deepLinking: true },
    });
  }

  const authService = database ? new AuthService(new PrismaAuthRepository(database), environment) : undefined;
  registerAuthRoutes(app, { service: authService, environment });

  async function dependencyStates() {
    const [databaseReady, redisReady] = await Promise.all([probes.database(), probes.redis()]);
    return {
      database: databaseReady ? ("ready" as const) : ("unavailable" as const),
      redis: redisReady ? ("ready" as const) : ("unavailable" as const),
    };
  }

  app.get("/health", {
    schema: { tags: ["system"], operationId: "getHealth", response: { 200: HealthResponseSchema } },
  }, async () => ({ status: "ok" as const, service: "cartnest-api" as const, uptimeSeconds: Math.floor(process.uptime()) }));

  app.get("/ready", {
    schema: { tags: ["system"], operationId: "getReadiness", response: { 200: ReadinessResponseSchema, 503: ReadinessResponseSchema } },
  }, async (_request, reply) => {
    const dependencies = await dependencyStates();
    const ready = dependencies.database === "ready" && dependencies.redis === "ready";
    return reply.code(ready ? 200 : 503).send({ status: ready ? ("ready" as const) : ("not-ready" as const), service: "cartnest-api" as const, dependencies });
  });

  app.get("/api/v1/system/info", {
    schema: { tags: ["system"], operationId: "getSystemInfo", response: { 200: SystemInfoResponseSchema } },
  }, async () => ({ service: "cartnest-api" as const, apiVersion: "v1" as const, timestamp: new Date().toISOString(), dependencies: await dependencyStates() }));

  return app;
}
