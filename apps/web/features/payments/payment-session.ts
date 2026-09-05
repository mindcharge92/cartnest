import type { PaymentChannelDto } from "@repo/contracts";

export interface PaymentReturnContext {
  readonly paymentIntentId: string;
  readonly orderId: string;
  readonly storedAt: string;
}

export interface PaymentSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const RETURN_CONTEXT_KEY = "cartnest.payment.return-context";

function initializationKeyName(paymentIntentId: string, channel?: PaymentChannelDto): string {
  return `cartnest.payment.initialize:${paymentIntentId}:${channel ?? "auto"}`;
}

export function getOrCreatePaymentInitializationKey(
  storage: PaymentSessionStorage,
  paymentIntentId: string,
  channel?: PaymentChannelDto,
): string {
  const key = initializationKeyName(paymentIntentId, channel);
  const existing = storage.getItem(key);
  if (existing && existing.length >= 8) return existing;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

export function clearPaymentInitializationKey(
  storage: PaymentSessionStorage,
  paymentIntentId: string,
  channel?: PaymentChannelDto,
): void {
  storage.removeItem(initializationKeyName(paymentIntentId, channel));
}

export function storePaymentReturnContext(
  storage: PaymentSessionStorage,
  paymentIntentId: string,
  orderId: string,
): void {
  const context: PaymentReturnContext = {
    paymentIntentId,
    orderId,
    storedAt: new Date().toISOString(),
  };
  storage.setItem(RETURN_CONTEXT_KEY, JSON.stringify(context));
}

export function readPaymentReturnContext(storage: PaymentSessionStorage): PaymentReturnContext | null {
  const raw = storage.getItem(RETURN_CONTEXT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PaymentReturnContext>;
    if (
      typeof parsed.paymentIntentId !== "string" ||
      typeof parsed.orderId !== "string" ||
      typeof parsed.storedAt !== "string"
    ) {
      return null;
    }
    return {
      paymentIntentId: parsed.paymentIntentId,
      orderId: parsed.orderId,
      storedAt: parsed.storedAt,
    };
  } catch {
    return null;
  }
}

export function clearPaymentReturnContext(storage: PaymentSessionStorage): void {
  storage.removeItem(RETURN_CONTEXT_KEY);
}
