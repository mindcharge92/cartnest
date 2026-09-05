import { createHash } from "node:crypto";
import type { PaymentChannelDto, PaymentProviderDto } from "@repo/contracts";

export interface ProviderSplitInstruction {
  readonly externalSubaccountId: string;
  readonly share: number;
}

export interface ProviderInitializeInput {
  readonly reference: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly customer: {
    readonly email: string;
    readonly phone?: string;
    readonly name?: string;
  };
  readonly callbackUrl: string;
  readonly channel?: PaymentChannelDto;
  readonly metadata: Readonly<Record<string, string>>;
  readonly splits?: readonly ProviderSplitInstruction[];
}

export type ProviderInitializeResult =
  | { readonly kind: "initialized"; readonly providerReference: string; readonly providerTransactionId?: string; readonly authorizationUrl: string; readonly accessCode?: string; readonly channel?: string }
  | { readonly kind: "definite_failure"; readonly code: string; readonly message: string }
  | { readonly kind: "ambiguous"; readonly code: string; readonly message: string };

export type ProviderVerificationStatus = "SUCCEEDED" | "FAILED" | "PROCESSING" | "UNKNOWN";

export interface ProviderVerificationResult {
  readonly status: ProviderVerificationStatus;
  readonly providerReference: string;
  readonly providerTransactionId?: string;
  readonly amountMinor?: bigint;
  readonly currency?: string;
  readonly feeAmountMinor?: bigint;
  readonly channel?: string;
  readonly rawStatus?: string;
}

export interface ProviderRefundInput {
  readonly providerTransactionId: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly reason: string;
  readonly callbackUrl?: string;
}

export type ProviderRefundResult =
  | { readonly kind: "submitted"; readonly providerRefundReference: string; readonly status: "PROCESSING" | "SUCCEEDED"; readonly rawStatus?: string }
  | { readonly kind: "definite_failure"; readonly code: string; readonly message: string }
  | { readonly kind: "ambiguous"; readonly code: string; readonly message: string };

export interface ProviderRefundVerificationResult {
  readonly providerRefundReference: string;
  readonly status: "PROCESSING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
  readonly amountMinor?: bigint;
  readonly currency?: string;
  readonly rawStatus?: string;
}

export interface NormalizedWebhookEvent {
  readonly externalEventId?: string;
  readonly fingerprint: string;
  readonly eventType: string;
  readonly providerReference?: string;
  readonly providerTransactionId?: string;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProviderDto;
  initialize(input: ProviderInitializeInput): Promise<ProviderInitializeResult>;
  verify(providerReference: string): Promise<ProviderVerificationResult>;
  refund(input: ProviderRefundInput): Promise<ProviderRefundResult>;
  verifyRefund(providerRefundReference: string): Promise<ProviderRefundVerificationResult>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  normalizeWebhook(rawBody: Buffer): NormalizedWebhookEvent;
}

export function webhookFingerprint(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function minorToMajorDecimal(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const absolute = negative ? -amountMinor : amountMinor;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function majorToMinor(value: unknown): bigint | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -result : result;
}

export async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
