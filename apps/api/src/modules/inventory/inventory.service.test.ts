import { describe, expect, it, vi } from "vitest";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { CatalogCommerceBoundary, CommerceVariantContext } from "../catalog/catalog.public.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";
import type { InventoryRepository } from "./inventory.repository.js";
import { InventoryError, InventoryService } from "./inventory.service.js";

const principal: AccessPrincipal = {
  userId: "123e4567-e89b-12d3-a456-426614174000",
  sessionId: "123e4567-e89b-12d3-a456-426614174001",
  platformRole: "USER",
  mfaSatisfied: false,
};

const variant: CommerceVariantContext = {
  id: "123e4567-e89b-12d3-a456-426614174010",
  productId: "123e4567-e89b-12d3-a456-426614174011",
  storeId: "123e4567-e89b-12d3-a456-426614174012",
  sku: "SKU-1",
  priceAmountMinor: 100000n,
  currency: "NGN",
  status: "ACTIVE",
  productName: "Test product",
  productSlug: "test-product",
  productStatus: "ACTIVE",
  moderationStatus: "NOT_REQUIRED",
  storeName: "Test store",
  storeSlug: "test-store",
  storeStatus: "ACTIVE",
  vendorId: "123e4567-e89b-12d3-a456-426614174013",
  vendorDisplayName: "Test vendor",
  vendorStatus: "APPROVED",
  optionValues: [],
};

function dependencies(result: Awaited<ReturnType<InventoryRepository["adjustInventory"]>>) {
  const repository = {
    ensureInventory: vi.fn(async () => ({
      id: "123e4567-e89b-12d3-a456-426614174020",
      variantId: variant.id,
      onHand: 10,
      reserved: 2,
      version: 3,
      updatedAt: new Date("2026-09-05T10:00:00.000Z"),
    })),
    findInventory: vi.fn(),
    listInventory: vi.fn(async () => []),
    adjustInventory: vi.fn(async () => result),
    listAdjustments: vi.fn(async () => []),
    writeAudit: vi.fn(async () => undefined),
  } as unknown as InventoryRepository;

  const vendorBoundary = {
    requireStorePermission: vi.fn(async () => ({
      store: { id: variant.storeId, vendorId: variant.vendorId, status: "ACTIVE" as const },
      vendor: { id: variant.vendorId, status: "APPROVED" as const },
    })),
  } as VendorOwnershipBoundary;

  const catalogBoundary = {
    findVariantContext: vi.fn(async () => variant),
  } as unknown as CatalogCommerceBoundary;

  return { repository, vendorBoundary, catalogBoundary };
}

describe("InventoryService", () => {
  it("rejects a zero stock adjustment", async () => {
    const current = {
      id: "123e4567-e89b-12d3-a456-426614174020",
      variantId: variant.id,
      onHand: 10,
      reserved: 2,
      version: 3,
      updatedAt: new Date("2026-09-05T10:00:00.000Z"),
    };
    const deps = dependencies({ kind: "version_conflict", inventory: current });
    const service = new InventoryService(deps.repository, deps.vendorBoundary, deps.catalogBoundary);

    await expect(
      service.adjustInventory(principal, variant.id, {
        delta: 0,
        reason: "No-op",
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: "ZERO_ADJUSTMENT", statusCode: 400 });
  });

  it("turns an optimistic concurrency miss into a reload-required conflict", async () => {
    const current = {
      id: "123e4567-e89b-12d3-a456-426614174020",
      variantId: variant.id,
      onHand: 12,
      reserved: 2,
      version: 4,
      updatedAt: new Date("2026-09-05T10:00:01.000Z"),
    };
    const deps = dependencies({ kind: "version_conflict", inventory: current });
    const service = new InventoryService(deps.repository, deps.vendorBoundary, deps.catalogBoundary);

    await expect(
      service.adjustInventory(principal, variant.id, {
        delta: 2,
        reason: "Restock",
        expectedVersion: 3,
      }),
    ).rejects.toBeInstanceOf(InventoryError);
    await expect(
      service.adjustInventory(principal, variant.id, {
        delta: 2,
        reason: "Restock",
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({ code: "INVENTORY_VERSION_CONFLICT", statusCode: 409 });
  });
});
