import type {
  AddCartItemBodyDto,
  CartResponseDto,
  CheckoutPreviewResponseDto,
  UpdateCartItemBodyDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

export function createCartApi(client: ContractRequestClient) {
  return {
    get(): Promise<CartResponseDto> {
      return client.request("/api/v1/cart");
    },

    addItem(body: AddCartItemBodyDto): Promise<CartResponseDto> {
      return client.request("/api/v1/cart/items", { method: "POST", body });
    },

    updateItem(cartItemId: string, body: UpdateCartItemBodyDto): Promise<CartResponseDto> {
      return client.request(`/api/v1/cart/items/${segment(cartItemId)}`, {
        method: "PATCH",
        body,
      });
    },

    removeItem(cartItemId: string): Promise<CartResponseDto> {
      return client.request(`/api/v1/cart/items/${segment(cartItemId)}`, {
        method: "DELETE",
      });
    },

    previewCheckout(): Promise<CheckoutPreviewResponseDto> {
      return client.request("/api/v1/checkout/preview");
    },
  };
}

export type CartApi = ReturnType<typeof createCartApi>;
