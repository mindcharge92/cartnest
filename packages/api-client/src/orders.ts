import type {
  CancelOrderBodyDto,
  CheckoutBodyDto,
  OrderDto,
  OrderListQueryDto,
  OrderListResponseDto,
  VendorOrderDto,
  VendorOrderListQueryDto,
  VendorOrderListResponseDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

function queryString(query: Readonly<Record<string, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function createOrdersApi(client: ContractRequestClient) {
  return {
    checkout(body: CheckoutBodyDto, idempotencyKey: string): Promise<OrderDto> {
      return client.request("/api/v1/checkout", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body,
      });
    },

    list(query: OrderListQueryDto = {}): Promise<OrderListResponseDto> {
      return client.request(
        `/api/v1/orders${queryString({ page: query.page, pageSize: query.pageSize, status: query.status })}`,
      );
    },

    get(orderId: string): Promise<OrderDto> {
      return client.request(`/api/v1/orders/${segment(orderId)}`);
    },

    cancel(orderId: string, body: CancelOrderBodyDto = {}): Promise<OrderDto> {
      return client.request(`/api/v1/orders/${segment(orderId)}/cancel`, {
        method: "POST",
        body,
      });
    },

    listStoreOrders(
      storeId: string,
      query: VendorOrderListQueryDto = {},
    ): Promise<VendorOrderListResponseDto> {
      return client.request(
        `/api/v1/stores/${segment(storeId)}/vendor-orders${queryString({ page: query.page, pageSize: query.pageSize, status: query.status })}`,
      );
    },

    getVendorOrder(vendorOrderId: string): Promise<VendorOrderDto> {
      return client.request(`/api/v1/vendor-orders/${segment(vendorOrderId)}`);
    },

    cancelVendorOrder(
      vendorOrderId: string,
      body: CancelOrderBodyDto = {},
    ): Promise<VendorOrderDto> {
      return client.request(`/api/v1/vendor-orders/${segment(vendorOrderId)}/cancel`, {
        method: "POST",
        body,
      });
    },
  };
}

export type OrdersApi = ReturnType<typeof createOrdersApi>;
