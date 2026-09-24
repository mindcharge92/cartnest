import { getWorkerEnvironment } from "@repo/config/worker";
import { createDatabaseClient } from "@repo/database";
import type { Job } from "bullmq";
import { getWorkerHealth, recordOutboxRun, recordWorkerFailure } from "./health.js";
import { OutboxDispatcher } from "./outbox.js";
import { closeWorkerConsumers, createWorkerConsumers } from "./processors.js";
import { closeQueueRegistry, createQueueRegistry } from "./queues.js";
import { startWorkerScheduler } from "./scheduler.js";
import type { BackgroundJobData } from "./types.js";

const environment = getWorkerEnvironment();
const database = createDatabaseClient({ connectionString: environment.databaseUrl });
const queues = createQueueRegistry(environment.redisUrl, environment.queuePrefix);
const consumers = createWorkerConsumers(database, environment.redisUrl, environment.queuePrefix);
const dispatcher = new OutboxDispatcher(database, queues, {
  batchSize: environment.outboxBatchSize,
  maxAttempts: environment.outboxMaxAttempts,
  lockTimeoutMs: environment.outboxLockTimeoutMs,
});

function logError(message: string, error: unknown): void {
  recordWorkerFailure();
  console.error(JSON.stringify({
    level: "error",
    message,
    error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown worker error",
  }));
}

for (const [queueName, worker] of Object.entries(consumers)) {
  worker.on("failed", (job: Job<BackgroundJobData> | undefined, error: Error) => {
    logError("CartNest background job failed", error);
    console.error(JSON.stringify({
      level: "error",
      message: "CartNest job failure context",
      queue: queueName,
      jobId: job?.id ?? null,
      jobName: job?.name ?? null,
      attemptsMade: job?.attemptsMade ?? null,
    }));
  });
  worker.on("error", (error: Error) =>
    logError(`CartNest ${queueName} worker connection/runtime error`, error),
  );
}

const scheduler = startWorkerScheduler(
  queues,
  environment.maintenanceIntervalMs,
  (error) => logError("CartNest scheduler could not enqueue maintenance work", error),
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTransientDatabaseError(error: unknown): boolean {
  return /(unable to start a transaction|transaction api error|timed? ?out|timeout|connection.*(?:closed|reset|refused)|ECONNRESET|ETIMEDOUT|P1001|P2024)/i.test(
    errorMessage(error),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatchOutboxWithRetry() {
  const retryDelaysMs = [350, 1_000] as const;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await dispatcher.dispatchOnce();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < retryDelaysMs.length && isTransientDatabaseError(error);
      if (!canRetry) throw error;

      const delayMs = retryDelaysMs[attempt] ?? 1_000;
      console.warn(JSON.stringify({
        level: "warn",
        message: "CartNest outbox claim hit a transient database error; retrying",
        attempt: attempt + 1,
        delayMs,
        error: errorMessage(error).slice(0, 500),
      }));
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function runOutbox(): Promise<void> {
  try {
    const result = await dispatchOutboxWithRetry();
    recordOutboxRun(result);
    if (result.claimed > 0) {
      console.info(JSON.stringify({ level: "info", message: "CartNest outbox dispatch", ...result }));
    }
  } catch (error) {
    logError("CartNest outbox dispatcher failed", error);
  }
}

void runOutbox();
const outboxTimer = setInterval(() => void runOutbox(), environment.outboxPollMs);
outboxTimer.unref();

console.info(JSON.stringify({
  level: "info",
  message: "CartNest worker started",
  environment: environment.nodeEnv,
  queuePrefix: environment.queuePrefix,
  outboxPollMs: environment.outboxPollMs,
  outboxBatchSize: environment.outboxBatchSize,
}));

const heartbeat = setInterval(() => {
  console.info(JSON.stringify({ level: "debug", ...getWorkerHealth() }));
}, 60_000);
heartbeat.unref();

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(outboxTimer);
  clearInterval(heartbeat);
  scheduler.close();
  console.info(JSON.stringify({ level: "info", message: "CartNest worker draining", signal }));
  try {
    await closeWorkerConsumers(consumers);
    await closeQueueRegistry(queues);
    await database.$disconnect();
    console.info(JSON.stringify({ level: "info", message: "CartNest worker stopped", signal }));
  } catch (error) {
    logError("CartNest worker shutdown failed", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
