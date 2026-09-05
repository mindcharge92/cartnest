import type { InventoryService } from "./inventory.service.js";

export interface InventoryAvailabilitySnapshot {
  readonly variantId: string;
  readonly onHand: number;
  readonly reserved: number;
  readonly available: number;
  readonly version: number;
}

export interface InventoryAvailabilityBoundary {
  getAvailability(variantId: string): Promise<InventoryAvailabilitySnapshot>;
}

export function asInventoryAvailabilityBoundary(
  service: InventoryService,
): InventoryAvailabilityBoundary {
  return service;
}
