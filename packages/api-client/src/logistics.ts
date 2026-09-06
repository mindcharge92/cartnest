import type {
  CreateShipmentBodyDto,
  FulfillmentProfileBodyDto,
  FulfillmentProfileDto,
  LogisticsStationListResponseDto,
  ShipmentDto,
  ShipmentListResponseDto,
  ShippingQuoteRequestDto,
  ShippingQuoteResponseDto,
  UpdateShipmentStatusBodyDto,
  VariantShippingProfileBodyDto,
  VariantShippingProfileDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function createLogisticsApi(client: ContractRequestClient) {
  return {
    getStoreFulfillmentProfile(storeId: string): Promise<FulfillmentProfileDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/fulfillment-profile`);
    },

    updateStoreFulfillmentProfile(
      storeId: string,
      body: FulfillmentProfileBodyDto,
    ): Promise<FulfillmentProfileDto> {
      return client.request(`/api/v1/stores/${segment(storeId)}/fulfillment-profile`, {
        method: "PUT",
        body,
      });
    },

    getVariantShippingProfile(variantId: string): Promise<VariantShippingProfileDto> {
      return client.request(`/api/v1/variants/${segment(variantId)}/shipping-profile`);
    },

    updateVariantShippingProfile(
      variantId: string,
      body: VariantShippingProfileBodyDto,
    ): Promise<VariantShippingProfileDto> {
      return client.request(`/api/v1/variants/${segment(variantId)}/shipping-profile`, {
        method: "PUT",
        body,
      });
    },

    listStations(): Promise<LogisticsStationListResponseDto> {
      return client.request("/api/v1/logistics/stations");
    },

    quoteCart(body: ShippingQuoteRequestDto): Promise<ShippingQuoteResponseDto> {
      return client.request("/api/v1/logistics/quotes", { method: "POST", body });
    },

    createShipment(vendorOrderId: string, body: CreateShipmentBodyDto): Promise<ShipmentDto> {
      return client.request(`/api/v1/vendor-orders/${segment(vendorOrderId)}/shipments`, {
        method: "POST",
        body,
      });
    },

    listVendorOrderShipments(vendorOrderId: string): Promise<ShipmentListResponseDto> {
      return client.request(`/api/v1/vendor-orders/${segment(vendorOrderId)}/shipments`);
    },

    listBuyerOrderShipments(orderId: string): Promise<ShipmentListResponseDto> {
      return client.request(`/api/v1/orders/${segment(orderId)}/shipments`);
    },

    getShipment(shipmentId: string): Promise<ShipmentDto> {
      return client.request(`/api/v1/shipments/${segment(shipmentId)}`);
    },

    updateManualShipmentStatus(
      shipmentId: string,
      body: UpdateShipmentStatusBodyDto,
    ): Promise<ShipmentDto> {
      return client.request(`/api/v1/shipments/${segment(shipmentId)}/status`, {
        method: "POST",
        body,
      });
    },
  };
}

export type LogisticsApi = ReturnType<typeof createLogisticsApi>;
