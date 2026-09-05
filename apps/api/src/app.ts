import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { getApiEnvironment } from "@repo/config/api";
import { HealthResponseSchema, ReadinessResponseSchema } from "@repo/contracts";
import { createDatabaseClient, isDatabaseReady } from "@repo/database";
import Fastify, { type FastifyServerOptions } from "fastify";

export function buildApp(options: FastifyServerOptions = {}) {
  const environment = getApiEnvironment();
  const app = Fastify({ logger: environment.nodeEnv !== "test", ...options }).withTypeProvider<TypeBoxTypeProvider>();

  void app.register(swagger, {
    openapi: {
      info: {
        title: "CartNest API",
        description: "Contract-first REST API for the CartNest multi-vendor marketplace.",
        version: "1.0.0",
      },
      servers: [{ url: "/api/v1", description: "Versioned CartNest API" }],
      tags: [{ name: "system", description: "Platform health and readiness" }],
    },
  });

  if (environment.nodeEnv !== "production") {
    void app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: { docExpansion: "list", deepLinking: true },
    });
  }

  const database = environment.databaseUrl
    ? createDatabaseClient({ connectionString: environment.databaseUrl })
    : undefined;

  if (database) {
    app.addHook("onClose", async () => {
      await database.$disconnect();
    });
  }

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        operationId: "getHealth",
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: "ok" as const,
      service: "cartnest-api" as const,
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["system"],
        operationId: "getReadiness",
        response: { 200: ReadinessResponseSchema, 503: ReadinessResponseSchema },
      },
    },
    async (_request, reply) => {
      const databaseReady = database ? await isDatabaseReady(database) : false;
      const ready = databaseReady;
      const body = {
        status: ready ? ("ready" as const) : ("degraded" as const),
        service: "cartnest-api" as const,
        dependencies: {
          database: databaseReady ? ("ready" as const) : ("not-ready" as const),
          redis: environment.redisUrl ? ("configured" as const) : ("not-configured" as const),
        },
      };

      return reply.code(ready ? 200 : 503).send(body);
    },
  );

  return app;
}
