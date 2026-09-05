import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  ProviderInitializeInput,
  ProviderInitializeResult,
  ProviderVerificationResult,
} from "./payment.provider.js";
import { parseJsonResponse, webhookFingerprint } from "./payment.provider.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}

function safeSignatureEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PaystackAdapter implements PaymentProviderAdapter {
  readonly provider = "PAYSTACK" as const;

  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = "https://api.paystack.co/",
  ) {}

  async initialize(input: ProviderInitializeInput): Promise<ProviderInitializeResult> {
    const payload: Record<string, unknown> = {
      email: input.customer.email,
      amount: input.amountMinor.toString(),
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: JSON.stringify(input.metadata),
    };
    if (input.channel) payload.channels = [input.channel];

    try {
      const response = await fetch(new URL("transaction/initialize", this.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      const body = asRecord(await parseJsonResponse(response));
      const data = asRecord(body?.data);

      if (!response.ok || body?.status !== true || !data) {
        const message = text(body?.message) ?? `Paystack initialization returned HTTP ${response.status}.`;
        return response.status >= 400 && response.status < 500
          ? { kind: "definite_failure", code: "PAYSTACK_REJECTED", message }
          : { kind: "ambiguous", code: "PAYSTACK_UNAVAILABLE", message };
      }

      const authorizationUrl = text(data.authorization_url);
      const reference = text(data.reference);
      if (!authorizationUrl || !reference) {
        return {
          kind: "ambiguous",
          code: "PAYSTACK_INVALID_RESPONSE",
          message: "Paystack accepted initialization but returned an incomplete response.",
        };
      }

      return {
        kind: "initialized",
        providerReference: reference,
        authorizationUrl,
        ...(text(data.access_code) ? { accessCode: text(data.access_code)! } : {}),
        ...(input.channel ? { channel: input.channel } : {}),
      };
    } catch (error) {
      return {
        kind: "ambiguous",
        code: "PAYSTACK_NETWORK_UNKNOWN",
        message: error instanceof Error ? error.message : "Paystack request outcome is unknown.",
      };
    }
  }

  async verify(providerReference: string): Promise<ProviderVerificationResult> {
    try {
      const response = await fetch(
        new URL(`transaction/verify/${encodeURIComponent(providerReference)}`, this.baseUrl),
        {
          headers: { Authorization: `Bearer ${this.secretKey}` },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const body = asRecord(await parseJsonResponse(response));
      const data = asRecord(body?.data);
      if (!response.ok || body?.status !== true || !data) {
        return {
          status: response.status >= 400 && response.status < 500 ? "FAILED" : "UNKNOWN",
          providerReference,
        };
      }

      const rawStatus = text(data.status);
      const status =
        rawStatus === "success"
          ? "SUCCEEDED"
          : rawStatus === "failed" || rawStatus === "abandoned"
            ? "FAILED"
            : rawStatus === "pending" || rawStatus === "ongoing" || rawStatus === "processing"
              ? "PROCESSING"
              : "UNKNOWN";

      return {
        status,
        providerReference: text(data.reference) ?? providerReference,
        ...(data.id !== undefined ? { providerTransactionId: String(data.id) } : {}),
        ...(integer(data.amount) !== undefined ? { amountMinor: integer(data.amount)! } : {}),
        ...(text(data.currency) ? { currency: text(data.currency)! } : {}),
        ...(integer(data.fees) !== undefined ? { feeAmountMinor: integer(data.fees)! } : {}),
        ...(text(data.channel) ? { channel: text(data.channel)! } : {}),
        ...(rawStatus ? { rawStatus } : {}),
      };
    } catch {
      return { status: "UNKNOWN", providerReference };
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
    return safeSignatureEqual(expected, signature);
  }

  normalizeWebhook(rawBody: Buffer): NormalizedWebhookEvent {
    const payload = asRecord(JSON.parse(rawBody.toString("utf8")) as unknown);
    const data = asRecord(payload?.data);
    const eventType = text(payload?.event) ?? "unknown";
    return {
      fingerprint: webhookFingerprint(rawBody),
      eventType,
      ...(text(payload?.id) ? { externalEventId: text(payload?.id)! } : {}),
      ...(text(data?.reference) ? { providerReference: text(data?.reference)! } : {}),
      ...(data?.id !== undefined ? { providerTransactionId: String(data.id) } : {}),
    };
  }
}
