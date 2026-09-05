import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  InitializePaymentBodySchema,
  InitializePaymentHeadersSchema,
  PaymentAttemptSchema,
} from "./payment.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("P7 payment contracts", () => {
  it("requires a meaningful payment idempotency key", () => {
    expect(Check(InitializePaymentHeadersSchema, { "idempotency-key": "payment-123" })).toBe(true);
    expect(Check(InitializePaymentHeadersSchema, { "idempotency-key": "short" })).toBe(false);
  });

  it("accepts only approved buyer-facing payment channels", () => {
    expect(Check(InitializePaymentBodySchema, { channel: "card" })).toBe(true);
    expect(Check(InitializePaymentBodySchema, { channel: "ussd" })).toBe(true);
    expect(Check(InitializePaymentBodySchema, { channel: "crypto" })).toBe(false);
  });

  it("keeps provider transaction IDs string-safe", () => {
    expect(
      Check(PaymentAttemptSchema, {
        id: UUID,
        provider: "PAYSTACK",
        providerReference: "CN-PS-reference",
        providerTransactionId: "4099260516",
        channel: "card",
        amount: { amountMinor: "5000000", currency: "NGN" },
        status: "SUCCEEDED",
        failureCategory: null,
        initializedAt: "2026-09-05T10:00:00.000Z",
        confirmedAt: "2026-09-05T10:01:00.000Z",
        updatedAt: "2026-09-05T10:01:00.000Z",
      }),
    ).toBe(true);
  });
});
