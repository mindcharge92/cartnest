import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "@repo/database";
import { expireInventoryReservations } from "./maintenance.js";
import { OutboxDispatcher } from "./outbox.js";
import { closeQueueRegistry, createQueueRegistry, type QueueRegistry } from "./queues.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;

describe.skipIf(!databaseUrl || !redisUrl)("PostgreSQL and Redis worker integration", () => {
  let database: DatabaseClient;
  let queues: QueueRegistry;
  const prefix = `cartnest-test-${randomUUID()}`;
  const eventIds: string[] = [];
  let variantId: string;
  let productId: string;
  let storeId: string;
  let vendorId: string;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (!url.pathname.startsWith("/cartnest_test")) throw new Error("Use a disposable cartnest_test database.");
    database = createDatabaseClient({ connectionString: databaseUrl! });
    queues = createQueueRegistry(redisUrl!, prefix);
    const vendor = await database.vendor.create({ data: { displayName: prefix } });
    vendorId = vendor.id;
    const store = await database.store.create({ data: { vendorId, name: prefix, slug: prefix } });
    storeId = store.id;
    const product = await database.product.create({ data: { storeId, name: "Test", slug: prefix, description: "Test" } });
    productId = product.id;
    const variant = await database.productVariant.create({ data: {
      productId, storeId, sku: prefix, priceAmountMinor: 1000n,
      inventory: { create: { onHand: 10, reserved: 4 } },
    } });
    variantId = variant.id;
  }, 30_000);

  afterAll(async () => {
    if (queues) {
      await Promise.all(Object.values(queues).map((queue) => queue.obliterate({ force: true })));
      await closeQueueRegistry(queues);
    }
    if (database) {
      await database.outboxEvent.deleteMany({ where: { id: { in: eventIds } } });
      if (variantId) {
        await database.inventoryReservation.deleteMany({ where: { variantId } });
        await database.productVariant.delete({ where: { id: variantId } });
        await database.product.delete({ where: { id: productId } });
        await database.store.delete({ where: { id: storeId } });
        await database.vendor.delete({ where: { id: vendorId } });
      }
      await database.$disconnect();
    }
  });

  it("rejects inventory corruption and expires concurrent reservations exactly once", async () => {
    await expect(database.inventoryItem.update({ where: { variantId }, data: { reserved: 11 } })).rejects.toThrow();
    await database.inventoryReservation.createMany({ data: [1, 2].map(() => ({
      variantId, quantity: 2, createdAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1_000),
    })) });
    const results = await Promise.all([
      expireInventoryReservations(database), expireInventoryReservations(database),
    ]);
    expect(results.reduce((sum, result) => sum + result.releasedQuantity, 0)).toBe(4);
    expect(await database.inventoryItem.findUniqueOrThrow({ where: { variantId } }))
      .toMatchObject({ onHand: 10, reserved: 0 });
    expect((await expireInventoryReservations(database)).expiredReservations).toBe(0);
  });

  it("claims outbox events concurrently and recovers a stale publish without duplicating Redis jobs", async () => {
    for (let index = 0; index < 8; index += 1) {
      const event = await database.outboxEvent.create({ data: {
        aggregateType: "Order", aggregateId: randomUUID(), eventType: "order.created", payload: {},
      } });
      eventIds.push(event.id);
    }
    const options = { batchSize: 500, maxAttempts: 5, lockTimeoutMs: 5_000 };
    const first = new OutboxDispatcher(database, queues, options);
    const second = new OutboxDispatcher(database, queues, options);
    await Promise.all([first.dispatchOnce(), second.dispatchOnce()]);
    expect(await database.outboxEvent.count({ where: { id: { in: eventIds }, status: "PUBLISHED" } })).toBe(8);
    const waitingBefore = (await queues.notifications.getJobs(["wait"]))
      .filter((job) => eventIds.includes(job.id!));
    expect(waitingBefore).toHaveLength(8);
    await database.outboxEvent.update({ where: { id: eventIds[0]! }, data: {
      status: "PROCESSING", lockedAt: new Date(Date.now() - 60_000),
    } });
    expect((await first.dispatchOnce()).published).toBe(1);
    const waitingAfter = (await queues.notifications.getJobs(["wait"]))
      .filter((job) => eventIds.includes(job.id!));
    expect(waitingAfter).toHaveLength(8);
  });

  it("retains unsupported event versions as observable failures", async () => {
    const event = await database.outboxEvent.create({ data: {
      aggregateType: "Order", aggregateId: randomUUID(), eventType: "order.created", eventVersion: 99, payload: {},
    } });
    eventIds.push(event.id);
    const dispatcher = new OutboxDispatcher(database, queues, { batchSize: 10, maxAttempts: 5, lockTimeoutMs: 5_000 });
    expect((await dispatcher.dispatchOnce()).failed).toBe(1);
    expect(await database.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }))
      .toMatchObject({ status: "FAILED", attempts: 5 });
    expect(await queues.notifications.getJob(event.id)).toBeUndefined();
  });
});
