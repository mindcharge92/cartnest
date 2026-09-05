import type { PaymentChannelDto, PaymentProviderDto } from "@repo/contracts";
import {
  Prisma,
  type DatabaseClient,
  enqueueOutboxEvent,
  writeAuditEntry,
} from "@repo/database";
import type { ProviderVerificationResult } from "./payment.provider.js";

const paymentIntentInclude = {
  order: {
    include: {
      user: { select: { id: true, email: true, phone: true } },
      vendorOrders: {
        orderBy: { createdAt: "asc" as const },
        include: { items: { orderBy: { createdAt: "asc" as const } } },
      },
      reservations: { orderBy: { createdAt: "asc" as const } },
    },
  },
  attempts: { orderBy: { initializedAt: "asc" as const } },
  allocations: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.PaymentIntentInclude;

const attemptContextInclude = {
  paymentIntent: {
    include: {
      order: {
        include: {
          vendorOrders: {
            orderBy: { createdAt: "asc" as const },
            include: { items: { orderBy: { createdAt: "asc" as const } } },
          },
          reservations: { orderBy: { createdAt: "asc" as const } },
        },
      },
    },
  },
} satisfies Prisma.PaymentAttemptInclude;

export type PaymentIntentRecord = Prisma.PaymentIntentGetPayload<{ include: typeof paymentIntentInclude }>;
export type PaymentAttemptContext = Prisma.PaymentAttemptGetPayload<{ include: typeof attemptContextInclude }>;

export type BeginInitializationResult =
  | {
      readonly kind: "created";
      readonly intent: PaymentIntentRecord;
      readonly attempt: PaymentIntentRecord["attempts"][number];
      readonly idempotencyId: string;
    }
  | { readonly kind: "replay"; readonly responseBody: Prisma.JsonValue }
  | { readonly kind: "in_progress" }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "intent_not_found" }
  | { readonly kind: "already_paid" }
  | { readonly kind: "not_payable" }
  | { readonly kind: "reservation_expired" }
  | { readonly kind: "active_attempt"; readonly attemptId: string };

export type RecordProviderEventResult =
  | { readonly kind: "created"; readonly eventId: string }
  | { readonly kind: "duplicate"; readonly eventId: string };

export interface PaymentRepository {
  beginInitialization(input: {
    userId: string;
    paymentIntentId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    provider: PaymentProviderDto;
    providerReference: string;
    channel?: PaymentChannelDto;
    now: Date;
  }): Promise<BeginInitializationResult>;
  createFallbackAttempt(input: {
    paymentIntentId: string;
    provider: PaymentProviderDto;
    providerReference: string;
    channel?: PaymentChannelDto;
  }): Promise<PaymentIntentRecord["attempts"][number]>;
  completeInitialization(input: {
    idempotencyId: string;
    attemptId: string;
    providerReference: string;
    providerTransactionId?: string;
    channel?: string;
    responseBody: Prisma.InputJsonValue;
  }): Promise<void>;
  markInitializationFailed(input: {
    attemptId: string;
    idempotencyId?: string;
    category: string;
  }): Promise<void>;
  markInitializationAmbiguous(input: {
    attemptId: string;
    category: string;
  }): Promise<void>;
  findOwnedIntent(userId: string, paymentIntentId: string): Promise<PaymentIntentRecord | null>;
  findAttemptContext(provider: PaymentProviderDto, providerReference: string): Promise<PaymentAttemptContext | null>;
  recordProviderEvent(input: {
    provider: PaymentProviderDto;
    externalEventId?: string;
    fingerprint: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
    providerReference?: string;
  }): Promise<RecordProviderEventResult>;
  markProviderEvent(eventId: string, status: string, attemptId?: string): Promise<void>;
  applyVerifiedSuccess(input: {
    attemptId: string;
    verification: ProviderVerificationResult;
    eventId?: string;
    now: Date;
  }): Promise<{ fulfillmentCommitted: boolean; allocationsValid: boolean }>;
  applyVerifiedNonSuccess(input: {
    attemptId: string;
    status: "FAILED" | "PROCESSING" | "UNKNOWN";
    verification: ProviderVerificationResult;
    eventId?: string;
  }): Promise<void>;
  listReconciliationCandidates(input: {
    olderThan: Date;
    limit: number;
  }): Promise<Array<{ id: string; provider: PaymentProviderDto; providerReference: string }>>;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function proportionalFee(totalFee: bigint, totals: readonly bigint[]): bigint[] {
  if (totals.length === 0) return [];
  const denominator = totals.reduce((sum, value) => sum + value, 0n);
  if (denominator <= 0n || totalFee <= 0n) return totals.map(() => 0n);
  let allocated = 0n;
  return totals.map((value, index) => {
    if (index === totals.length - 1) return totalFee - allocated;
    const share = (totalFee * value) / denominator;
    allocated += share;
    return share;
  });
}

function payableVariantIds(
  vendorOrders: readonly {
    status: string;
    items: readonly { variantId: string }[];
  }[],
): Set<string> {
  return new Set(
    vendorOrders
      .filter((vendorOrder) => vendorOrder.status !== "CANCELLED")
      .flatMap((vendorOrder) => vendorOrder.items.map((item) => item.variantId)),
  );
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly database: DatabaseClient) {}

  async beginInitialization(input: {
    userId: string;
    paymentIntentId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    provider: PaymentProviderDto;
    providerReference: string;
    channel?: PaymentChannelDto;
    now: Date;
  }): Promise<BeginInitializationResult> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const operation = `payment.initialize:${input.paymentIntentId}`;
        const existingKey = await transaction.idempotencyRecord.findUnique({
          where: {
            principalId_operation_idempotencyKey: {
              principalId: input.userId,
              operation,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existingKey) {
          if (existingKey.requestFingerprint !== input.requestFingerprint) {
            return { kind: "idempotency_conflict" as const };
          }
          if (existingKey.status === "COMPLETED" && existingKey.responseBody !== null) {
            return { kind: "replay" as const, responseBody: existingKey.responseBody };
          }
          return { kind: "in_progress" as const };
        }

        const intent = await transaction.paymentIntent.findFirst({
          where: { id: input.paymentIntentId, order: { userId: input.userId } },
          include: paymentIntentInclude,
        });
        if (!intent) return { kind: "intent_not_found" as const };
        if (intent.status === "SUCCEEDED" || intent.order.paymentStatus === "SUCCEEDED") {
          return { kind: "already_paid" as const };
        }
        if (
          !["PENDING_PAYMENT", "PARTIALLY_CANCELLED"].includes(intent.order.status) ||
          intent.order.paymentStatus !== "PENDING"
        ) {
          return { kind: "not_payable" as const };
        }

        const active = intent.attempts.find((attempt) =>
          ["PENDING", "REQUIRES_ACTION", "PROCESSING", "SUCCEEDED"].includes(attempt.status),
        );
        if (active) return { kind: "active_attempt" as const, attemptId: active.id };
        if (!["PENDING", "FAILED"].includes(intent.status)) {
          return { kind: "not_payable" as const };
        }

        const expectedVariants = payableVariantIds(intent.order.vendorOrders);
        const relevantReservations = intent.order.reservations.filter((reservation) =>
          expectedVariants.has(reservation.variantId),
        );
        if (
          expectedVariants.size === 0 ||
          relevantReservations.length !== expectedVariants.size ||
          relevantReservations.some(
            (reservation) => reservation.status !== "HELD" || reservation.expiresAt <= input.now,
          )
        ) {
          return { kind: "reservation_expired" as const };
        }

        const idempotency = await transaction.idempotencyRecord.create({
          data: {
            principalId: input.userId,
            operation,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            expiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
        const attempt = await transaction.paymentAttempt.create({
          data: {
            paymentIntentId: intent.id,
            provider: input.provider,
            providerReference: input.providerReference,
            amountMinor: intent.amountMinor,
            currency: intent.currency,
            status: "PENDING",
            channel: input.channel,
          },
        });
        return { kind: "created" as const, intent, attempt, idempotencyId: idempotency.id };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.beginInitialization(input);
    }
  }

  async createFallbackAttempt(input: {
    paymentIntentId: string;
    provider: PaymentProviderDto;
    providerReference: string;
    channel?: PaymentChannelDto;
  }): Promise<PaymentIntentRecord["attempts"][number]> {
    const intent = await this.database.paymentIntent.findUniqueOrThrow({ where: { id: input.paymentIntentId } });
    return this.database.paymentAttempt.create({
      data: {
        paymentIntentId: input.paymentIntentId,
        provider: input.provider,
        providerReference: input.providerReference,
        amountMinor: intent.amountMinor,
        currency: intent.currency,
        status: "PENDING",
        channel: input.channel,
      },
    });
  }

  async completeInitialization(input: {
    idempotencyId: string;
    attemptId: string;
    providerReference: string;
    providerTransactionId?: string;
    channel?: string;
    responseBody: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await transaction.paymentAttempt.update({
        where: { id: input.attemptId },
        data: {
          providerReference: input.providerReference,
          providerTxnId: input.providerTransactionId,
          channel: input.channel,
          status: "REQUIRES_ACTION",
          failureCategory: null,
        },
      });
      await transaction.paymentIntent.update({
        where: { id: (await transaction.paymentAttempt.findUniqueOrThrow({ where: { id: input.attemptId } })).paymentIntentId },
        data: { status: "REQUIRES_ACTION" },
      });
      await transaction.idempotencyRecord.update({
        where: { id: input.idempotencyId },
        data: {
          status: "COMPLETED",
          resourceType: "PaymentAttempt",
          resourceId: input.attemptId,
          responseStatus: 200,
          responseBody: input.responseBody,
        },
      });
    });
  }

  async markInitializationFailed(input: {
    attemptId: string;
    idempotencyId?: string;
    category: string;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.update({
        where: { id: input.attemptId },
        data: { status: "FAILED", failureCategory: input.category },
      });
      const active = await transaction.paymentAttempt.count({
        where: {
          paymentIntentId: attempt.paymentIntentId,
          status: { in: ["PENDING", "REQUIRES_ACTION", "PROCESSING", "SUCCEEDED"] },
        },
      });
      if (active === 0) {
        await transaction.paymentIntent.update({
          where: { id: attempt.paymentIntentId },
          data: { status: "FAILED" },
        });
      }
      if (input.idempotencyId) {
        await transaction.idempotencyRecord.update({
          where: { id: input.idempotencyId },
          data: { status: "FAILED" },
        });
      }
    });
  }

  async markInitializationAmbiguous(input: { attemptId: string; category: string }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.update({
        where: { id: input.attemptId },
        data: { status: "PROCESSING", failureCategory: input.category },
      });
      await transaction.paymentIntent.update({
        where: { id: attempt.paymentIntentId },
        data: { status: "PROCESSING" },
      });
    });
  }

  async findOwnedIntent(userId: string, paymentIntentId: string): Promise<PaymentIntentRecord | null> {
    return this.database.paymentIntent.findFirst({
      where: { id: paymentIntentId, order: { userId } },
      include: paymentIntentInclude,
    });
  }

  async findAttemptContext(
    provider: PaymentProviderDto,
    providerReference: string,
  ): Promise<PaymentAttemptContext | null> {
    return this.database.paymentAttempt.findFirst({
      where: { provider, providerReference },
      include: attemptContextInclude,
    });
  }

  async recordProviderEvent(input: {
    provider: PaymentProviderDto;
    externalEventId?: string;
    fingerprint: string;
    eventType: string;
    payload: Prisma.InputJsonValue;
    providerReference?: string;
  }): Promise<RecordProviderEventResult> {
    const existing = input.externalEventId
      ? await this.database.providerEvent.findUnique({
          where: {
            provider_externalEventId: {
              provider: input.provider,
              externalEventId: input.externalEventId,
            },
          },
        })
      : await this.database.providerEvent.findFirst({
          where: { provider: input.provider, fingerprint: input.fingerprint },
        });
    if (existing) return { kind: "duplicate", eventId: existing.id };

    try {
      const event = await this.database.providerEvent.create({
        data: {
          provider: input.provider,
          externalEventId: input.externalEventId,
          fingerprint: input.fingerprint,
          eventType: input.eventType,
          status: "RECEIVED",
          payload: input.payload,
        },
      });
      return { kind: "created", eventId: event.id };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = input.externalEventId
        ? await this.database.providerEvent.findUnique({
            where: {
              provider_externalEventId: {
                provider: input.provider,
                externalEventId: input.externalEventId,
              },
            },
          })
        : await this.database.providerEvent.findFirst({
            where: { provider: input.provider, fingerprint: input.fingerprint },
          });
      if (!duplicate) throw error;
      return { kind: "duplicate", eventId: duplicate.id };
    }
  }

  async markProviderEvent(eventId: string, status: string, attemptId?: string): Promise<void> {
    await this.database.providerEvent.update({
      where: { id: eventId },
      data: {
        status,
        paymentAttemptId: attemptId,
        processedAt: new Date(),
      },
    });
  }

  async applyVerifiedSuccess(input: {
    attemptId: string;
    verification: ProviderVerificationResult;
    eventId?: string;
    now: Date;
  }): Promise<{ fulfillmentCommitted: boolean; allocationsValid: boolean }> {
    return this.database.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.findUniqueOrThrow({
        where: { id: input.attemptId },
        include: attemptContextInclude,
      });
      const intent = attempt.paymentIntent;
      const order = intent.order;

      if (intent.status === "SUCCEEDED") {
        if (input.eventId) {
          await transaction.providerEvent.update({
            where: { id: input.eventId },
            data: { status: "PROCESSED_DUPLICATE", paymentAttemptId: attempt.id, processedAt: input.now },
          });
        }
        return {
          fulfillmentCommitted: order.status === "PAID",
          allocationsValid: (await transaction.paymentAllocation.count({ where: { paymentIntentId: intent.id } })) > 0,
        };
      }

      const claimed = await transaction.paymentIntent.updateMany({
        where: { id: intent.id, status: { not: "SUCCEEDED" } },
        data: { status: "SUCCEEDED" },
      });
      if (claimed.count !== 1) {
        return { fulfillmentCommitted: false, allocationsValid: false };
      }

      await transaction.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "SUCCEEDED",
          failureCategory: null,
          providerTxnId: input.verification.providerTransactionId,
          channel: input.verification.channel ?? attempt.channel,
          confirmedAt: input.now,
        },
      });
      await transaction.paymentAttempt.updateMany({
        where: {
          paymentIntentId: intent.id,
          id: { not: attempt.id },
          status: { in: ["PENDING", "REQUIRES_ACTION", "PROCESSING"] },
        },
        data: { status: "CANCELLED", failureCategory: "SUPERSEDED_BY_SUCCESS" },
      });

      const payableVendorOrders = order.vendorOrders.filter((vendorOrder) => vendorOrder.status !== "CANCELLED");
      const feeTotal = input.verification.feeAmountMinor ?? 0n;
      const vendorTotals = payableVendorOrders.map((vendorOrder) => vendorOrder.totalAmountMinor);
      const fees = proportionalFee(feeTotal, vendorTotals);
      const allocationRows: Array<{
        paymentIntentId: string;
        vendorOrderId: string;
        type: "VENDOR_NET" | "PLATFORM_COMMISSION" | "GATEWAY_FEE" | "DELIVERY" | "TAX";
        amountMinor: bigint;
        currency: string;
      }> = [];
      let allocationTotal = 0n;
      let allocationsValid = payableVendorOrders.length > 0;

      for (const [index, vendorOrder] of payableVendorOrders.entries()) {
        const gatewayFee = fees[index] ?? 0n;
        const vendorNet =
          vendorOrder.itemSubtotalAmountMinor -
          vendorOrder.discountAmountMinor -
          vendorOrder.commissionAmountMinor -
          gatewayFee;
        if (vendorNet < 0n) allocationsValid = false;
        const components = [
          { type: "VENDOR_NET" as const, amountMinor: vendorNet },
          { type: "PLATFORM_COMMISSION" as const, amountMinor: vendorOrder.commissionAmountMinor },
          { type: "GATEWAY_FEE" as const, amountMinor: gatewayFee },
          { type: "DELIVERY" as const, amountMinor: vendorOrder.deliveryAmountMinor },
          { type: "TAX" as const, amountMinor: vendorOrder.taxAmountMinor },
        ];
        for (const component of components) {
          allocationRows.push({
            paymentIntentId: intent.id,
            vendorOrderId: vendorOrder.id,
            type: component.type,
            amountMinor: component.amountMinor,
            currency: intent.currency,
          });
          allocationTotal += component.amountMinor;
        }
        await transaction.vendorOrder.update({
          where: { id: vendorOrder.id },
          data: { gatewayFeeAmountMinor: gatewayFee },
        });
      }
      if (allocationTotal !== intent.amountMinor) allocationsValid = false;
      if (allocationsValid) {
        await transaction.paymentAllocation.createMany({ data: allocationRows });
      }

      type LockedReservation = {
        id: string;
        variantId: string;
        quantity: number;
        status: string;
        expiresAt: Date;
        onHand: number;
        reserved: number;
      };
      const lockedReservations = await transaction.$queryRaw<LockedReservation[]>(Prisma.sql`
        SELECT r."id", r."variantId", r."quantity", r."status", r."expiresAt", i."onHand", i."reserved"
        FROM "InventoryReservation" r
        JOIN "InventoryItem" i ON i."variantId" = r."variantId"
        WHERE r."orderId" = ${order.id}::uuid
        ORDER BY r."variantId"
        FOR UPDATE OF r, i
      `);
      const expectedVariants = payableVariantIds(payableVendorOrders);
      const relevantReservations = lockedReservations.filter((reservation) =>
        expectedVariants.has(reservation.variantId),
      );
      const fulfillmentCommitted =
        allocationsValid &&
        ["PENDING_PAYMENT", "PARTIALLY_CANCELLED"].includes(order.status) &&
        order.paymentStatus === "PENDING" &&
        expectedVariants.size > 0 &&
        relevantReservations.length === expectedVariants.size &&
        relevantReservations.every(
          (reservation) =>
            reservation.status === "HELD" &&
            reservation.expiresAt > input.now &&
            reservation.onHand >= reservation.quantity &&
            reservation.reserved >= reservation.quantity,
        );

      if (fulfillmentCommitted) {
        for (const reservation of relevantReservations) {
          await transaction.inventoryItem.update({
            where: { variantId: reservation.variantId },
            data: {
              onHand: { decrement: reservation.quantity },
              reserved: { decrement: reservation.quantity },
              version: { increment: 1 },
            },
          });
          await transaction.inventoryReservation.update({
            where: { id: reservation.id },
            data: { status: "COMMITTED", committedAt: input.now },
          });
        }
        await transaction.order.update({
          where: { id: order.id },
          data: { paymentStatus: "SUCCEEDED", status: "PAID" },
        });
        await transaction.vendorOrder.updateMany({
          where: { orderId: order.id, status: "PENDING" },
          data: { status: "ACCEPTED", acceptedAt: input.now },
        });
      } else {
        await transaction.order.update({
          where: { id: order.id },
          data: { paymentStatus: "SUCCEEDED" },
        });
      }

      await enqueueOutboxEvent(transaction, {
        aggregateType: "PaymentIntent",
        aggregateId: intent.id,
        eventType: "payment.succeeded",
        payload: {
          paymentIntentId: intent.id,
          orderId: order.id,
          provider: attempt.provider,
          providerReference: attempt.providerReference,
          fulfillmentCommitted,
          allocationsValid,
        },
      });
      if (!fulfillmentCommitted || !allocationsValid) {
        await enqueueOutboxEvent(transaction, {
          aggregateType: "Order",
          aggregateId: order.id,
          eventType: "payment.manual_review_required",
          payload: {
            orderId: order.id,
            paymentIntentId: intent.id,
            reason: !allocationsValid ? "ALLOCATION_MISMATCH" : "INVENTORY_RESERVATION_UNAVAILABLE",
          },
        });
      }
      await writeAuditEntry(transaction, {
        actorType: "PROVIDER",
        action: "payment.verified_success",
        entityType: "PaymentIntent",
        entityId: intent.id,
        metadata: {
          provider: attempt.provider,
          providerReference: attempt.providerReference,
          providerTransactionId: input.verification.providerTransactionId ?? null,
          fulfillmentCommitted,
          allocationsValid,
        },
      });
      if (input.eventId) {
        await transaction.providerEvent.update({
          where: { id: input.eventId },
          data: { status: "PROCESSED", paymentAttemptId: attempt.id, processedAt: input.now },
        });
      }
      return { fulfillmentCommitted, allocationsValid };
    });
  }

  async applyVerifiedNonSuccess(input: {
    attemptId: string;
    status: "FAILED" | "PROCESSING" | "UNKNOWN";
    verification: ProviderVerificationResult;
    eventId?: string;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      const attempt = await transaction.paymentAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      const nextStatus = input.status === "FAILED" ? "FAILED" : "PROCESSING";
      await transaction.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: nextStatus,
          providerTxnId: input.verification.providerTransactionId,
          channel: input.verification.channel ?? attempt.channel,
          failureCategory: input.status === "UNKNOWN" ? "RECONCILIATION_UNKNOWN" : null,
        },
      });
      await transaction.paymentIntent.update({
        where: { id: attempt.paymentIntentId },
        data: { status: nextStatus },
      });
      if (input.eventId) {
        await transaction.providerEvent.update({
          where: { id: input.eventId },
          data: { status: "PROCESSED", paymentAttemptId: attempt.id, processedAt: new Date() },
        });
      }
    });
  }

  async listReconciliationCandidates(input: {
    olderThan: Date;
    limit: number;
  }): Promise<Array<{ id: string; provider: PaymentProviderDto; providerReference: string }>> {
    const attempts = await this.database.paymentAttempt.findMany({
      where: {
        status: { in: ["PROCESSING", "REQUIRES_ACTION"] },
        updatedAt: { lte: input.olderThan },
        providerReference: { not: null },
      },
      orderBy: { updatedAt: "asc" },
      take: Math.max(1, Math.min(500, input.limit)),
      select: { id: true, provider: true, providerReference: true },
    });
    return attempts.flatMap((attempt) =>
      attempt.providerReference
        ? [{ id: attempt.id, provider: attempt.provider, providerReference: attempt.providerReference }]
        : [],
    );
  }
}
