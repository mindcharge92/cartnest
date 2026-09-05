import type { Prisma } from "./generated/prisma/client.js";
import type { DatabaseTransaction } from "./transaction.js";

export interface AuditEntryInput {
  readonly actorType: "USER" | "SYSTEM" | "PROVIDER";
  readonly actorUserId?: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly requestId?: string;
  readonly metadata?: Prisma.InputJsonValue;
}

export async function writeAuditEntry(
  transaction: DatabaseTransaction,
  input: AuditEntryInput,
) {
  return transaction.auditLog.create({
    data: {
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: input.requestId,
      metadata: input.metadata,
    },
  });
}

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
      availableAt: input.availableAt,
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
  return transaction.idempotencyRecord.create({
    data: {
      principalId: input.principalId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      expiresAt: input.expiresAt,
    },
  });
}

export interface CompleteIdempotencyInput {
  readonly id: string;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly responseStatus: number;
  readonly responseBody?: Prisma.InputJsonValue;
}

export async function completeIdempotencyRecord(
  transaction: DatabaseTransaction,
  input: CompleteIdempotencyInput,
) {
  return transaction.idempotencyRecord.update({
    where: { id: input.id },
    data: {
      status: "COMPLETED",
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
    },
  });
}
