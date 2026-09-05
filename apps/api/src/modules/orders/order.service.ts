import { createHash } from "node:crypto";
import type {
  CancelOrderBodyDto,
  CheckoutBodyDto,
  OrderDto,
  OrderListQueryDto,
  OrderListResponseDto,
  OrderSummaryDto,
  VendorOrderDto,
  VendorOrderListQueryDto,
  VendorOrderListResponseDto,
} from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";
import type {
  CheckoutDraft,
  CheckoutDraftLine,
  OrderRecord,
  OrderRepository,
  VendorOrderRecord,
} from "./order.repository.js";
import type {
  CheckoutFinancialPolicy,
  CheckoutStoreFinancialQuote,
  VendorAcceptancePolicy,
} from "./order.policy.js";

export class OrderError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "OrderError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function money(amountMinor: bigint, currency: string) {
  return { amountMinor: amountMinor.toString(), currency };
}

function attributes(value: unknown): Array<{ optionId: string; optionName: string; valueId: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is { optionId: string; optionName: string; valueId: string; value: string } =>
    Boolean(item && typeof item === "object" && "optionId" in item && typeof item.optionId === "string" && "optionName" in item && typeof item.optionName === "string" && "valueId" in item && typeof item.valueId === "string" && "value" in item && typeof item.value === "string"),
  );
}

function mapVendorOrder(record: VendorOrderRecord | OrderRecord["vendorOrders"][number]): VendorOrderDto {
  return {
    id: record.id,
    orderId: record.orderId,
    vendorId: record.vendorId,
    store: { id: record.store.id, name: record.store.name, slug: record.store.slug, vendorDisplayName: record.store.vendor.displayName },
    status: record.status,
    itemSubtotal: money(record.itemSubtotalAmountMinor, record.currency),
    discount: money(record.discountAmountMinor, record.currency),
    delivery: money(record.deliveryAmountMinor, record.currency),
    tax: money(record.taxAmountMinor, record.currency),
    commissionRateBps: record.commissionRateBps,
    commission: money(record.commissionAmountMinor, record.currency),
    gatewayFee: money(record.gatewayFeeAmountMinor, record.currency),
    total: money(record.totalAmountMinor, record.currency),
    items: record.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productNameSnapshot,
      sku: item.skuSnapshot,
      variantAttributes: attributes(item.variantAttributesSnapshot),
      unitPrice: money(item.unitPriceAmountMinor, item.currency),
      quantity: item.quantity,
      subtotal: money(item.subtotalAmountMinor, item.currency),
      discount: money(item.discountAmountMinor, item.currency),
      tax: money(item.taxAmountMinor, item.currency),
      lineTotal: money(item.lineTotalAmountMinor, item.currency),
      createdAt: item.createdAt.toISOString(),
    })),
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    deliveredAt: record.deliveredAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapOrder(record: OrderRecord): OrderDto {
  const paymentIntent = record.paymentIntents[0];
  if (!paymentIntent) throw new Error("Order has no payment intent.");
  const held = record.reservations.filter((reservation) => reservation.status === "HELD");
  const reservationExpiresAt = held.length
    ? new Date(Math.min(...held.map((reservation) => reservation.expiresAt.getTime()))).toISOString()
    : null;
  return {
    id: record.id,
    orderNumber: record.orderNumber,
    status: record.status,
    paymentStatus: record.paymentStatus,
    currency: record.currency,
    itemSubtotal: money(record.itemSubtotalAmountMinor, record.currency),
    discount: money(record.discountAmountMinor, record.currency),
    delivery: money(record.deliveryAmountMinor, record.currency),
    tax: money(record.taxAmountMinor, record.currency),
    grandTotal: money(record.grandTotalAmountMinor, record.currency),
    deliveryAddress: record.deliveryAddressSnapshot as OrderDto["deliveryAddress"],
    vendorOrders: record.vendorOrders.map(mapVendorOrder),
    paymentIntent: {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: money(paymentIntent.amountMinor, paymentIntent.currency),
      createdAt: paymentIntent.createdAt.toISOString(),
      updatedAt: paymentIntent.updatedAt.toISOString(),
    },
    reservationExpiresAt,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  };
}

function summary(record: OrderRecord): OrderSummaryDto {
  return {
    id: record.id,
    orderNumber: record.orderNumber,
    status: record.status,
    paymentStatus: record.paymentStatus,
    grandTotal: money(record.grandTotalAmountMinor, record.currency),
    vendorOrderCount: record.vendorOrders.length,
    createdAt: record.createdAt.toISOString(),
  };
}

function fingerprint(body: CheckoutBodyDto): string {
  const a = body.deliveryAddress;
  return createHash("sha256").update(JSON.stringify({
    recipientName: a.recipientName, phone: a.phone, line1: a.line1, line2: a.line2 ?? null,
    city: a.city, state: a.state, postalCode: a.postalCode ?? null, countryCode: a.countryCode,
    promotionCode: body.promotionCode?.trim().toUpperCase() ?? null,
  })).digest("hex");
}

function assertQuote(quote: CheckoutStoreFinancialQuote, subtotal: bigint): void {
  if (quote.discountAmountMinor < 0n || quote.deliveryAmountMinor < 0n || quote.taxAmountMinor < 0n || quote.commissionAmountMinor < 0n || quote.commissionRateBps < 0 || quote.commissionRateBps > 10000 || quote.discountAmountMinor > subtotal) {
    throw new OrderError("CHECKOUT_POLICY_INVALID", "Checkout financial policy returned an invalid quote.", 500);
  }
}

function groupDraft(draft: CheckoutDraft): Map<string, CheckoutDraftLine[]> {
  const groups = new Map<string, CheckoutDraftLine[]>();
  for (const line of draft.lines) {
    const items = groups.get(line.storeId) ?? [];
    items.push(line);
    groups.set(line.storeId, items);
  }
  return groups;
}

function policyError(error: unknown): never {
  if (!(error instanceof Error)) throw error;
  switch (error.message) {
    case "SHIPPING_QUOTE_REQUIRED":
      throw new OrderError("SHIPPING_QUOTE_REQUIRED", "Generate a valid shipping quote for every store before checkout.", 409);
    case "PROMOTION_INVALID":
      throw new OrderError("PROMOTION_INVALID", "The promotion code is invalid or inactive.", 409);
    case "PROMOTION_MINIMUM_NOT_MET":
      throw new OrderError("PROMOTION_MINIMUM_NOT_MET", "The cart does not meet the promotion minimum.", 409);
    case "PROMOTION_EXHAUSTED":
      throw new OrderError("PROMOTION_EXHAUSTED", "This promotion has reached its redemption limit.", 409);
    case "PROMOTION_USER_LIMIT_REACHED":
      throw new OrderError("PROMOTION_USER_LIMIT_REACHED", "You have reached the redemption limit for this promotion.", 409);
    case "TAX_RATE_REQUIRED":
      throw new OrderError("CHECKOUT_TAX_CONFIGURATION_REQUIRED", "Checkout tax configuration is unavailable.", 503);
    case "COMMISSION_RULE_REQUIRED":
      throw new OrderError("CHECKOUT_COMMISSION_CONFIGURATION_REQUIRED", "Checkout commission configuration is unavailable.", 503);
    default:
      throw error;
  }
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly vendorBoundary: VendorOwnershipBoundary,
    private readonly financialPolicy: CheckoutFinancialPolicy,
    private readonly acceptancePolicy: VendorAcceptancePolicy,
  ) {}

  async checkout(principal: AccessPrincipal, body: CheckoutBodyDto, idempotencyKey: string): Promise<{ statusCode: 200 | 201; order: OrderDto }> {
    const draft = await this.repository.getCheckoutDraft(principal.userId);
    if (!draft || draft.lines.length === 0) throw new OrderError("CART_EMPTY", "The active cart is empty.", 409);
    if (draft.lines.some((line) => line.currency !== "NGN")) throw new OrderError("UNSUPPORTED_CURRENCY", "Checkout currently supports NGN only.", 400);

    const storeQuotes = [];
    for (const [storeId, lines] of groupDraft(draft)) {
      const first = lines[0]!;
      const subtotal = lines.reduce((sum, line) => sum + line.unitPriceAmountMinor * BigInt(line.quantity), 0n);
      let quote: CheckoutStoreFinancialQuote;
      try {
        quote = await this.financialPolicy.quoteStore({
          userId: principal.userId,
          cartId: draft.cartId,
          vendorId: first.vendorId,
          storeId,
          currency: first.currency,
          deliveryAddress: body.deliveryAddress,
          ...(body.promotionCode ? { promotionCode: body.promotionCode } : {}),
          itemSubtotalAmountMinor: subtotal,
          lines: lines.map((line) => ({
            productId: line.productId,
            categoryId: line.categoryId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPriceAmountMinor: line.unitPriceAmountMinor,
          })),
        });
      } catch (error) {
        policyError(error);
      }
      assertQuote(quote, subtotal);
      storeQuotes.push({ storeId, vendorId: first.vendorId, quote, acceptanceMode: await this.acceptancePolicy.modeForStore(storeId) });
    }

    const result = await this.repository.createCheckout({
      userId: principal.userId,
      idempotencyKey,
      requestFingerprint: fingerprint(body),
      deliveryAddress: body.deliveryAddress,
      draft,
      storeQuotes,
      now: new Date(),
    });

    if (result.kind === "created") return { statusCode: 201, order: mapOrder(result.order) };
    if (result.kind === "replayed") return { statusCode: 200, order: mapOrder(result.order) };
    if (result.kind === "idempotency_conflict") throw new OrderError("IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used with a different checkout request.", 409);
    if (result.kind === "checkout_in_progress") throw new OrderError("CHECKOUT_IN_PROGRESS", "This checkout request is already being processed.", 409);
    if (result.kind === "stock_conflict") throw new OrderError("INSUFFICIENT_STOCK", `Stock changed while checkout was being created for variant ${result.variantId}.`, 409);
    if (result.kind === "promotion_conflict") throw new OrderError("PROMOTION_REVALIDATION_REQUIRED", "Promotion availability changed during checkout. Refresh and try again.", 409);
    throw new OrderError("CHECKOUT_REVALIDATION_REQUIRED", "The cart changed during checkout. Refresh the cart and try again.", 409);
  }

  async listOrders(principal: AccessPrincipal, query: OrderListQueryDto): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.repository.listUserOrders({ userId: principal.userId, ...(query.status ? { status: query.status } : {}), page, pageSize });
    return { items: result.items.map(summary), pagination: { page, pageSize, totalItems: result.totalItems, totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / pageSize) } };
  }

  async getOrder(principal: AccessPrincipal, orderId: string): Promise<OrderDto> {
    const order = await this.repository.findUserOrder(principal.userId, orderId);
    if (!order) throw new OrderError("ORDER_NOT_FOUND", "Order was not found.", 404);
    return mapOrder(order);
  }

  async cancelOrder(principal: AccessPrincipal, orderId: string, body: CancelOrderBodyDto): Promise<OrderDto> {
    try {
      const order = await this.repository.cancelUserOrder({ userId: principal.userId, orderId, ...(body.reason ? { reason: body.reason } : {}), now: new Date() });
      if (!order) throw new OrderError("ORDER_NOT_FOUND", "Order was not found.", 404);
      return mapOrder(order);
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_CANCELLABLE") throw new OrderError("ORDER_NOT_CANCELLABLE", "Only an unpaid order with a pending payment can be cancelled directly.", 409);
      throw error;
    }
  }

  async listStoreVendorOrders(principal: AccessPrincipal, storeId: string, query: VendorOrderListQueryDto): Promise<VendorOrderListResponseDto> {
    await this.vendorBoundary.requireStorePermission(principal, storeId, "order:read");
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const result = await this.repository.listStoreVendorOrders({ storeId, ...(query.status ? { status: query.status } : {}), page, pageSize });
    return { items: result.items.map(mapVendorOrder), pagination: { page, pageSize, totalItems: result.totalItems, totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / pageSize) } };
  }

  async getVendorOrder(principal: AccessPrincipal, vendorOrderId: string): Promise<VendorOrderDto> {
    const order = await this.repository.findVendorOrder(vendorOrderId);
    if (!order) throw new OrderError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, order.storeId, "order:read");
    return mapVendorOrder(order);
  }

  async cancelVendorOrder(principal: AccessPrincipal, vendorOrderId: string, body: CancelOrderBodyDto): Promise<VendorOrderDto> {
    const existing = await this.repository.findVendorOrder(vendorOrderId);
    if (!existing) throw new OrderError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, existing.storeId, "order:process");
    try {
      const changed = await this.repository.cancelVendorOrder({ vendorOrderId, actorUserId: principal.userId, ...(body.reason ? { reason: body.reason } : {}), now: new Date() });
      if (!changed) throw new OrderError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
      return mapVendorOrder(changed);
    } catch (error) {
      if (error instanceof Error && error.message === "VENDOR_ORDER_NOT_CANCELLABLE") throw new OrderError("VENDOR_ORDER_NOT_CANCELLABLE", "This vendor order cannot be cancelled in its current payment/fulfillment state.", 409);
      throw error;
    }
  }

  async expireReservations(now = new Date(), limit = 100): Promise<number> {
    return this.repository.expireReservations(now, limit);
  }
}
