import { getApiEnvironment } from "@repo/config/api";
import { buildApp } from "./app.js";

const environment = getApiEnvironment();
const app = buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down CartNest API");
  await app.close();
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
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
