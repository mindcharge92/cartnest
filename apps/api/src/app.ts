import { getApiEnvironment } from "@repo/config/api";
import Fastify, { type FastifyServerOptions } from "fastify";

export function buildApp(options: FastifyServerOptions = {}) {
  const environment = getApiEnvironment();
  const app = Fastify({ logger: environment.nodeEnv !== "test", ...options });

  app.get("/health", async () => ({
    status: "ok",
    service: "cartnest-api",
    uptimeSeconds: Math.floor(process.uptime()),
  }));

  app.get("/ready", async () => ({
    status: "ready",
    service: "cartnest-api",
    dependencies: {
      database: environment.databaseUrl ? "configured" : "not-configured",
      redis: environment.redisUrl ? "configured" : "not-configured",
    },
  }));

  return app;
}
