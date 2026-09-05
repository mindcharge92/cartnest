import { describe, expect, it, vi } from "vitest";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { PaymentRepository } from "./payment.repository.js";
import type { PaymentProviderAdapter } from "./payment.provider.js";
import { PaymentService } from "./payment.service.js";

const USER_ID = "123e4567-e89b-12d3-a456-426614174000";
const INTENT_ID = "223e4567-e89b-12d3-a456-426614174000";
const ORDER_ID = "323e4567-e89b-12d3-a456-426614174000";
const ATTEMPT_ID = "423e4567-e89b-12d3-a456-426614174000";
const FALLBACK_ATTEMPT_ID = "523e4567-e89b-12d3-a456-426614174000";

const principal: AccessPrincipal = {
  userId: USER_ID,
  sessionId: "623e4567-e89b-12d3-a456-426614174000",
  platformRole: "USER",
  mfaSatisfied: false,
};

function intent() {
  const now = new Date("2026-09-05T10:00:00.000Z");
  return {
    id: INTENT_ID,
    orderId: ORDER_ID,
    amountMinor: 500000n,
    currency: "NGN",
    status: "PENDING" as const,
    createdAt: now,
    updatedAt: now,
    order: {
      id: ORDER_ID,
      userId: USER_ID,
      paymentStatus: "PENDING" as const,
      user: { id: USER_ID, email: "buyer@example.com", phone: "+2348000000000" },
      vendorOrders: [],
    },
    attempts: [],
    allocations: [],
  } as never;
}

function attempt(id: string, provider: "PAYSTACK" | "FLUTTERWAVE") {
  const now = new Date("2026-09-05T10:00:00.000Z");
  return {
    id,
    paymentIntentId: INTENT_ID,
    provider,
    providerReference: `CN-${provider}-${id}`,
    providerTxnId: null,
    channel: "card",
    amountMinor: 500000n,
    currency: "NGN",
    status: "PENDING" as const,
    failureCategory: null,
    initializedAt: now,
    confirmedAt: null,
    updatedAt: now,
  } as never;
}

function repository(overrides: Partial<PaymentRepository> = {}): PaymentRepository {
  const base: Partial<PaymentRepository> = {
    findOwnedIntent: vi.fn().mockResolvedValue(intent()),
    beginInitialization: vi.fn().mockResolvedValue({
      kind: "created",
      intent: intent(),
      attempt: attempt(ATTEMPT_ID, "PAYSTACK"),
      idempotencyId: "idem-1",
    }),
    createFallbackAttempt: vi.fn().mockResolvedValue(attempt(FALLBACK_ATTEMPT_ID, "FLUTTERWAVE")),
    completeInitialization: vi.fn().mockResolvedValue(undefined),
    markInitializationFailed: vi.fn().mockResolvedValue(undefined),
    markInitializationAmbiguous: vi.fn().mockResolvedValue(undefined),
  };
  return { ...base, ...overrides } as PaymentRepository;
}

function adapter(
  provider: "PAYSTACK" | "FLUTTERWAVE",
  initialize: PaymentProviderAdapter["initialize"],
): PaymentProviderAdapter {
  return {
    provider,
    initialize,
    verify: vi.fn(),
    verifyWebhook: vi.fn(),
    normalizeWebhook: vi.fn(),
  } as PaymentProviderAdapter;
}

describe("P7 safe provider routing", () => {
  it("falls back to Flutterwave only after a definite Paystack non-charge failure", async () => {
    const repo = repository();
    const paystackInitialize = vi.fn().mockResolvedValue({
      kind: "definite_failure",
      code: "PAYSTACK_REJECTED",
      message: "Rejected before charge",
    });
    const flutterwaveInitialize = vi.fn().mockResolvedValue({
      kind: "initialized",
      providerReference: "CN-FW-safe-fallback",
      authorizationUrl: "https://checkout.flutterwave.com/example",
      channel: "card",
    });
    const service = new PaymentService(
      repo,
      [adapter("PAYSTACK", paystackInitialize), adapter("FLUTTERWAVE", flutterwaveInitialize)],
      "https://cartnest.example/payment/callback",
    );

    const response = await service.initialize(principal, INTENT_ID, { channel: "card" }, "payment-key-123");

    expect(paystackInitialize).toHaveBeenCalledTimes(1);
    expect(flutterwaveInitialize).toHaveBeenCalledTimes(1);
    expect(repo.createFallbackAttempt).toHaveBeenCalledTimes(1);
    expect(response.attempt.provider).toBe("FLUTTERWAVE");
  });

  it("blocks fallback when the Paystack initialization outcome is ambiguous", async () => {
    const repo = repository();
    const paystackInitialize = vi.fn().mockResolvedValue({
      kind: "ambiguous",
      code: "PAYSTACK_NETWORK_UNKNOWN",
      message: "Timeout after request dispatch",
    });
    const flutterwaveInitialize = vi.fn().mockResolvedValue({
      kind: "initialized",
      providerReference: "should-not-run",
      authorizationUrl: "https://checkout.flutterwave.com/should-not-run",
    });
    const service = new PaymentService(
      repo,
      [adapter("PAYSTACK", paystackInitialize), adapter("FLUTTERWAVE", flutterwaveInitialize)],
      "https://cartnest.example/payment/callback",
    );

    await expect(
      service.initialize(principal, INTENT_ID, { channel: "card" }, "payment-key-456"),
    ).rejects.toMatchObject({ code: "PAYMENT_OUTCOME_UNKNOWN" });

    expect(flutterwaveInitialize).not.toHaveBeenCalled();
    expect(repo.markInitializationAmbiguous).toHaveBeenCalledTimes(1);
  });
});
