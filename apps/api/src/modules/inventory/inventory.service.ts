import type {
  AdjustInventoryBodyDto,
  InventoryAdjustmentDto,
  InventoryItemDto,
} from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { CatalogCommerceBoundary, CommerceVariantContext } from "../catalog/catalog.public.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";
import type {
  InventoryAdjustmentRecord,
  InventoryRecord,
  InventoryRepository,
} from "./inventory.repository.js";

export class InventoryError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toInventory(context: CommerceVariantContext, inventory: InventoryRecord): InventoryItemDto {
  return {
    variantId: context.id,
    productId: context.productId,
    storeId: context.storeId,
    productName: context.productName,
    sku: context.sku,
    optionValues: context.optionValues.map((selection) => ({ ...selection })),
    onHand: inventory.onHand,
    reserved: inventory.reserved,
    available: Math.max(0, inventory.onHand - inventory.reserved),
    version: inventory.version,
    updatedAt: inventory.updatedAt.toISOString(),
  };
}

function toAdjustment(record: InventoryAdjustmentRecord): InventoryAdjustmentDto {
  return {
    id: record.id,
    variantId: record.variantId,
    delta: record.delta,
    reason: record.reason,
    referenceType: record.referenceType,
    referenceId: record.referenceId,
    actorUserId: record.actorUserId,
    createdAt: record.createdAt.toISOString(),
  };
}

export interface InventoryAvailability {
  readonly variantId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly version: number;
}

export class InventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly vendorBoundary: VendorOwnershipBoundary,
    private readonly catalogBoundary: CatalogCommerceBoundary,
  ) {}

  async getAvailability(variantId: string): Promise<InventoryAvailability> {
    const inventory = await this.repository.ensureInventory(variantId);
    return {
      variantId,
      onHand: inventory.onHand,
      reserved: inventory.reserved,
      available: Math.max(0, inventory.onHand - inventory.reserved),
      version: inventory.version,
    };
  }

  async listStoreInventory(principal: AccessPrincipal, storeId: string): Promise<InventoryItemDto[]> {
    await this.vendorBoundary.requireStorePermission(principal, storeId, "inventory:read");
    const variants = await this.catalogBoundary.listStoreVariantContexts(storeId);
    const existing = await this.repository.listInventory(variants.map((variant) => variant.id));
    const inventoryByVariant = new Map(existing.map((item) => [item.variantId, item]));
    const result: InventoryItemDto[] = [];
    for (const variant of variants) {
      const inventory = inventoryByVariant.get(variant.id) ?? (await this.repository.ensureInventory(variant.id));
      result.push(toInventory(variant, inventory));
    }
    return result;
  }

  async getVariantInventory(principal: AccessPrincipal, variantId: string): Promise<InventoryItemDto> {
    const context = await this.catalogBoundary.findVariantContext(variantId);
    if (!context) throw new InventoryError("VARIANT_NOT_FOUND", "Variant was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "inventory:read");
    return toInventory(context, await this.repository.ensureInventory(variantId));
  }

  async adjustInventory(
    principal: AccessPrincipal,
    variantId: string,
    input: AdjustInventoryBodyDto,
    requestId?: string,
  ): Promise<InventoryItemDto> {
    if (input.delta === 0) {
      throw new InventoryError("ZERO_ADJUSTMENT", "Inventory adjustment delta cannot be zero.", 400);
    }
    const context = await this.catalogBoundary.findVariantContext(variantId);
    if (!context) throw new InventoryError("VARIANT_NOT_FOUND", "Variant was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "inventory:adjust");

    const result = await this.repository.adjustInventory({
      variantId,
      delta: input.delta,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      actorUserId: principal.userId,
    });

    if (result.kind === "version_conflict") {
      throw new InventoryError(
        "INVENTORY_VERSION_CONFLICT",
        "Inventory changed since it was loaded. Reload the current quantity and retry.",
        409,
      );
    }
    if (result.kind === "insufficient_stock") {
      throw new InventoryError(
        "INVENTORY_BELOW_RESERVED",
        "This adjustment would reduce stock below the quantity already reserved.",
        409,
      );
    }

    await this.repository.writeAudit({
      actorUserId: principal.userId,
      action: "inventory.adjusted",
      entityType: "ProductVariant",
      entityId: variantId,
      ...(requestId ? { requestId } : {}),
      metadata: {
        storeId: context.storeId,
        productId: context.productId,
        delta: input.delta,
        reason: input.reason,
        version: result.inventory.version,
      },
    });
    return toInventory(context, result.inventory);
  }

  async listAdjustments(
    principal: AccessPrincipal,
    variantId: string,
  ): Promise<InventoryAdjustmentDto[]> {
    const context = await this.catalogBoundary.findVariantContext(variantId);
    if (!context) throw new InventoryError("VARIANT_NOT_FOUND", "Variant was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "inventory:read");
    return (await this.repository.listAdjustments(variantId)).map(toAdjustment);
  }
}
