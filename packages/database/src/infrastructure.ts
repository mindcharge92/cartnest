import { Prisma } from "./generated/prisma/client.js";
import type { DatabaseTransaction } from "./transaction.js";

export interface OutboxEventInput {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly eventVersion?: number;
  readonly payload: Prisma.InputJsonValue;
  readonly availableAt?: Date;
}

export async function enqueueOutboxEvent(
  transaction: DatabaseTransaction,
  input: OutboxEventInput,
) {
  return transaction.outboxEvent.create({
    data: {
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      eventVersion: input.eventVersion ?? 1,
      payload: input.payload,
      ...(input.availableAt ? { availableAt: input.availableAt } : {}),
    },
  });
}

export interface AuditLogInput {
  readonly actorType: "USER" | "SYSTEM" | "PROVIDER";
  readonly actorUserId?: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly requestId?: string;
  readonly metadata?: Prisma.InputJsonValue;
}

export async function writeAuditLog(
  transaction: DatabaseTransaction,
  input: AuditLogInput,
) {
  return transaction.auditLog.create({
    data: {
      actorType: input.actorType,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

export interface BeginIdempotencyInput {
  readonly principalId: string;
  readonly operation: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly expiresAt: Date;
}

export async function beginIdempotencyRecord(
  transaction: DatabaseTransaction,
  input: BeginIdempotencyInput,
) {
  return transaction.idempotencyRecord.create({ data: input });
}
