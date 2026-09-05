import { getWorkerEnvironment } from "@repo/config/worker";
import { getWorkerHealth } from "./health.js";

const environment = getWorkerEnvironment();

console.info(
  JSON.stringify({
    level: "info",
    message: "CartNest worker started",
    environment: environment.nodeEnv,
    redisConfigured: Boolean(environment.redisUrl),
  }),
);

const heartbeat = setInterval(() => {
  console.info(JSON.stringify({ level: "debug", ...getWorkerHealth() }));
}, 60_000);

function shutdown(signal: string) {
  clearInterval(heartbeat);
  console.info(JSON.stringify({ level: "info", message: "CartNest worker stopped", signal }));
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
