import { getWorkerEnvironment } from "@repo/config/worker";
import { createDatabaseClient } from "@repo/database";
import { buildDurableEventEnvelope } from "./outbox.js";
import {
  closeQueueRegistry,
  createQueueRegistry,
  defaultEventJobOptions,
  queueSubscriptions,
} from "./queues.js";
import { SUPPORTED_EVENT_VERSION } from "./types.js";

const CONFIRMATION = "REBUILD_IDEMPOTENT_NOTIFICATION_JOBS";

function usage(): never {
  throw new Error(
    "Usage: WORKER_REDIS_RECOVERY_SINCE=<ISO timestamp> " +
      `WORKER_REDIS_RECOVERY_CONFIRM=${CONFIRMATION} ` +
      "pnpm --filter @cartnest/worker outbox:recover",
  );
}

if (process.env.WORKER_REDIS_RECOVERY_CONFIRM !== CONFIRMATION) usage();

const sinceText = process.env.WORKER_REDIS_RECOVERY_SINCE?.trim();
if (!sinceText) usage();
const since = new Date(sinceText);
if (Number.isNaN(since.getTime())) {
  throw new Error("WORKER_REDIS_RECOVERY_SINCE must be a valid ISO timestamp.");
}

const environment = getWorkerEnvironment();
const database = createDatabaseClient({ connectionString: environment.databaseUrl });
const queues = createQueueRegistry(environment.redisUrl, environment.queuePrefix);

try {
  const events = await database.outboxEvent.findMany({
    where: {
      status: "PUBLISHED",
      publishedAt: { gte: since },
      eventVersion: SUPPORTED_EVENT_VERSION,
    },
    orderBy: { createdAt: "asc" },
    take: 10_000,
  });

  let considered = 0;
  let enqueued = 0;
  let skipped = 0;

  for (const event of events) {
    const envelope = buildDurableEventEnvelope(event);
    const subscriptions = queueSubscriptions(envelope.eventType);

    // Recovery is deliberately limited to currently subscribed consumers whose
    // business effects are database-idempotent. Do not widen this to financial
    // execution queues without a dedicated reconciliation/replay contract.
    if (subscriptions.length === 0 || subscriptions.some((queue) => queue !== "notifications")) {
      skipped += 1;
      continue;
    }

    considered += 1;
    for (const queueKey of subscriptions) {
      await queues[queueKey].add(
        envelope.eventType,
        envelope,
        defaultEventJobOptions(envelope),
      );
      enqueued += 1;
    }
  }

  console.info(JSON.stringify({
    status: "redis-recovery-jobs-rebuilt",
    since: since.toISOString(),
    scannedPublishedEvents: events.length,
    considered,
    enqueued,
    skipped,
    limitation: "notification subscribers only; eventId job identity and notification dedupe keys provide idempotency",
  }));
} finally {
  await closeQueueRegistry(queues);
  await database.$disconnect();
}
