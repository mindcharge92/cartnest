import type {
  AdjustInventoryBodyDto,
  InventoryAdjustmentListResponseDto,
  InventoryItemDto,
  InventoryListResponseDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

export function createInventoryApi(client: ContractRequestClient) {
  return {
    listStoreInventory(storeId: string): Promise<InventoryListResponseDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/inventory`);
    },

    getVariantInventory(variantId: string): Promise<InventoryItemDto> {
      return client.request(`/api/v1/inventory/${segment(variantId)}`);
    },

    adjustInventory(variantId: string, body: AdjustInventoryBodyDto): Promise<InventoryItemDto> {
      return client.request(`/api/v1/inventory/${segment(variantId)}/adjust`, {
        method: "POST",
        body,
      });
    },

    listAdjustments(variantId: string): Promise<InventoryAdjustmentListResponseDto> {
      return client.request(`/api/v1/inventory/${segment(variantId)}/adjustments`);
    },
  };
}

export type InventoryApi = ReturnType<typeof createInventoryApi>;
