import type { FulfillmentProfileBodyDto, ShipmentProviderDto, ShipmentStatusDto, VariantShippingProfileBodyDto } from "@repo/contracts";
import { Prisma, type DatabaseClient, enqueueOutboxEvent, writeAuditEntry } from "@repo/database";

const shipmentInclude = { events: { orderBy: { eventTime: "asc" as const } } } satisfies Prisma.ShipmentInclude;
export type ShipmentRecord = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;

export class PrismaLogisticsRepository {
  constructor(private readonly database: DatabaseClient) {}

  upsertFulfillmentProfile(storeId: string, body: FulfillmentProfileBodyDto) {
    return this.database.storeFulfillmentProfile.upsert({
      where: { storeId },
      create: {
        storeId,
        defaultProvider: body.defaultProvider,
        manualDeliveryEnabled: body.manualDeliveryEnabled,
        manualDeliveryFeeAmountMinor: body.manualDeliveryFeeAmountMinor ? BigInt(body.manualDeliveryFeeAmountMinor) : null,
        currency: body.currency,
        originAddress: body.originAddress as Prisma.InputJsonValue,
        ...(body.giglStationId ? { giglStationId: body.giglStationId } : {}),
        active: body.active ?? true,
      },
      update: {
        defaultProvider: body.defaultProvider,
        manualDeliveryEnabled: body.manualDeliveryEnabled,
        manualDeliveryFeeAmountMinor: body.manualDeliveryFeeAmountMinor ? BigInt(body.manualDeliveryFeeAmountMinor) : null,
        currency: body.currency,
        originAddress: body.originAddress as Prisma.InputJsonValue,
        giglStationId: body.giglStationId ?? null,
        active: body.active ?? true,
      },
    });
  }

  findFulfillmentProfile(storeId: string) {
    return this.database.storeFulfillmentProfile.findUnique({ where: { storeId } });
  }

  upsertVariantShippingProfile(variantId: string, body: VariantShippingProfileBodyDto) {
    const data = {
      weightGrams: body.weightGrams,
      pieces: body.pieces ?? 1,
      lengthMm: body.lengthMm ?? null,
      widthMm: body.widthMm ?? null,
      heightMm: body.heightMm ?? null,
    };
    return this.database.variantShippingProfile.upsert({
      where: { variantId },
      create: { variantId, ...data },
      update: data,
    });
  }

  listVariantProfiles(variantIds: readonly string[]) {
    return this.database.variantShippingProfile.findMany({ where: { variantId: { in: [...variantIds] } } });
  }

  async createQuote(input: {
    userId: string;
    cartId: string;
    cartUpdatedAt: Date;
    storeId: string;
    provider: ShipmentProviderDto;
    amountMinor: bigint;
    currency: string;
    serviceCode?: string;
    providerQuoteReference?: string;
    requestFingerprint: string;
    expiresAt: Date;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.database.shippingQuote.create({
      data: {
        userId: input.userId,
        cartId: input.cartId,
        cartUpdatedAt: input.cartUpdatedAt,
        storeId: input.storeId,
        provider: input.provider,
        amountMinor: input.amountMinor,
        currency: input.currency,
        ...(input.serviceCode ? { serviceCode: input.serviceCode } : {}),
        ...(input.providerQuoteReference ? { providerQuoteReference: input.providerQuoteReference } : {}),
        requestFingerprint: input.requestFingerprint,
        expiresAt: input.expiresAt,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      },
    });
  }

  async findLatestValidQuote(input: {
    userId: string;
    cartId: string;
    storeId: string;
    requestFingerprint: string;
    now: Date;
  }) {
    const cart = await this.database.cart.findFirst({
      where: { id: input.cartId, userId: input.userId, status: "ACTIVE" },
      select: { updatedAt: true },
    });
    if (!cart) return null;
    return this.database.shippingQuote.findFirst({
      where: {
        userId: input.userId,
        cartId: input.cartId,
        cartUpdatedAt: cart.updatedAt,
        storeId: input.storeId,
        requestFingerprint: input.requestFingerprint,
        expiresAt: { gt: input.now },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createShipment(input: {
    vendorOrderId: string;
    provider: ShipmentProviderDto;
    providerShipmentReference?: string;
    trackingNumber?: string;
    feeAmountMinor?: bigint;
    currency?: string;
    metadata?: Prisma.InputJsonValue;
    items: readonly { orderItemId: string; quantity: number }[];
    actorUserId: string;
    now: Date;
  }): Promise<ShipmentRecord> {
    const id = await this.database.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          vendorOrderId: input.vendorOrderId,
          provider: input.provider,
          ...(input.providerShipmentReference ? { providerShipmentReference: input.providerShipmentReference } : {}),
          ...(input.trackingNumber ? { trackingNumber: input.trackingNumber } : {}),
          status: input.provider === "MANUAL" ? "BOOKED" : "PENDING",
          ...(input.feeAmountMinor !== undefined ? { feeAmountMinor: input.feeAmountMinor } : {}),
          ...(input.currency ? { currency: input.currency } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
      });
      for (const item of input.items) {
        await tx.shipmentItem.create({ data: { shipmentId: shipment.id, orderItemId: item.orderItemId, quantity: item.quantity } });
      }
      await tx.shipmentEvent.create({
        data: { shipmentId: shipment.id, status: shipment.status, message: "Shipment created", eventTime: input.now },
      });
      await writeAuditEntry(tx, {
        actorType: "USER",
        actorUserId: input.actorUserId,
        action: "shipment.created",
        entityType: "Shipment",
        entityId: shipment.id,
        metadata: { vendorOrderId: input.vendorOrderId, provider: input.provider },
      });
      await enqueueOutboxEvent(tx, {
        aggregateType: "Shipment",
        aggregateId: shipment.id,
        eventType: "shipment.created",
        payload: { shipmentId: shipment.id, vendorOrderId: input.vendorOrderId, provider: input.provider },
      });
      return shipment.id;
    });
    return this.database.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
  }

  findShipment(shipmentId: string): Promise<ShipmentRecord | null> {
    return this.database.shipment.findUnique({ where: { id: shipmentId }, include: shipmentInclude });
  }

  listVendorOrderShipments(vendorOrderId: string): Promise<ShipmentRecord[]> {
    return this.database.shipment.findMany({ where: { vendorOrderId }, orderBy: { createdAt: "asc" }, include: shipmentInclude });
  }

  async appendShipmentEvent(input: {
    shipmentId: string;
    status: ShipmentStatusDto;
    message?: string;
    location?: string;
    eventTime: Date;
    providerReference?: string;
    trackingNumber?: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<ShipmentRecord> {
    await this.database.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: input.shipmentId },
        data: {
          status: input.status,
          ...(input.providerReference ? { providerShipmentReference: input.providerReference } : {}),
          ...(input.trackingNumber ? { trackingNumber: input.trackingNumber } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
          ...(input.status === "DELIVERED" ? { deliveredAt: input.eventTime } : {}),
        },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: input.shipmentId,
          status: input.status,
          ...(input.message ? { message: input.message } : {}),
          ...(input.location ? { location: input.location } : {}),
          eventTime: input.eventTime,
        },
      });
      await enqueueOutboxEvent(tx, {
        aggregateType: "Shipment",
        aggregateId: input.shipmentId,
        eventType: "shipment.status_changed",
        payload: { shipmentId: input.shipmentId, status: input.status, eventTime: input.eventTime.toISOString() },
      });
    });
    return this.database.shipment.findUniqueOrThrow({ where: { id: input.shipmentId }, include: shipmentInclude });
  }

  listTrackingCandidates(limit = 100) {
    return this.database.shipment.findMany({
      where: { provider: "GIGL", status: { in: ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "RETURNING"] } },
      orderBy: { updatedAt: "asc" },
      take: limit,
      include: shipmentInclude,
    });
  }
}
