import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  ProviderInitializeInput,
  ProviderInitializeResult,
  ProviderVerificationResult,
} from "./payment.provider.js";
import {
  majorToMinor,
  minorToMajorDecimal,
  parseJsonResponse,
  webhookFingerprint,
} from "./payment.provider.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeSignatureEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function flutterwavePaymentOption(channel: ProviderInitializeInput["channel"]): string | undefined {
  switch (channel) {
    case "card":
      return "card";
    case "ussd":
      return "ussd";
    case "bank_transfer":
      return "banktransfer";
    case "bank":
      return "account";
    default:
      return undefined;
  }
}

export class FlutterwaveAdapter implements PaymentProviderAdapter {
  readonly provider = "FLUTTERWAVE" as const;

  constructor(
    private readonly secretKey: string,
    private readonly secretHash: string,
    private readonly baseUrl = "https://api.flutterwave.com/v3/",
  ) {}

  async initialize(input: ProviderInitializeInput): Promise<ProviderInitializeResult> {
    const payload: Record<string, unknown> = {
      tx_ref: input.reference,
      amount: minorToMajorDecimal(input.amountMinor),
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: {
        email: input.customer.email,
        ...(input.customer.phone ? { phone_number: input.customer.phone } : {}),
        ...(input.customer.name ? { name: input.customer.name } : {}),
      },
      customizations: { title: "CartNest Payment" },
      meta: input.metadata,
    };
    const paymentOption = flutterwavePaymentOption(input.channel);
    if (paymentOption) payload.payment_options = paymentOption;
    if (input.splits?.length) {
      payload.subaccounts = input.splits.map((split) => ({
        id: split.externalSubaccountId,
        transaction_split_ratio: split.share,
      }));
    }

    try {
      const response = await fetch(new URL("payments", this.baseUrl), {
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

      if (!response.ok || body?.status !== "success" || !data) {
        const message = text(body?.message) ?? `Flutterwave initialization returned HTTP ${response.status}.`;
        return response.status >= 400 && response.status < 500
          ? { kind: "definite_failure", code: "FLUTTERWAVE_REJECTED", message }
          : { kind: "ambiguous", code: "FLUTTERWAVE_UNAVAILABLE", message };
      }

      const authorizationUrl = text(data.link);
      if (!authorizationUrl) {
        return {
          kind: "ambiguous",
          code: "FLUTTERWAVE_INVALID_RESPONSE",
          message: "Flutterwave accepted initialization but did not return a hosted payment link.",
        };
      }

      return {
        kind: "initialized",
        providerReference: input.reference,
        authorizationUrl,
        ...(input.channel ? { channel: input.channel } : {}),
      };
    } catch (error) {
      return {
        kind: "ambiguous",
        code: "FLUTTERWAVE_NETWORK_UNKNOWN",
        message: error instanceof Error ? error.message : "Flutterwave request outcome is unknown.",
      };
    }
  }

  async verify(providerReference: string): Promise<ProviderVerificationResult> {
    try {
      const url = new URL("transactions/verify_by_reference", this.baseUrl);
      url.searchParams.set("tx_ref", providerReference);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      const body = asRecord(await parseJsonResponse(response));
      const data = asRecord(body?.data);
      if (!response.ok || body?.status !== "success" || !data) {
        return {
          status: response.status >= 400 && response.status < 500 ? "FAILED" : "UNKNOWN",
          providerReference,
        };
      }

      const rawStatus = text(data.status);
      const status =
        rawStatus === "successful"
          ? "SUCCEEDED"
          : rawStatus === "failed" || rawStatus === "cancelled"
            ? "FAILED"
            : rawStatus === "pending"
              ? "PROCESSING"
              : "UNKNOWN";

      return {
        status,
        providerReference: text(data.tx_ref) ?? providerReference,
        ...(data.id !== undefined ? { providerTransactionId: String(data.id) } : {}),
        ...(majorToMinor(data.amount) !== undefined ? { amountMinor: majorToMinor(data.amount)! } : {}),
        ...(text(data.currency) ? { currency: text(data.currency)! } : {}),
        ...(majorToMinor(data.app_fee) !== undefined
          ? { feeAmountMinor: majorToMinor(data.app_fee)! }
          : {}),
        ...(text(data.payment_type) ? { channel: text(data.payment_type)! } : {}),
        ...(rawStatus ? { rawStatus } : {}),
      };
    } catch {
      return { status: "UNKNOWN", providerReference };
    }
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac("sha256", this.secretHash).update(rawBody).digest("base64");
    return safeSignatureEqual(expected, signature);
  }

  normalizeWebhook(rawBody: Buffer): NormalizedWebhookEvent {
    const payload = asRecord(JSON.parse(rawBody.toString("utf8")) as unknown);
    const data = asRecord(payload?.data);
    const eventType = text(payload?.type) ?? text(payload?.event) ?? "unknown";
    return {
      fingerprint: webhookFingerprint(rawBody),
      eventType,
      ...(text(payload?.webhook_id) ? { externalEventId: text(payload?.webhook_id)! } : {}),
      ...(text(data?.tx_ref) ? { providerReference: text(data?.tx_ref)! } : {}),
      ...(data?.id !== undefined ? { providerTransactionId: String(data.id) } : {}),
    };
  }
}
