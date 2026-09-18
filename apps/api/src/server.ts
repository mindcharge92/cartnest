import { getApiEnvironment } from "@repo/config/api";
import { createDatabaseClient, isDatabaseReady } from "@repo/database";
import { createClient } from "redis";
import { buildHardenedApp } from "./app.hardened.js";

// `pnpm dev` runs from the workspace root, so load the API's local
// development configuration explicitly rather than relying on the shell to
// supply it. Existing environment variables still take precedence.
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code !== "ENOENT") throw error;
}

const environment = getApiEnvironment();
const database = environment.databaseUrl
  ? createDatabaseClient({ connectionString: environment.databaseUrl })
  : undefined;
const redis = environment.redisUrl ? createClient({ url: environment.redisUrl }) : undefined;

let redisConnectPromise: Promise<unknown> | undefined;

async function redisReady(): Promise<boolean> {
  if (!redis) return false;
  try {
    if (!redis.isOpen) {
      redisConnectPromise ??= redis.connect().finally(() => {
        redisConnectPromise = undefined;
      });
      await redisConnectPromise;
    }
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

const app = buildHardenedApp(
  {},
  {
    database: async () => (database ? isDatabaseReady(database) : false),
    redis: redisReady,
  },
  database,
);

redis?.on("error", (error) => {
  app.log.warn({ errorName: error.name }, "Redis connectivity error");
});

async function closeDependencies() {
  await Promise.allSettled([
    database?.$disconnect(),
    redis?.isOpen ? redis.close() : Promise.resolve(),
  ]);
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down CartNest API");
  await app.close();
  await closeDependencies();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function start() {
  try {
    await app.listen({ host: environment.host, port: environment.port });
  } catch (error) {
    app.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "API startup failed");
    await closeDependencies();
    process.exitCode = 1;
  }
}

void start();
