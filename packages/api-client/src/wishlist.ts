import type {
  AddWishlistItemBodyDto,
  WishlistResponseDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

export function createWishlistApi(client: ContractRequestClient) {
  return {
    get(): Promise<WishlistResponseDto> {
      return client.request("/api/v1/wishlist");
    },

    addItem(body: AddWishlistItemBodyDto): Promise<WishlistResponseDto> {
      return client.request("/api/v1/wishlist/items", { method: "POST", body });
    },

    removeItem(wishlistItemId: string): Promise<WishlistResponseDto> {
      return client.request(`/api/v1/wishlist/items/${segment(wishlistItemId)}`, {
        method: "DELETE",
      });
    },
  };
}

export type WishlistApi = ReturnType<typeof createWishlistApi>;
