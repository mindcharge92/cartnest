import type { DatabaseClient } from "@repo/database";
import { writeAuditEntry } from "@repo/database";

export interface InventoryRecord {
  readonly id: string;
  readonly variantId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly version: number;
  readonly updatedAt: Date;
}

export interface InventoryAdjustmentRecord {
  readonly id: string;
  readonly variantId: string;
  readonly delta: number;
  readonly reason: string;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly actorUserId: string | null;
  readonly createdAt: Date;
}

export type InventoryAdjustmentResult =
  | { readonly kind: "updated"; readonly inventory: InventoryRecord; readonly adjustment: InventoryAdjustmentRecord }
  | { readonly kind: "version_conflict"; readonly inventory: InventoryRecord }
  | { readonly kind: "insufficient_stock"; readonly inventory: InventoryRecord };

export interface InventoryRepository {
  ensureInventory(variantId: string): Promise<InventoryRecord>;
  findInventory(variantId: string): Promise<InventoryRecord | null>;
  listInventory(variantIds: readonly string[]): Promise<InventoryRecord[]>;
  adjustInventory(input: {
    variantId: string;
    delta: number;
    expectedVersion: number;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    actorUserId: string;
  }): Promise<InventoryAdjustmentResult>;
  listAdjustments(variantId: string, limit?: number): Promise<InventoryAdjustmentRecord[]>;
  writeAudit(input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void>;
}

export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly database: DatabaseClient) {}

  async ensureInventory(variantId: string): Promise<InventoryRecord> {
    return this.database.inventoryItem.upsert({
      where: { variantId },
      create: { variantId, onHand: 0, reserved: 0, version: 0 },
      update: {},
    });
  }

  async findInventory(variantId: string): Promise<InventoryRecord | null> {
    return this.database.inventoryItem.findUnique({ where: { variantId } });
  }

  async listInventory(variantIds: readonly string[]): Promise<InventoryRecord[]> {
    if (variantIds.length === 0) return [];
    return this.database.inventoryItem.findMany({ where: { variantId: { in: [...variantIds] } } });
  }

  async adjustInventory(input: {
    variantId: string;
    delta: number;
    expectedVersion: number;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    actorUserId: string;
  }): Promise<InventoryAdjustmentResult> {
    return this.database.$transaction(async (transaction) => {
      let current = await transaction.inventoryItem.findUnique({ where: { variantId: input.variantId } });
      if (!current) {
        current = await transaction.inventoryItem.create({
          data: { variantId: input.variantId, onHand: 0, reserved: 0, version: 0 },
        });
      }

      if (current.version !== input.expectedVersion) {
        return { kind: "version_conflict" as const, inventory: current };
      }

      const nextOnHand = current.onHand + input.delta;
      if (nextOnHand < 0 || nextOnHand < current.reserved) {
        return { kind: "insufficient_stock" as const, inventory: current };
      }

      const updatedCount = await transaction.inventoryItem.updateMany({
        where: { variantId: input.variantId, version: input.expectedVersion },
        data: { onHand: { increment: input.delta }, version: { increment: 1 } },
      });

      if (updatedCount.count !== 1) {
        const latest = await transaction.inventoryItem.findUniqueOrThrow({ where: { variantId: input.variantId } });
        return { kind: "version_conflict" as const, inventory: latest };
      }

      const adjustment = await transaction.inventoryAdjustment.create({
        data: {
          variantId: input.variantId,
          delta: input.delta,
          reason: input.reason,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          actorUserId: input.actorUserId,
        },
      });
      const inventory = await transaction.inventoryItem.findUniqueOrThrow({ where: { variantId: input.variantId } });
      return { kind: "updated" as const, inventory, adjustment };
    });
  }

  async listAdjustments(variantId: string, limit = 100): Promise<InventoryAdjustmentRecord[]> {
    return this.database.inventoryAdjustment.findMany({
      where: { variantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(200, Math.max(1, limit)),
    });
  }

  async writeAudit(input: {
    actorUserId: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await writeAuditEntry(this.database, {
      actorType: "USER",
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  }
}
