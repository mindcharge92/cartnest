import { createHash } from "node:crypto";
import type {
  CreateShipmentBodyDto,
  FulfillmentProfileBodyDto,
  ShipmentDto,
  ShippingQuoteRequestDto,
  ShippingQuoteResponseDto,
  VariantShippingProfileBodyDto,
} from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { CartService } from "../cart/cart.service.js";
import type { CatalogCommerceBoundary } from "../catalog/catalog.public.js";
import type { CheckoutFinancialPolicy, CheckoutStoreFinancialQuote, CheckoutStorePolicyInput } from "../orders/order.policy.js";
import type { OrderFulfillmentBoundary } from "../orders/order.fulfillment.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";
import { ShipmentAllocationStore } from "./logistics.allocation.js";
import type { LogisticsProviderAdapter, LogisticsQuoteItem } from "./logistics.provider.js";
import { PrismaLogisticsRepository, type ShipmentRecord } from "./logistics.repository.js";

export class LogisticsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "LogisticsError";
  }
}

function addressFingerprint(address: ShippingQuoteRequestDto["deliveryAddress"]): string {
  return createHash("sha256").update(JSON.stringify({
    recipientName: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode ?? null,
    countryCode: address.countryCode,
  })).digest("hex");
}

function mapShipment(record: ShipmentRecord): ShipmentDto {
  return {
    id: record.id,
    vendorOrderId: record.vendorOrderId,
    provider: record.provider,
    providerShipmentReference: record.providerShipmentReference,
    trackingNumber: record.trackingNumber,
    status: record.status,
    fee: record.feeAmountMinor !== null && record.currency
      ? { amountMinor: record.feeAmountMinor.toString(), currency: record.currency }
      : null,
    deliveredAt: record.deliveredAt?.toISOString() ?? null,
    events: record.events.map((event) => ({
      id: event.id,
      status: event.status,
      message: event.message,
      location: event.location,
      eventTime: event.eventTime.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class LogisticsService {
  private readonly adapters = new Map<string, LogisticsProviderAdapter>();

  constructor(
    private readonly repository: PrismaLogisticsRepository,
    private readonly allocationStore: ShipmentAllocationStore,
    private readonly vendorBoundary: VendorOwnershipBoundary,
    private readonly orderBoundary: OrderFulfillmentBoundary,
    private readonly cartService: CartService,
    private readonly catalogBoundary: CatalogCommerceBoundary,
    adapters: readonly LogisticsProviderAdapter[],
  ) {
    for (const adapter of adapters) this.adapters.set(adapter.provider, adapter);
  }

  async updateStoreProfile(principal: AccessPrincipal, storeId: string, body: FulfillmentProfileBodyDto) {
    await this.vendorBoundary.requireStorePermission(principal, storeId, "store:update");
    if (body.defaultProvider === "GIGL" && !body.giglStationId) {
      throw new LogisticsError("GIGL_STATION_REQUIRED", "A GIGL sender station is required when GIGL is the default provider.", 400);
    }
    if (body.defaultProvider === "MANUAL" && !body.manualDeliveryEnabled) {
      throw new LogisticsError("MANUAL_DELIVERY_DISABLED", "Manual delivery cannot be the default while it is disabled.", 400);
    }
    return this.repository.upsertFulfillmentProfile(storeId, body);
  }

  async updateVariantProfile(principal: AccessPrincipal, variantId: string, body: VariantShippingProfileBodyDto) {
    const variant = await this.catalogBoundary.findVariantContext(variantId);
    if (!variant) throw new LogisticsError("VARIANT_NOT_FOUND", "Variant was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, variant.storeId, "product:update");
    return this.repository.upsertVariantShippingProfile(variantId, body);
  }

  async quoteCart(principal: AccessPrincipal, body: ShippingQuoteRequestDto): Promise<ShippingQuoteResponseDto> {
    const cart = await this.cartService.getCart(principal);
    if (cart.items.length === 0) throw new LogisticsError("CART_EMPTY", "The active cart is empty.", 409);
    const fingerprint = addressFingerprint(body.deliveryAddress);
    const groups = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      const list = groups.get(item.product.store.id) ?? [];
      list.push(item);
      groups.set(item.product.store.id, list);
    }

    const result: ShippingQuoteResponseDto["groups"] = [];
    for (const [storeId, items] of groups) {
      const profile = await this.repository.findFulfillmentProfile(storeId);
      if (!profile || !profile.active) {
        throw new LogisticsError("FULFILLMENT_PROFILE_REQUIRED", `Store ${storeId} has no active fulfillment profile.`, 409);
      }
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      if (profile.defaultProvider === "MANUAL") {
        if (!profile.manualDeliveryEnabled || profile.manualDeliveryFeeAmountMinor === null) {
          throw new LogisticsError("MANUAL_DELIVERY_NOT_CONFIGURED", `Store ${storeId} has no manual delivery fee.`, 409);
        }
        const quote = await this.repository.createQuote({
          userId: principal.userId,
          cartId: cart.id,
          storeId,
          provider: "MANUAL",
          amountMinor: profile.manualDeliveryFeeAmountMinor,
          currency: profile.currency,
          serviceCode: "MANUAL",
          requestFingerprint: fingerprint,
          expiresAt,
        });
        result.push({
          storeId,
          quotes: [{ id: quote.id, storeId, provider: "MANUAL", amount: { amountMinor: quote.amountMinor.toString(), currency: quote.currency }, serviceCode: "MANUAL", expiresAt: quote.expiresAt.toISOString() }],
        });
        continue;
      }

      const adapter = this.adapters.get("GIGL");
      if (!adapter) throw new LogisticsError("GIGL_UNAVAILABLE", "GIGL is not configured.", 503);
      if (!body.receiverStationId || !profile.giglStationId) {
        throw new LogisticsError("GIGL_STATION_REQUIRED", "Sender and receiver GIGL stations are required for this quote.", 400);
      }
      const shippingProfiles = await this.repository.listVariantProfiles(items.map((item) => item.variant.id));
      const byVariant = new Map(shippingProfiles.map((entry) => [entry.variantId, entry]));
      const quoteItems: LogisticsQuoteItem[] = items.map((item) => {
        const shipping = byVariant.get(item.variant.id);
        if (!shipping) throw new LogisticsError("VARIANT_SHIPPING_PROFILE_REQUIRED", `Variant ${item.variant.id} has no shipping profile.`, 409);
        return {
          variantId: item.variant.id,
          productName: item.product.name,
          quantity: item.quantity,
          weightGrams: shipping.weightGrams,
          ...(shipping.lengthMm ? { lengthMm: shipping.lengthMm } : {}),
          ...(shipping.widthMm ? { widthMm: shipping.widthMm } : {}),
          ...(shipping.heightMm ? { heightMm: shipping.heightMm } : {}),
        };
      });
      const providerQuote = await adapter.quote({
        senderStationId: profile.giglStationId,
        receiverStationId: body.receiverStationId,
        origin: profile.originAddress as ShippingQuoteRequestDto["deliveryAddress"],
        destination: body.deliveryAddress,
        items: quoteItems,
        declaredValueMinor: items.reduce((sum, item) => sum + BigInt(item.lineSubtotal.amountMinor), 0n),
        currency: profile.currency,
      });
      const quote = await this.repository.createQuote({
        userId: principal.userId,
        cartId: cart.id,
        storeId,
        provider: "GIGL",
        amountMinor: providerQuote.amountMinor,
        currency: providerQuote.currency,
        serviceCode: providerQuote.serviceCode,
        providerQuoteReference: providerQuote.providerQuoteReference,
        requestFingerprint: fingerprint,
        expiresAt,
        metadata: providerQuote.metadata,
      });
      result.push({
        storeId,
        quotes: [{ id: quote.id, storeId, provider: "GIGL", amount: { amountMinor: quote.amountMinor.toString(), currency: quote.currency }, serviceCode: quote.serviceCode, expiresAt: quote.expiresAt.toISOString() }],
      });
    }
    return { groups: result };
  }

  async resolveCheckoutDelivery(input: CheckoutStorePolicyInput): Promise<bigint> {
    const quote = await this.repository.findLatestValidQuote({
      userId: input.userId,
      cartId: input.cartId,
      storeId: input.storeId,
      requestFingerprint: addressFingerprint(input.deliveryAddress),
      now: new Date(),
    });
    if (!quote || quote.currency !== input.currency) throw new Error("SHIPPING_QUOTE_REQUIRED");
    return quote.amountMinor;
  }

  async createShipment(principal: AccessPrincipal, vendorOrderId: string, body: CreateShipmentBodyDto): Promise<ShipmentDto> {
    const context = await this.orderBoundary.getVendorOrderContext(vendorOrderId);
    if (!context) throw new LogisticsError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "order:fulfill");
    if (context.paymentStatus !== "SUCCEEDED") throw new LogisticsError("PAYMENT_REQUIRED", "Shipment creation requires verified payment.", 409);
    if (["CANCELLED", "REFUNDED"].includes(context.status)) throw new LogisticsError("VENDOR_ORDER_NOT_FULFILLABLE", "This vendor order cannot be fulfilled.", 409);

    const allocated = await this.allocationStore.allocatedQuantities(vendorOrderId);
    const orderItems = new Map(context.items.map((item) => [item.id, item]));
    for (const requested of body.items) {
      const item = orderItems.get(requested.orderItemId);
      if (!item) throw new LogisticsError("ORDER_ITEM_NOT_FOUND", "A requested shipment item does not belong to this vendor order.", 400);
      if ((allocated.get(item.id) ?? 0) + requested.quantity > item.quantity) {
        throw new LogisticsError("SHIPMENT_QUANTITY_EXCEEDED", `Shipment quantity exceeds remaining quantity for order item ${item.id}.`, 409);
      }
    }

    if (body.provider === "GIGL") {
      throw new LogisticsError(
        "GIGL_CREATION_REQUIRES_SANDBOX_CONFIRMATION",
        "GIGL booking is intentionally gated until CartNest's contracted preshipment payload is verified in sandbox.",
        503,
      );
    }

    const shipment = await this.repository.createShipment({
      vendorOrderId,
      provider: "MANUAL",
      trackingNumber: body.trackingNumber,
      metadata: body.note ? { note: body.note } : undefined,
      items: body.items,
      actorUserId: principal.userId,
      now: new Date(),
    });
    return mapShipment(shipment);
  }

  async listShipments(principal: AccessPrincipal, vendorOrderId: string): Promise<ShipmentDto[]> {
    const context = await this.orderBoundary.getVendorOrderContext(vendorOrderId);
    if (!context) throw new LogisticsError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "order:read");
    return (await this.repository.listVendorOrderShipments(vendorOrderId)).map(mapShipment);
  }

  async getShipment(principal: AccessPrincipal, shipmentId: string): Promise<ShipmentDto> {
    const shipment = await this.repository.findShipment(shipmentId);
    if (!shipment) throw new LogisticsError("SHIPMENT_NOT_FOUND", "Shipment was not found.", 404);
    const context = await this.orderBoundary.getVendorOrderContext(shipment.vendorOrderId);
    if (!context) throw new LogisticsError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "order:read");
    return mapShipment(shipment);
  }

  async recordManualStatus(principal: AccessPrincipal, shipmentId: string, status: ShipmentDto["status"], message?: string): Promise<ShipmentDto> {
    const shipment = await this.repository.findShipment(shipmentId);
    if (!shipment) throw new LogisticsError("SHIPMENT_NOT_FOUND", "Shipment was not found.", 404);
    if (shipment.provider !== "MANUAL") throw new LogisticsError("MANUAL_STATUS_ONLY", "Only manual shipments accept vendor-entered status updates.", 409);
    const context = await this.orderBoundary.getVendorOrderContext(shipment.vendorOrderId);
    if (!context) throw new LogisticsError("VENDOR_ORDER_NOT_FOUND", "Vendor order was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, context.storeId, "order:fulfill");
    const changed = await this.repository.appendShipmentEvent({ shipmentId, status, message, eventTime: new Date() });
    const siblings = await this.repository.listVendorOrderShipments(shipment.vendorOrderId);
    await this.orderBoundary.applyShipmentAggregate(shipment.vendorOrderId, siblings.map((entry) => entry.id === changed.id ? changed.status : entry.status), new Date());
    return mapShipment(changed);
  }

  async syncGiglTracking(limit = 100): Promise<number> {
    const adapter = this.adapters.get("GIGL");
    if (!adapter) return 0;
    let changed = 0;
    for (const shipment of await this.repository.listTrackingCandidates(limit)) {
      const reference = shipment.trackingNumber ?? shipment.providerShipmentReference;
      if (!reference) continue;
      try {
        const tracking = await adapter.trackShipment(reference);
        if (tracking.status === shipment.status) continue;
        await this.repository.appendShipmentEvent({
          shipmentId: shipment.id,
          status: tracking.status,
          message: tracking.message,
          location: tracking.location,
          eventTime: tracking.eventTime,
          metadata: tracking.metadata,
        });
        const siblings = await this.repository.listVendorOrderShipments(shipment.vendorOrderId);
        await this.orderBoundary.applyShipmentAggregate(shipment.vendorOrderId, siblings.map((entry) => entry.id === shipment.id ? tracking.status : entry.status), new Date());
        changed += 1;
      } catch {
        // Tracking outages are retryable; the shipment state remains unchanged.
      }
    }
    return changed;
  }
}

export class LogisticsAwareCheckoutFinancialPolicy implements CheckoutFinancialPolicy {
  constructor(
    private readonly base: CheckoutFinancialPolicy,
    private readonly logistics: LogisticsService,
  ) {}

  async quoteStore(input: CheckoutStorePolicyInput): Promise<CheckoutStoreFinancialQuote> {
    const base = await this.base.quoteStore(input);
    return { ...base, deliveryAmountMinor: await this.logistics.resolveCheckoutDelivery(input) };
  }
}
