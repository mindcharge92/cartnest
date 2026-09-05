import type {
  DeliveryAddressSnapshotDto,
  OrderStatusDto,
  VendorOrderStatusDto,
} from "@repo/contracts";
import {
  Prisma,
  type DatabaseClient,
  enqueueOutboxEvent,
  writeAuditEntry,
} from "@repo/database";
import type { CheckoutStoreFinancialQuote } from "./order.policy.js";

const orderInclude = {
  vendorOrders: {
    orderBy: { createdAt: "asc" as const },
    include: {
      store: { include: { vendor: { select: { id: true, displayName: true } } } },
      items: { orderBy: { createdAt: "asc" as const } },
    },
  },
  paymentIntents: { orderBy: { createdAt: "asc" as const } },
  reservations: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.OrderInclude;

const vendorOrderInclude = {
  order: true,
  store: { include: { vendor: { select: { id: true, displayName: true } } } },
  items: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.VendorOrderInclude;

const checkoutCartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      variant: {
        include: {
          optionValues: {
            include: {
              optionValue: { include: { option: { select: { id: true, name: true } } } },
            },
          },
          product: {
            include: {
              category: { select: { id: true } },
              store: {
                include: {
                  vendor: { select: { id: true, displayName: true, status: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type VendorOrderRecord = Prisma.VendorOrderGetPayload<{ include: typeof vendorOrderInclude }>;
type CheckoutCartRecord = Prisma.CartGetPayload<{ include: typeof checkoutCartInclude }>;

export interface CheckoutDraftLine {
  readonly cartItemId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly categoryId: string | null;
  readonly storeId: string;
  readonly storeName: string;
  readonly storeSlug: string;
  readonly vendorId: string;
  readonly vendorDisplayName: string;
  readonly quantity: number;
  readonly productName: string;
  readonly sku: string;
  readonly unitPriceAmountMinor: bigint;
  readonly currency: string;
  readonly variantAttributes: readonly {
    readonly optionId: string;
    readonly optionName: string;
    readonly valueId: string;
    readonly value: string;
  }[];
}

export interface CheckoutDraft {
  readonly cartId: string;
  readonly cartUpdatedAt: Date;
  readonly lines: readonly CheckoutDraftLine[];
}

export interface CheckoutStoreQuote {
  readonly storeId: string;
  readonly vendorId: string;
  readonly quote: CheckoutStoreFinancialQuote;
  readonly acceptanceMode: "AUTO" | "MANUAL";
}

export type CheckoutCreateResult =
  | { readonly kind: "created"; readonly order: OrderRecord }
  | { readonly kind: "replayed"; readonly order: OrderRecord }
  | { readonly kind: "idempotency_conflict" }
  | { readonly kind: "checkout_in_progress" }
  | { readonly kind: "cart_changed" }
  | { readonly kind: "promotion_conflict" }
  | { readonly kind: "stock_conflict"; readonly variantId: string };

export interface OrderRepository {
  getCheckoutDraft(userId: string): Promise<CheckoutDraft | null>;
  createCheckout(input: {
    userId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    deliveryAddress: DeliveryAddressSnapshotDto;
    draft: CheckoutDraft;
    storeQuotes: readonly CheckoutStoreQuote[];
    now: Date;
  }): Promise<CheckoutCreateResult>;
  findUserOrder(userId: string, orderId: string): Promise<OrderRecord | null>;
  listUserOrders(input: {
    userId: string;
    status?: OrderStatusDto;
    page: number;
    pageSize: number;
  }): Promise<{ items: OrderRecord[]; totalItems: number }>;
  cancelUserOrder(input: {
    userId: string;
    orderId: string;
    reason?: string;
    now: Date;
  }): Promise<OrderRecord | null>;
  findVendorOrder(vendorOrderId: string): Promise<VendorOrderRecord | null>;
  listStoreVendorOrders(input: {
    storeId: string;
    status?: VendorOrderStatusDto;
    page: number;
    pageSize: number;
  }): Promise<{ items: VendorOrderRecord[]; totalItems: number }>;
  cancelVendorOrder(input: {
    vendorOrderId: string;
    actorUserId: string;
    reason?: string;
    now: Date;
  }): Promise<VendorOrderRecord | null>;
  expireReservations(now: Date, limit?: number): Promise<number>;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function checkoutLine(row: CheckoutCartRecord["items"][number]): CheckoutDraftLine {
  const variant = row.variant;
  const product = variant.product;
  return {
    cartItemId: row.id,
    variantId: variant.id,
    productId: product.id,
    categoryId: product.category?.id ?? null,
    storeId: product.store.id,
    storeName: product.store.name,
    storeSlug: product.store.slug,
    vendorId: product.store.vendor.id,
    vendorDisplayName: product.store.vendor.displayName,
    quantity: row.quantity,
    productName: product.name,
    sku: variant.sku,
    unitPriceAmountMinor: variant.priceAmountMinor,
    currency: variant.currency,
    variantAttributes: variant.optionValues
      .map((entry) => ({
        optionId: entry.optionValue.option.id,
        optionName: entry.optionValue.option.name,
        valueId: entry.optionValue.id,
        value: entry.optionValue.value,
      }))
      .sort((left, right) => left.optionName.localeCompare(right.optionName)),
  };
}

function lineSignature(line: CheckoutDraftLine): string {
  return [
    line.cartItemId,
    line.variantId,
    line.quantity,
    line.productId,
    line.storeId,
    line.vendorId,
    line.unitPriceAmountMinor.toString(),
    line.currency,
    JSON.stringify(line.variantAttributes),
  ].join("|");
}

function orderNumber(now: Date): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `CN-${date}-${random}`;
}

function allocateAmount(total: bigint, bases: readonly bigint[]): bigint[] {
  if (bases.length === 0) return [];
  const baseTotal = bases.reduce((sum, value) => sum + value, 0n);
  if (total === 0n || baseTotal === 0n) return bases.map(() => 0n);
  let allocated = 0n;
  return bases.map((base, index) => {
    const share = index === bases.length - 1 ? total - allocated : (total * base) / baseTotal;
    allocated += share;
    return share;
  });
}

type LockedPromotion = {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perUserLimit: number | null;
};

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getCheckoutDraft(userId: string): Promise<CheckoutDraft | null> {
    const cart = await this.database.cart.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: checkoutCartInclude,
    });
    if (!cart) return null;
    return {
      cartId: cart.id,
      cartUpdatedAt: cart.updatedAt,
      lines: cart.items.map(checkoutLine),
    };
  }

  private async replayExisting(
    userId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<CheckoutCreateResult | null> {
    const record = await this.database.idempotencyRecord.findUnique({
      where: {
        principalId_operation_idempotencyKey: {
          principalId: userId,
          operation: "checkout.create",
          idempotencyKey,
        },
      },
    });
    if (!record) return null;
    if (record.requestFingerprint !== requestFingerprint) return { kind: "idempotency_conflict" };
    if (record.status === "IN_PROGRESS") return { kind: "checkout_in_progress" };
    if (record.status === "COMPLETED" && record.resourceType === "Order" && record.resourceId) {
      const order = await this.findUserOrder(userId, record.resourceId);
      if (order) return { kind: "replayed", order };
    }
    return { kind: "checkout_in_progress" };
  }

  async createCheckout(input: {
    userId: string;
    idempotencyKey: string;
    requestFingerprint: string;
    deliveryAddress: DeliveryAddressSnapshotDto;
    draft: CheckoutDraft;
    storeQuotes: readonly CheckoutStoreQuote[];
    now: Date;
  }): Promise<CheckoutCreateResult> {
    const replay = await this.replayExisting(
      input.userId,
      input.idempotencyKey,
      input.requestFingerprint,
    );
    if (replay) return replay;

    const quoteByStore = new Map(input.storeQuotes.map((entry) => [entry.storeId, entry]));
    const expiresAt = new Date(input.now.getTime() + 15 * 60 * 1000);

    try {
      const orderId = await this.database.$transaction(async (transaction) => {
        await transaction.idempotencyRecord.create({
          data: {
            principalId: input.userId,
            operation: "checkout.create",
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            expiresAt: new Date(input.now.getTime() + 24 * 60 * 60 * 1000),
          },
        });

        const cart = await transaction.cart.findFirst({
          where: { id: input.draft.cartId, userId: input.userId, status: "ACTIVE" },
          include: checkoutCartInclude,
        });
        if (!cart || cart.items.length === 0) throw new Error("CHECKOUT_CART_CHANGED");

        const currentLines = cart.items.map(checkoutLine);
        const expected = [...input.draft.lines].map(lineSignature).sort();
        const current = currentLines.map(lineSignature).sort();
        if (
          expected.length !== current.length ||
          expected.some((signature, index) => signature !== current[index])
        ) {
          throw new Error("CHECKOUT_CART_CHANGED");
        }

        for (const item of cart.items) {
          const variant = item.variant;
          const product = variant.product;
          if (
            variant.status !== "ACTIVE" ||
            product.status !== "ACTIVE" ||
            !["NOT_REQUIRED", "APPROVED"].includes(product.moderationStatus) ||
            product.store.status !== "ACTIVE" ||
            product.store.vendor.status !== "APPROVED"
          ) {
            throw new Error("CHECKOUT_CART_CHANGED");
          }
        }

        const currencies = new Set(currentLines.map((line) => line.currency));
        if (currencies.size !== 1 || !currencies.has("NGN")) throw new Error("CHECKOUT_CART_CHANGED");
        const currency = "NGN";

        const linesByStore = new Map<string, CheckoutDraftLine[]>();
        for (const line of currentLines) {
          const list = linesByStore.get(line.storeId) ?? [];
          list.push(line);
          linesByStore.set(line.storeId, list);
        }

        let itemSubtotalAmountMinor = 0n;
        let discountAmountMinor = 0n;
        let deliveryAmountMinor = 0n;
        let taxAmountMinor = 0n;
        for (const [storeId, lines] of linesByStore) {
          const quote = quoteByStore.get(storeId);
          if (!quote) throw new Error("CHECKOUT_CART_CHANGED");
          itemSubtotalAmountMinor += lines.reduce(
            (sum, line) => sum + line.unitPriceAmountMinor * BigInt(line.quantity),
            0n,
          );
          discountAmountMinor += quote.quote.discountAmountMinor;
          deliveryAmountMinor += quote.quote.deliveryAmountMinor;
          taxAmountMinor += quote.quote.taxAmountMinor;
        }
        const grandTotalAmountMinor =
          itemSubtotalAmountMinor - discountAmountMinor + deliveryAmountMinor + taxAmountMinor;
        if (grandTotalAmountMinor < 0n) throw new Error("CHECKOUT_CART_CHANGED");

        const promotionIds = [...new Set(input.storeQuotes.map((entry) => entry.quote.promotionId).filter((id): id is string => Boolean(id)))];
        const promotionId = promotionIds[0];
        if (promotionIds.length > 1) throw new Error("CHECKOUT_PROMOTION_CONFLICT");
        if (promotionId) {
          const rows = await transaction.$queryRaw<LockedPromotion[]>(Prisma.sql`
            SELECT "id", "status", "startsAt", "endsAt", "maxRedemptions", "perUserLimit"
            FROM "Promotion"
            WHERE "id" = ${promotionId}::uuid
            FOR UPDATE
          `);
          const promotion = rows[0];
          if (!promotion || promotion.status !== "ACTIVE" || promotion.startsAt > input.now || (promotion.endsAt && promotion.endsAt <= input.now)) {
            throw new Error("CHECKOUT_PROMOTION_CONFLICT");
          }
          if (promotion.maxRedemptions !== null) {
            const count = await transaction.promotionRedemption.count({ where: { promotionId } });
            if (count >= promotion.maxRedemptions) throw new Error("CHECKOUT_PROMOTION_CONFLICT");
          }
          if (promotion.perUserLimit !== null) {
            const count = await transaction.promotionRedemption.count({ where: { promotionId, userId: input.userId } });
            if (count >= promotion.perUserLimit) throw new Error("CHECKOUT_PROMOTION_CONFLICT");
          }
        }

        const order = await transaction.order.create({
          data: {
            orderNumber: orderNumber(input.now),
            userId: input.userId,
            currency,
            itemSubtotalAmountMinor,
            discountAmountMinor,
            deliveryAmountMinor,
            taxAmountMinor,
            grandTotalAmountMinor,
            paymentStatus: "PENDING",
            status: "PENDING_PAYMENT",
            deliveryAddressSnapshot: input.deliveryAddress as Prisma.InputJsonValue,
          },
        });

        if (promotionId && discountAmountMinor > 0n) {
          await transaction.promotionRedemption.create({
            data: {
              promotionId,
              userId: input.userId,
              orderId: order.id,
              amountMinor: discountAmountMinor,
            },
          });
        }

        for (const variantId of [...new Set(currentLines.map((line) => line.variantId))].sort()) {
          const line = currentLines.find((entry) => entry.variantId === variantId)!;
          const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            UPDATE "InventoryItem"
            SET "reserved" = "reserved" + ${line.quantity},
                "version" = "version" + 1,
                "updatedAt" = ${input.now}
            WHERE "variantId" = ${line.variantId}::uuid
              AND ("onHand" - "reserved") >= ${line.quantity}
            RETURNING "id"
          `);
          if (rows.length !== 1) throw new Error(`CHECKOUT_STOCK_CONFLICT:${line.variantId}`);
          await transaction.inventoryReservation.create({
            data: {
              variantId: line.variantId,
              orderId: order.id,
              cartId: cart.id,
              quantity: line.quantity,
              status: "HELD",
              expiresAt,
            },
          });
        }

        for (const [storeId, lines] of linesByStore) {
          const storeQuote = quoteByStore.get(storeId)!;
          const lineSubtotals = lines.map((line) => line.unitPriceAmountMinor * BigInt(line.quantity));
          const storeSubtotal = lineSubtotals.reduce((sum, value) => sum + value, 0n);
          const lineDiscounts = allocateAmount(storeQuote.quote.discountAmountMinor, lineSubtotals);
          const taxableBases = lineSubtotals.map((subtotal, index) => subtotal - (lineDiscounts[index] ?? 0n));
          const lineTaxes = allocateAmount(storeQuote.quote.taxAmountMinor, taxableBases);
          const storeTotal =
            storeSubtotal -
            storeQuote.quote.discountAmountMinor +
            storeQuote.quote.deliveryAmountMinor +
            storeQuote.quote.taxAmountMinor;
          const vendorOrder = await transaction.vendorOrder.create({
            data: {
              orderId: order.id,
              vendorId: storeQuote.vendorId,
              storeId,
              currency,
              itemSubtotalAmountMinor: storeSubtotal,
              discountAmountMinor: storeQuote.quote.discountAmountMinor,
              deliveryAmountMinor: storeQuote.quote.deliveryAmountMinor,
              taxAmountMinor: storeQuote.quote.taxAmountMinor,
              commissionRateBps: storeQuote.quote.commissionRateBps,
              commissionAmountMinor: storeQuote.quote.commissionAmountMinor,
              gatewayFeeAmountMinor: 0n,
              totalAmountMinor: storeTotal,
              status: storeQuote.acceptanceMode === "AUTO" ? "ACCEPTED" : "PENDING",
              acceptedAt: storeQuote.acceptanceMode === "AUTO" ? input.now : null,
            },
          });

          for (const [index, line] of lines.entries()) {
            const subtotal = lineSubtotals[index]!;
            const discount = lineDiscounts[index] ?? 0n;
            const tax = lineTaxes[index] ?? 0n;
            await transaction.orderItem.create({
              data: {
                vendorOrderId: vendorOrder.id,
                productId: line.productId,
                variantId: line.variantId,
                productNameSnapshot: line.productName,
                skuSnapshot: line.sku,
                variantAttributesSnapshot: line.variantAttributes as Prisma.InputJsonValue,
                unitPriceAmountMinor: line.unitPriceAmountMinor,
                quantity: line.quantity,
                subtotalAmountMinor: subtotal,
                discountAmountMinor: discount,
                taxAmountMinor: tax,
                lineTotalAmountMinor: subtotal - discount + tax,
                currency,
              },
            });
          }
        }

        await transaction.paymentIntent.create({
          data: {
            orderId: order.id,
            amountMinor: grandTotalAmountMinor,
            currency,
            status: "PENDING",
          },
        });
        await transaction.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });

        await writeAuditEntry(transaction, {
          actorType: "USER",
          actorUserId: input.userId,
          action: "checkout.order.created",
          entityType: "Order",
          entityId: order.id,
          metadata: {
            cartId: cart.id,
            reservationExpiresAt: expiresAt.toISOString(),
            vendorOrderCount: linesByStore.size,
            promotionId: promotionId ?? null,
          },
        });
        await enqueueOutboxEvent(transaction, {
          aggregateType: "Order",
          aggregateId: order.id,
          eventType: "order.created",
          payload: {
            orderId: order.id,
            userId: input.userId,
            reservationExpiresAt: expiresAt.toISOString(),
            promotionId: promotionId ?? null,
          },
        });
        await transaction.idempotencyRecord.update({
          where: {
            principalId_operation_idempotencyKey: {
              principalId: input.userId,
              operation: "checkout.create",
              idempotencyKey: input.idempotencyKey,
            },
          },
          data: {
            status: "COMPLETED",
            resourceType: "Order",
            resourceId: order.id,
            responseStatus: 201,
            responseBody: { orderId: order.id },
          },
        });
        return order.id;
      });

      const created = await this.findUserOrder(input.userId, orderId);
      if (!created) throw new Error("Created order could not be reloaded.");
      return { kind: "created", order: created };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return (
          (await this.replayExisting(
            input.userId,
            input.idempotencyKey,
            input.requestFingerprint,
          )) ?? { kind: "checkout_in_progress" }
        );
      }
      if (error instanceof Error && error.message === "CHECKOUT_CART_CHANGED") {
        return { kind: "cart_changed" };
      }
      if (error instanceof Error && error.message === "CHECKOUT_PROMOTION_CONFLICT") {
        return { kind: "promotion_conflict" };
      }
      if (error instanceof Error && error.message.startsWith("CHECKOUT_STOCK_CONFLICT:")) {
        return { kind: "stock_conflict", variantId: error.message.split(":")[1]! };
      }
      throw error;
    }
  }

  async findUserOrder(userId: string, orderId: string): Promise<OrderRecord | null> {
    return this.database.order.findFirst({ where: { id: orderId, userId }, include: orderInclude });
  }

  async listUserOrders(input: {
    userId: string;
    status?: OrderStatusDto;
    page: number;
    pageSize: number;
  }): Promise<{ items: OrderRecord[]; totalItems: number }> {
    const where = { userId: input.userId, ...(input.status ? { status: input.status } : {}) };
    const [items, totalItems] = await Promise.all([
      this.database.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: orderInclude,
      }),
      this.database.order.count({ where }),
    ]);
    return { items, totalItems };
  }

  private async releaseHeldReservations(
    transaction: Prisma.TransactionClient,
    orderId: string,
    now: Date,
    status: "RELEASED" | "EXPIRED",
  ): Promise<void> {
    const reservations = await transaction.inventoryReservation.findMany({
      where: { orderId, status: "HELD" },
      orderBy: { variantId: "asc" },
    });
    for (const reservation of reservations) {
      const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE "InventoryItem"
        SET "reserved" = "reserved" - ${reservation.quantity},
            "version" = "version" + 1,
            "updatedAt" = ${now}
        WHERE "variantId" = ${reservation.variantId}::uuid
          AND "reserved" >= ${reservation.quantity}
        RETURNING "id"
      `);
      if (rows.length !== 1) throw new Error("INVENTORY_RESERVATION_STATE_INVALID");
      await transaction.inventoryReservation.update({
        where: { id: reservation.id },
        data: {
          status,
          releasedAt: now,
        },
      });
    }
  }

  async cancelUserOrder(input: {
    userId: string;
    orderId: string;
    reason?: string;
    now: Date;
  }): Promise<OrderRecord | null> {
    const changed = await this.database.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: { id: input.orderId, userId: input.userId },
        include: { paymentIntents: true },
      });
      if (!order) return false;
      if (order.status !== "PENDING_PAYMENT" || order.paymentStatus !== "PENDING") {
        throw new Error("ORDER_NOT_CANCELLABLE");
      }
      await this.releaseHeldReservations(transaction, order.id, input.now, "RELEASED");
      await transaction.vendorOrder.updateMany({
        where: { orderId: order.id, status: { in: ["PENDING", "ACCEPTED"] } },
        data: { status: "CANCELLED" },
      });
      await transaction.paymentIntent.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await transaction.promotionRedemption.deleteMany({ where: { orderId: order.id } });
      await transaction.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED", paymentStatus: "CANCELLED", cancelledAt: input.now },
      });
      await writeAuditEntry(transaction, {
        actorType: "USER",
        actorUserId: input.userId,
        action: "order.cancelled",
        entityType: "Order",
        entityId: order.id,
        metadata: input.reason ? { reason: input.reason } : undefined,
      });
      await enqueueOutboxEvent(transaction, {
        aggregateType: "Order",
        aggregateId: order.id,
        eventType: "order.cancelled",
        payload: { orderId: order.id, reason: input.reason ?? null },
      });
      return true;
    });
    if (!changed) return null;
    return this.findUserOrder(input.userId, input.orderId);
  }

  async findVendorOrder(vendorOrderId: string): Promise<VendorOrderRecord | null> {
    return this.database.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: vendorOrderInclude,
    });
  }

  async listStoreVendorOrders(input: {
    storeId: string;
    status?: VendorOrderStatusDto;
    page: number;
    pageSize: number;
  }): Promise<{ items: VendorOrderRecord[]; totalItems: number }> {
    const where = { storeId: input.storeId, ...(input.status ? { status: input.status } : {}) };
    const [items, totalItems] = await Promise.all([
      this.database.vendorOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: vendorOrderInclude,
      }),
      this.database.vendorOrder.count({ where }),
    ]);
    return { items, totalItems };
  }

  async cancelVendorOrder(input: {
    vendorOrderId: string;
    actorUserId: string;
    reason?: string;
    now: Date;
  }): Promise<VendorOrderRecord | null> {
    const changed = await this.database.$transaction(async (transaction) => {
      const vendorOrder = await transaction.vendorOrder.findUnique({
        where: { id: input.vendorOrderId },
        include: { order: true, items: true },
      });
      if (!vendorOrder) return false;
      if (
        vendorOrder.order.status !== "PENDING_PAYMENT" ||
        vendorOrder.order.paymentStatus !== "PENDING" ||
        !["PENDING", "ACCEPTED"].includes(vendorOrder.status)
      ) {
        throw new Error("VENDOR_ORDER_NOT_CANCELLABLE");
      }

      const variantIds = new Set(vendorOrder.items.map((item) => item.variantId));
      const reservations = await transaction.inventoryReservation.findMany({
        where: {
          orderId: vendorOrder.orderId,
          status: "HELD",
          variantId: { in: [...variantIds] },
        },
        orderBy: { variantId: "asc" },
      });
      for (const reservation of reservations) {
        const rows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "InventoryItem"
          SET "reserved" = "reserved" - ${reservation.quantity},
              "version" = "version" + 1,
              "updatedAt" = ${input.now}
          WHERE "variantId" = ${reservation.variantId}::uuid
            AND "reserved" >= ${reservation.quantity}
          RETURNING "id"
        `);
        if (rows.length !== 1) throw new Error("INVENTORY_RESERVATION_STATE_INVALID");
        await transaction.inventoryReservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED", releasedAt: input.now },
        });
      }

      await transaction.vendorOrder.update({
        where: { id: vendorOrder.id },
        data: { status: "CANCELLED" },
      });
      const remaining = await transaction.vendorOrder.findMany({
        where: { orderId: vendorOrder.orderId, id: { not: vendorOrder.id }, status: { not: "CANCELLED" } },
      });
      if (remaining.length === 0) {
        await transaction.paymentIntent.updateMany({
          where: { orderId: vendorOrder.orderId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        await transaction.promotionRedemption.deleteMany({ where: { orderId: vendorOrder.orderId } });
        await transaction.order.update({
          where: { id: vendorOrder.orderId },
          data: { status: "CANCELLED", paymentStatus: "CANCELLED", cancelledAt: input.now },
        });
      } else {
        const itemSubtotalAmountMinor = remaining.reduce(
          (sum, item) => sum + item.itemSubtotalAmountMinor,
          0n,
        );
        const discountAmountMinor = remaining.reduce((sum, item) => sum + item.discountAmountMinor, 0n);
        const deliveryAmountMinor = remaining.reduce((sum, item) => sum + item.deliveryAmountMinor, 0n);
        const taxAmountMinor = remaining.reduce((sum, item) => sum + item.taxAmountMinor, 0n);
        const grandTotalAmountMinor = remaining.reduce((sum, item) => sum + item.totalAmountMinor, 0n);
        await transaction.order.update({
          where: { id: vendorOrder.orderId },
          data: {
            status: "PARTIALLY_CANCELLED",
            itemSubtotalAmountMinor,
            discountAmountMinor,
            deliveryAmountMinor,
            taxAmountMinor,
            grandTotalAmountMinor,
          },
        });
        await transaction.paymentIntent.updateMany({
          where: { orderId: vendorOrder.orderId, status: "PENDING" },
          data: { amountMinor: grandTotalAmountMinor },
        });
      }
      await writeAuditEntry(transaction, {
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "vendor-order.cancelled",
        entityType: "VendorOrder",
        entityId: vendorOrder.id,
        metadata: input.reason ? { reason: input.reason } : undefined,
      });
      await enqueueOutboxEvent(transaction, {
        aggregateType: "VendorOrder",
        aggregateId: vendorOrder.id,
        eventType: "vendor-order.cancelled",
        payload: { vendorOrderId: vendorOrder.id, orderId: vendorOrder.orderId },
      });
      return true;
    });
    if (!changed) return null;
    return this.findVendorOrder(input.vendorOrderId);
  }

  async expireReservations(now: Date, limit = 100): Promise<number> {
    const candidates = await this.database.inventoryReservation.findMany({
      where: { status: "HELD", expiresAt: { lte: now } },
      orderBy: { expiresAt: "asc" },
      take: Math.min(500, Math.max(1, limit)),
      select: { orderId: true },
    });
    const orderIds = [...new Set(candidates.map((item) => item.orderId).filter((id): id is string => Boolean(id)))];
    let expired = 0;
    for (const orderId of orderIds) {
      await this.database.$transaction(async (transaction) => {
        const order = await transaction.order.findUnique({ where: { id: orderId } });
        if (!order || order.status !== "PENDING_PAYMENT") return;
        const before = await transaction.inventoryReservation.count({ where: { orderId, status: "HELD" } });
        await this.releaseHeldReservations(transaction, orderId, now, "EXPIRED");
        if (before === 0) return;
        expired += before;
        await transaction.vendorOrder.updateMany({
          where: { orderId, status: { in: ["PENDING", "ACCEPTED"] } },
          data: { status: "CANCELLED" },
        });
        await transaction.paymentIntent.updateMany({
          where: { orderId, status: "PENDING" },
          data: { status: "CANCELLED" },
        });
        await transaction.promotionRedemption.deleteMany({ where: { orderId } });
        await transaction.order.update({
          where: { id: orderId },
          data: { status: "CANCELLED", paymentStatus: "CANCELLED", cancelledAt: now },
        });
        await enqueueOutboxEvent(transaction, {
          aggregateType: "Order",
          aggregateId: orderId,
          eventType: "order.reservation-expired",
          payload: { orderId, expiredAt: now.toISOString() },
        });
      });
    }
    return expired;
  }
}
