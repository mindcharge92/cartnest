import type { FulfillmentProfileBodyDto, ShipmentProviderDto, ShipmentStatusDto, VariantShippingProfileBodyDto } from "@repo/contracts";
import { Prisma, type DatabaseClient, enqueueOutboxEvent, writeAuditEntry } from "@repo/database";

const shipmentInclude = { events: { orderBy: { eventTime: "asc" as const } } } satisfies Prisma.ShipmentInclude;
type BaseShipmentRecord = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;
export type ShipmentRecord = BaseShipmentRecord & {
  items: Array<{ orderItemId: string; quantity: number }>;
};

function uniqueRequestedItems(items: readonly { orderItemId: string; quantity: number }[]): boolean {
  return new Set(items.map((item) => item.orderItemId)).size === items.length;
}

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

  findVariantShippingProfile(variantId: string) {
    return this.database.variantShippingProfile.findUnique({ where: { variantId } });
  }

  listVariantProfiles(variantIds: readonly string[]) {
    return this.database.variantShippingProfile.findMany({ where: { variantId: { in: [...variantIds] } } });
  }

  async createQuote(input: {
    userId: string;
    cartId: string;
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
    const cart = await this.database.cart.findFirstOrThrow({
      where: { id: input.cartId, userId: input.userId, status: "ACTIVE" },
      select: { updatedAt: true },
    });
    return this.database.shippingQuote.create({
      data: {
        userId: input.userId,
        cartId: input.cartId,
        cartUpdatedAt: cart.updatedAt,
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

  private async hydrateShipment(record: BaseShipmentRecord): Promise<ShipmentRecord> {
    const items = await this.database.shipmentItem.findMany({
      where: { shipmentId: record.id },
      orderBy: { createdAt: "asc" },
      select: { orderItemId: true, quantity: true },
    });
    return { ...record, items };
  }

  private async hydrateShipments(records: BaseShipmentRecord[]): Promise<ShipmentRecord[]> {
    if (records.length === 0) return [];
    const ids = records.map((record) => record.id);
    const items = await this.database.shipmentItem.findMany({
      where: { shipmentId: { in: ids } },
      orderBy: { createdAt: "asc" },
      select: { shipmentId: true, orderItemId: true, quantity: true },
    });
    const byShipment = new Map<string, Array<{ orderItemId: string; quantity: number }>>();
    for (const item of items) {
      const list = byShipment.get(item.shipmentId) ?? [];
      list.push({ orderItemId: item.orderItemId, quantity: item.quantity });
      byShipment.set(item.shipmentId, list);
    }
    return records.map((record) => ({ ...record, items: byShipment.get(record.id) ?? [] }));
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
    if (!uniqueRequestedItems(input.items)) throw new Error("SHIPMENT_ITEM_DUPLICATE");

    const id = await this.database.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "VendorOrder"
        WHERE "id" = ${input.vendorOrderId}::uuid
        FOR UPDATE
      `);
      if (locked.length !== 1) throw new Error("VENDOR_ORDER_NOT_FOUND");

      const requestedIds = input.items.map((item) => item.orderItemId);
      const ordered = await tx.orderItem.findMany({
        where: { vendorOrderId: input.vendorOrderId, id: { in: requestedIds } },
        select: { id: true, quantity: true },
      });
      if (ordered.length !== requestedIds.length) throw new Error("ORDER_ITEM_NOT_FOUND");

      const allocatedRows = await tx.$queryRaw<Array<{ orderItemId: string; quantity: number }>>(Prisma.sql`
        SELECT si."orderItemId", COALESCE(SUM(si."quantity"), 0)::int AS quantity
        FROM "ShipmentItem" si
        INNER JOIN "Shipment" s ON s."id" = si."shipmentId"
        WHERE s."vendorOrderId" = ${input.vendorOrderId}::uuid
          AND s."status" <> 'CANCELLED'
          AND si."orderItemId" IN (${Prisma.join(requestedIds.map((id) => Prisma.sql`${id}::uuid`))})
        GROUP BY si."orderItemId"
      `);
      const orderedById = new Map(ordered.map((item) => [item.id, item.quantity]));
      const allocatedById = new Map(allocatedRows.map((item) => [item.orderItemId, item.quantity]));
      for (const requested of input.items) {
        const orderedQuantity = orderedById.get(requested.orderItemId);
        if (orderedQuantity === undefined) throw new Error("ORDER_ITEM_NOT_FOUND");
        if ((allocatedById.get(requested.orderItemId) ?? 0) + requested.quantity > orderedQuantity) {
          throw new Error(`SHIPMENT_QUANTITY_EXCEEDED:${requested.orderItemId}`);
        }
      }

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
    const shipment = await this.findShipment(id);
    if (!shipment) throw new Error("Created shipment could not be reloaded.");
    return shipment;
  }

  async findShipment(shipmentId: string): Promise<ShipmentRecord | null> {
    const record = await this.database.shipment.findUnique({ where: { id: shipmentId }, include: shipmentInclude });
    return record ? this.hydrateShipment(record) : null;
  }

  async listVendorOrderShipments(vendorOrderId: string): Promise<ShipmentRecord[]> {
    const records = await this.database.shipment.findMany({ where: { vendorOrderId }, orderBy: { createdAt: "asc" }, include: shipmentInclude });
    return this.hydrateShipments(records);
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
    const shipment = await this.findShipment(input.shipmentId);
    if (!shipment) throw new Error("Shipment could not be reloaded.");
    return shipment;
  }

  async listTrackingCandidates(limit = 100): Promise<ShipmentRecord[]> {
    const records = await this.database.shipment.findMany({
      where: { provider: "GIGL", status: { in: ["BOOKED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "FAILED", "RETURNING"] } },
      orderBy: { updatedAt: "asc" },
      take: limit,
      include: shipmentInclude,
    });
    return this.hydrateShipments(records);
  }
}
