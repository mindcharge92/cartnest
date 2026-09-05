import { createHash, randomUUID } from "node:crypto";
import type {
  InitializePaymentBodyDto,
  PaymentAttemptDto,
  PaymentInitializationResponseDto,
  PaymentIntentDetailDto,
  PaymentProviderDto,
} from "@repo/contracts";
import type { Prisma } from "@repo/database";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type {
  BeginInitializationResult,
  PaymentAttemptContext,
  PaymentIntentRecord,
  PaymentRepository,
} from "./payment.repository.js";
import type {
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  ProviderInitializeResult,
  ProviderVerificationResult,
} from "./payment.provider.js";

export class PaymentError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function money(amountMinor: bigint, currency: string) {
  return { amountMinor: amountMinor.toString(), currency };
}

function mapAttempt(record: {
  id: string;
  provider: PaymentProviderDto;
  providerReference: string | null;
  providerTxnId: string | null;
  channel: string | null;
  amountMinor: bigint;
  currency: string;
  status: PaymentAttemptDto["status"];
  failureCategory: string | null;
  initializedAt: Date;
  confirmedAt: Date | null;
  updatedAt: Date;
}): PaymentAttemptDto {
  return {
    id: record.id,
    provider: record.provider,
    providerReference: record.providerReference,
    providerTransactionId: record.providerTxnId,
    channel: record.channel,
    amount: money(record.amountMinor, record.currency),
    status: record.status,
    failureCategory: record.failureCategory,
    initializedAt: record.initializedAt.toISOString(),
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapIntent(record: PaymentIntentRecord): PaymentIntentDetailDto {
  return {
    id: record.id,
    orderId: record.orderId,
    amount: money(record.amountMinor, record.currency),
    status: record.status,
    attempts: record.attempts.map(mapAttempt),
    allocations: record.allocations.map((allocation) => ({
      id: allocation.id,
      vendorOrderId: allocation.vendorOrderId,
      type: allocation.type,
      amount: money(allocation.amountMinor, allocation.currency),
      createdAt: allocation.createdAt.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function initializationFingerprint(paymentIntentId: string, body: InitializePaymentBodyDto): string {
  return createHash("sha256")
    .update(JSON.stringify({ paymentIntentId, channel: body.channel ?? null }))
    .digest("hex");
}

function paymentReference(provider: PaymentProviderDto): string {
  const prefix = provider === "PAYSTACK" ? "PS" : "FW";
  return `CN-${prefix}-${randomUUID().replaceAll("-", "")}`;
}

function asStoredInitialization(value: Prisma.JsonValue): PaymentInitializationResponseDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as unknown as PaymentInitializationResponseDto;
  return candidate.paymentIntent && candidate.attempt && typeof candidate.authorizationUrl === "string"
    ? candidate
    : null;
}

function providerPayload(rawBody: Buffer): Prisma.InputJsonValue {
  try {
    return JSON.parse(rawBody.toString("utf8")) as Prisma.InputJsonValue;
  } catch {
    return { malformed: true };
  }
}

function repositorySignal(error: unknown, signal: string): boolean {
  return error instanceof Error && error.message.includes(signal);
}

export class PaymentService {
  private readonly adapters: ReadonlyMap<PaymentProviderDto, PaymentProviderAdapter>;

  constructor(
    private readonly repository: PaymentRepository,
    adapters: readonly PaymentProviderAdapter[],
    private readonly callbackUrl: string,
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  }

  private adapter(provider: PaymentProviderDto): PaymentProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  private firstProvider(): PaymentProviderDto {
    if (this.adapter("PAYSTACK")) return "PAYSTACK";
    if (this.adapter("FLUTTERWAVE")) return "FLUTTERWAVE";
    throw new PaymentError("PAYMENT_PROVIDERS_UNAVAILABLE", "No payment provider is configured.", 503);
  }

  private customer(intent: PaymentIntentRecord) {
    const email = intent.order.user.email;
    if (!email) {
      throw new PaymentError(
        "PAYMENT_EMAIL_REQUIRED",
        "An email address is required before a hosted payment can be initialized.",
        409,
      );
    }
    return {
      email,
      ...(intent.order.user.phone ? { phone: intent.order.user.phone } : {}),
    };
  }

  private initializationResponse(
    begin: Extract<BeginInitializationResult, { kind: "created" }>,
    attempt: PaymentAttemptDto,
    initialized: Extract<ProviderInitializeResult, { kind: "initialized" }>,
    replayed: boolean,
  ): PaymentInitializationResponseDto {
    const intent = begin.intent;
    const attempts = [...intent.attempts.map(mapAttempt).filter((item) => item.id !== attempt.id), attempt];
    return {
      paymentIntent: {
        id: intent.id,
        orderId: intent.orderId,
        amount: money(intent.amountMinor, intent.currency),
        status: "REQUIRES_ACTION",
        attempts,
        allocations: intent.allocations.map((allocation) => ({
          id: allocation.id,
          vendorOrderId: allocation.vendorOrderId,
          type: allocation.type,
          amount: money(allocation.amountMinor, allocation.currency),
          createdAt: allocation.createdAt.toISOString(),
        })),
        createdAt: intent.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      },
      attempt,
      authorizationUrl: initialized.authorizationUrl,
      accessCode: initialized.accessCode ?? null,
      replayed,
    };
  }

  private async callInitialize(
    provider: PaymentProviderDto,
    begin: Extract<BeginInitializationResult, { kind: "created" }>,
    attemptId: string,
    providerReference: string,
    body: InitializePaymentBodyDto,
  ): Promise<ProviderInitializeResult> {
    const adapter = this.adapter(provider);
    if (!adapter) {
      return {
        kind: "definite_failure",
        code: `${provider}_NOT_CONFIGURED`,
        message: `${provider} is not configured.`,
      };
    }
    return adapter.initialize({
      reference: providerReference,
      amountMinor: begin.intent.amountMinor,
      currency: begin.intent.currency,
      customer: this.customer(begin.intent),
      callbackUrl: this.callbackUrl,
      ...(body.channel ? { channel: body.channel } : {}),
      metadata: {
        paymentIntentId: begin.intent.id,
        orderId: begin.intent.orderId,
        attemptId,
      },
    });
  }

  async initialize(
    principal: AccessPrincipal,
    paymentIntentId: string,
    body: InitializePaymentBodyDto,
    idempotencyKey: string,
  ): Promise<PaymentInitializationResponseDto> {
    const existing = await this.repository.findOwnedIntent(principal.userId, paymentIntentId);
    if (!existing) throw new PaymentError("PAYMENT_INTENT_NOT_FOUND", "Payment intent was not found.", 404);
    this.customer(existing);

    const primary = this.firstProvider();
    const primaryReference = paymentReference(primary);
    const begin = await this.repository.beginInitialization({
      userId: principal.userId,
      paymentIntentId,
      idempotencyKey,
      requestFingerprint: initializationFingerprint(paymentIntentId, body),
      provider: primary,
      providerReference: primaryReference,
      ...(body.channel ? { channel: body.channel } : {}),
      now: new Date(),
    });

    if (begin.kind === "replay") {
      const response = asStoredInitialization(begin.responseBody);
      if (!response) {
        throw new PaymentError("PAYMENT_REPLAY_UNAVAILABLE", "Stored payment initialization is unavailable.", 409);
      }
      return { ...response, replayed: true };
    }
    if (begin.kind === "in_progress") {
      throw new PaymentError(
        "PAYMENT_INITIALIZATION_IN_PROGRESS",
        "This payment initialization is still being reconciled. Do not create another charge.",
        409,
      );
    }
    if (begin.kind === "idempotency_conflict") {
      throw new PaymentError(
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used with a different payment request.",
        409,
      );
    }
    if (begin.kind === "intent_not_found") {
      throw new PaymentError("PAYMENT_INTENT_NOT_FOUND", "Payment intent was not found.", 404);
    }
    if (begin.kind === "already_paid") {
      throw new PaymentError("PAYMENT_ALREADY_SUCCEEDED", "This payment has already succeeded.", 409);
    }
    if (begin.kind === "not_payable") {
      throw new PaymentError(
        "PAYMENT_NOT_PAYABLE",
        "This order is no longer in a state that can accept a new payment.",
        409,
      );
    }
    if (begin.kind === "reservation_expired") {
      throw new PaymentError(
        "PAYMENT_RESERVATION_EXPIRED",
        "The checkout inventory reservation has expired. Do not pay this order; return to the marketplace and create a new checkout.",
        409,
      );
    }
    if (begin.kind === "active_attempt") {
      throw new PaymentError(
        "PAYMENT_ATTEMPT_ACTIVE",
        "A payment attempt is already active. Reconcile it before creating another charge.",
        409,
      );
    }

    let provider = primary;
    let attempt = begin.attempt;
    let initialized = await this.callInitialize(provider, begin, attempt.id, primaryReference, body);

    if (initialized.kind === "definite_failure") {
      await this.repository.markInitializationFailed({
        attemptId: attempt.id,
        category: initialized.code,
      });
      const fallbackProvider: PaymentProviderDto | undefined =
        provider === "PAYSTACK" && this.adapter("FLUTTERWAVE") ? "FLUTTERWAVE" : undefined;
      if (!fallbackProvider) {
        await this.repository.markInitializationFailed({
          attemptId: attempt.id,
          idempotencyId: begin.idempotencyId,
          category: initialized.code,
        });
        throw new PaymentError("PAYMENT_INITIALIZATION_FAILED", initialized.message, 502);
      }
      provider = fallbackProvider;
      const fallbackReference = paymentReference(fallbackProvider);
      try {
        attempt = await this.repository.createFallbackAttempt({
          paymentIntentId,
          provider: fallbackProvider,
          providerReference: fallbackReference,
          expectedAmountMinor: begin.intent.amountMinor,
          expectedCurrency: begin.intent.currency,
          ...(body.channel ? { channel: body.channel } : {}),
        });
      } catch (error) {
        if (repositorySignal(error, "PAYMENT_RESERVATION_EXPIRED")) {
          throw new PaymentError(
            "PAYMENT_RESERVATION_EXPIRED",
            "The checkout inventory reservation expired before fallback could safely start. Do not pay this order.",
            409,
          );
        }
        if (
          repositorySignal(error, "PAYMENT_NOT_PAYABLE") ||
          repositorySignal(error, "PAYMENT_AMOUNT_CHANGED") ||
          repositorySignal(error, "ORDER_PAYMENT_STATE_CHANGED") ||
          repositorySignal(error, "ORDER_PAYMENT_AMOUNT_CHANGED")
        ) {
          throw new PaymentError(
            "PAYMENT_NOT_PAYABLE",
            "The order changed before fallback could safely start. Refresh the order before taking another payment action.",
            409,
          );
        }
        if (repositorySignal(error, "ORDER_PAYMENT_ACTIVE")) {
          throw new PaymentError(
            "PAYMENT_ATTEMPT_ACTIVE",
            "Another payment attempt became active. Reconcile it before creating another charge.",
            409,
          );
        }
        throw error;
      }
      initialized = await this.callInitialize(provider, begin, attempt.id, fallbackReference, body);
    }

    if (initialized.kind === "ambiguous") {
      await this.repository.markInitializationAmbiguous({
        attemptId: attempt.id,
        category: initialized.code,
      });
      throw new PaymentError(
        "PAYMENT_OUTCOME_UNKNOWN",
        "The provider may have accepted the payment request. CartNest will reconcile it before allowing another charge.",
        409,
      );
    }

    if (initialized.kind === "definite_failure") {
      await this.repository.markInitializationFailed({
        attemptId: attempt.id,
        idempotencyId: begin.idempotencyId,
        category: initialized.code,
      });
      throw new PaymentError("PAYMENT_INITIALIZATION_FAILED", initialized.message, 502);
    }

    const attemptDto = mapAttempt({
      ...attempt,
      providerReference: initialized.providerReference,
      providerTxnId: initialized.providerTransactionId ?? null,
      channel: initialized.channel ?? attempt.channel,
      status: "REQUIRES_ACTION",
      failureCategory: null,
      updatedAt: new Date(),
    });
    const response = this.initializationResponse(begin, attemptDto, initialized, false);
    await this.repository.completeInitialization({
      idempotencyId: begin.idempotencyId,
      attemptId: attempt.id,
      providerReference: initialized.providerReference,
      ...(initialized.providerTransactionId
        ? { providerTransactionId: initialized.providerTransactionId }
        : {}),
      ...(initialized.channel ? { channel: initialized.channel } : {}),
      responseBody: response as unknown as Prisma.InputJsonValue,
    });
    return response;
  }

  async getIntent(principal: AccessPrincipal, paymentIntentId: string): Promise<PaymentIntentDetailDto> {
    const intent = await this.repository.findOwnedIntent(principal.userId, paymentIntentId);
    if (!intent) throw new PaymentError("PAYMENT_INTENT_NOT_FOUND", "Payment intent was not found.", 404);
    return mapIntent(intent);
  }

  private verificationMatches(
    attempt: PaymentAttemptContext,
    verification: ProviderVerificationResult,
  ): boolean {
    return (
      verification.providerReference === attempt.providerReference &&
      verification.amountMinor === attempt.paymentIntent.amountMinor &&
      verification.currency === attempt.paymentIntent.currency
    );
  }

  private async applyVerification(
    attempt: PaymentAttemptContext,
    verification: ProviderVerificationResult,
    eventId?: string,
  ): Promise<void> {
    if (verification.status === "SUCCEEDED" && !this.verificationMatches(attempt, verification)) {
      if (eventId) await this.repository.markProviderEvent(eventId, "MISMATCH", attempt.id);
      await this.repository.markInitializationAmbiguous({
        attemptId: attempt.id,
        category: "VERIFICATION_MISMATCH",
      });
      return;
    }
    if (verification.status === "SUCCEEDED") {
      await this.repository.applyVerifiedSuccess({
        attemptId: attempt.id,
        verification,
        ...(eventId ? { eventId } : {}),
        now: new Date(),
      });
      return;
    }
    await this.repository.applyVerifiedNonSuccess({
      attemptId: attempt.id,
      status: verification.status,
      verification,
      ...(eventId ? { eventId } : {}),
    });
  }

  async reconcileOwnedIntent(
    principal: AccessPrincipal,
    paymentIntentId: string,
  ): Promise<PaymentIntentDetailDto> {
    const intent = await this.repository.findOwnedIntent(principal.userId, paymentIntentId);
    if (!intent) throw new PaymentError("PAYMENT_INTENT_NOT_FOUND", "Payment intent was not found.", 404);
    const attempt = [...intent.attempts]
      .reverse()
      .find((item) => item.providerReference && ["PENDING", "REQUIRES_ACTION", "PROCESSING"].includes(item.status));
    if (!attempt?.providerReference) return mapIntent(intent);
    const context = await this.repository.findAttemptContext(attempt.provider, attempt.providerReference);
    const adapter = this.adapter(attempt.provider);
    if (!context || !adapter) return mapIntent(intent);
    await this.applyVerification(context, await adapter.verify(attempt.providerReference));
    return mapIntent((await this.repository.findOwnedIntent(principal.userId, paymentIntentId))!);
  }

  async handleWebhook(
    provider: PaymentProviderDto,
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<void> {
    const adapter = this.adapter(provider);
    if (!adapter) throw new PaymentError("PAYMENT_PROVIDER_UNAVAILABLE", "Payment provider is unavailable.", 503);
    if (!adapter.verifyWebhook(rawBody, signature)) {
      throw new PaymentError("INVALID_WEBHOOK_SIGNATURE", "Webhook signature verification failed.", 401);
    }

    let event: NormalizedWebhookEvent;
    try {
      event = adapter.normalizeWebhook(rawBody);
    } catch {
      throw new PaymentError("INVALID_WEBHOOK_PAYLOAD", "Webhook payload is invalid.", 400);
    }
    const recorded = await this.repository.recordProviderEvent({
      provider,
      ...(event.externalEventId ? { externalEventId: event.externalEventId } : {}),
      fingerprint: event.fingerprint,
      eventType: event.eventType,
      payload: providerPayload(rawBody),
      ...(event.providerReference ? { providerReference: event.providerReference } : {}),
    });
    if (recorded.kind === "duplicate") return;
    if (!event.providerReference) {
      await this.repository.markProviderEvent(recorded.eventId, "IGNORED_NO_REFERENCE");
      return;
    }
    const attempt = await this.repository.findAttemptContext(provider, event.providerReference);
    if (!attempt) {
      await this.repository.markProviderEvent(recorded.eventId, "UNKNOWN_REFERENCE");
      return;
    }
    const verification = await adapter.verify(event.providerReference);
    await this.applyVerification(attempt, verification, recorded.eventId);
  }

  async reconcilePending(limit = 100): Promise<number> {
    const candidates = await this.repository.listReconciliationCandidates({
      olderThan: new Date(Date.now() - 2 * 60 * 1000),
      limit,
    });
    let processed = 0;
    for (const candidate of candidates) {
      const adapter = this.adapter(candidate.provider);
      if (!adapter) continue;
      const attempt = await this.repository.findAttemptContext(candidate.provider, candidate.providerReference);
      if (!attempt) continue;
      await this.applyVerification(attempt, await adapter.verify(candidate.providerReference));
      processed += 1;
    }
    return processed;
  }
}
