import { describe, expect, it, vi } from "vitest";
import {
  completeIdempotencyRecord,
  enqueueOutboxEvent,
  writeAuditEntry,
} from "./primitives.js";
import type { DatabaseTransaction } from "./transaction.js";

describe("database primitives", () => {
  it("omits absent optional audit fields instead of passing undefined to Prisma", async () => {
    const create = vi.fn(async (args: unknown) => args);
    const transaction = { auditLog: { create } } as unknown as DatabaseTransaction;

    await writeAuditEntry(transaction, {
      actorType: "SYSTEM",
      action: "TEST_ACTION",
      entityType: "test-entity",
      entityId: "entity-1",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        actorType: "SYSTEM",
        action: "TEST_ACTION",
        entityType: "test-entity",
        entityId: "entity-1",
      },
    });
  });

  it("omits absent outbox availability so the database default remains authoritative", async () => {
    const create = vi.fn(async (args: unknown) => args);
    const transaction = { outboxEvent: { create } } as unknown as DatabaseTransaction;

    await enqueueOutboxEvent(transaction, {
      aggregateType: "order",
      aggregateId: "order-1",
      eventType: "ORDER_CREATED",
      payload: { orderId: "order-1" },
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        aggregateType: "order",
        aggregateId: "order-1",
        eventType: "ORDER_CREATED",
        eventVersion: 1,
        payload: { orderId: "order-1" },
      },
    });
  });

  it("passes an explicit outbox availability timestamp when supplied", async () => {
    const create = vi.fn(async (args: unknown) => args);
    const transaction = { outboxEvent: { create } } as unknown as DatabaseTransaction;
    const availableAt = new Date("2026-09-07T12:00:00.000Z");

    await enqueueOutboxEvent(transaction, {
      aggregateType: "order",
      aggregateId: "order-1",
      eventType: "ORDER_CREATED",
      eventVersion: 2,
      payload: { orderId: "order-1" },
      availableAt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        aggregateType: "order",
        aggregateId: "order-1",
        eventType: "ORDER_CREATED",
        eventVersion: 2,
        payload: { orderId: "order-1" },
        availableAt,
      },
    });
  });

  it("does not clear idempotency metadata when completion input omits it", async () => {
    const update = vi.fn(async (args: unknown) => args);
    const transaction = { idempotencyRecord: { update } } as unknown as DatabaseTransaction;

    await completeIdempotencyRecord(transaction, {
      id: "record-1",
      responseStatus: 204,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "record-1" },
      data: {
        status: "COMPLETED",
        responseStatus: 204,
      },
    });
  });
});
