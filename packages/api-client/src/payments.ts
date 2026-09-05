import type {
  InitializePaymentBodyDto,
  PaymentInitializationResponseDto,
  PaymentIntentDetailDto,
} from "@repo/contracts";
import type { ContractRequestClient } from "./contract-client.js";

const segment = (value: string) => encodeURIComponent(value);

export function createPaymentsApi(client: ContractRequestClient) {
  return {
    initialize(
      paymentIntentId: string,
      body: InitializePaymentBodyDto,
      idempotencyKey: string,
    ): Promise<PaymentInitializationResponseDto> {
      return client.request(`/api/v1/payment-intents/${segment(paymentIntentId)}/initialize`, {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body,
      });
    },

    get(paymentIntentId: string): Promise<PaymentIntentDetailDto> {
      return client.request(`/api/v1/payment-intents/${segment(paymentIntentId)}`);
    },

    reconcile(paymentIntentId: string): Promise<PaymentIntentDetailDto> {
      return client.request(`/api/v1/payment-intents/${segment(paymentIntentId)}/reconcile`, {
        method: "POST",
      });
    },
  };
}

export type PaymentsApi = ReturnType<typeof createPaymentsApi>;
