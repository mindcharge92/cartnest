import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@repo/database";
import { OutboxDispatcher } from "./outbox.js";
import type { QueueRegistry } from "./queues.js";

describe("OutboxDispatcher", () => {
  it("claims with one atomic query instead of an interactive Prisma transaction", async () => {
    const queryRaw = vi.fn(async () => []);
    const transaction = vi.fn();

    const database = {
      $queryRaw: queryRaw,
      $transaction: transaction,
    } as unknown as DatabaseClient;

    const dispatcher = new OutboxDispatcher(
      database,
      {} as QueueRegistry,
      { batchSize: 50, maxAttempts: 5, lockTimeoutMs: 60_000 },
    );

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 0,
      published: 0,
      failed: 0,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});
