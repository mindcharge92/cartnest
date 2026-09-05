import type {
  LogisticsStationListResponseDto,
  ShippingQuoteRequestDto,
  ShippingQuoteResponseDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

export function createLogisticsApi(client: ContractRequestClient) {
  return {
    listStations(): Promise<LogisticsStationListResponseDto> {
      return client.request("/api/v1/logistics/stations");
    },

    quoteCart(body: ShippingQuoteRequestDto): Promise<ShippingQuoteResponseDto> {
      return client.request("/api/v1/logistics/quotes", { method: "POST", body });
    },
  };
}

export type LogisticsApi = ReturnType<typeof createLogisticsApi>;
