import { describe, expect, it } from "vitest";
import {
  clearPaymentInitializationKey,
  clearPaymentReturnContext,
  getOrCreatePaymentInitializationKey,
  readPaymentReturnContext,
  storePaymentReturnContext,
  type PaymentSessionStorage,
} from "./payment-session";

class MemoryStorage implements PaymentSessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("FP7 payment browser session", () => {
  it("reuses one initialization key for the same intent and payment method", () => {
    const storage = new MemoryStorage();
    const first = getOrCreatePaymentInitializationKey(storage, "intent-1", "card");
    const second = getOrCreatePaymentInitializationKey(storage, "intent-1", "card");

    expect(second).toBe(first);
  });

  it("keeps idempotency keys independent across payment methods", () => {
    const storage = new MemoryStorage();
    const card = getOrCreatePaymentInitializationKey(storage, "intent-1", "card");
    const transfer = getOrCreatePaymentInitializationKey(storage, "intent-1", "bank_transfer");

    expect(transfer).not.toBe(card);
  });

  it("creates a fresh key after a terminal payment clears the previous one", () => {
    const storage = new MemoryStorage();
    const first = getOrCreatePaymentInitializationKey(storage, "intent-1", "ussd");
    clearPaymentInitializationKey(storage, "intent-1", "ussd");
    const second = getOrCreatePaymentInitializationKey(storage, "intent-1", "ussd");

    expect(second).not.toBe(first);
  });

  it("round-trips the callback context including the original channel", () => {
    const storage = new MemoryStorage();
    storePaymentReturnContext(storage, "intent-1", "order-1", "bank");

    expect(readPaymentReturnContext(storage)).toMatchObject({
      paymentIntentId: "intent-1",
      orderId: "order-1",
      channel: "bank",
    });

    clearPaymentReturnContext(storage);
    expect(readPaymentReturnContext(storage)).toBeNull();
  });

  it("accepts legacy callback context without a stored channel", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "cartnest.payment.return-context",
      JSON.stringify({ paymentIntentId: "intent-1", orderId: "order-1", storedAt: new Date().toISOString() }),
    );

    expect(readPaymentReturnContext(storage)?.channel).toBeNull();
  });

  it("does not trust an unknown stored payment-channel value", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "cartnest.payment.return-context",
      JSON.stringify({
        paymentIntentId: "intent-1",
        orderId: "order-1",
        channel: "provider_override",
        storedAt: new Date().toISOString(),
      }),
    );

    expect(readPaymentReturnContext(storage)?.channel).toBeNull();
  });
});
