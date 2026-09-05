import type { ShipmentDto } from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { OrderFulfillmentBoundary } from "../orders/order.fulfillment.js";
import { LogisticsError } from "./logistics.service.js";
import type { PrismaLogisticsRepository, ShipmentRecord } from "./logistics.repository.js";

function money(amountMinor: bigint, currency: string) {
  return { amountMinor: amountMinor.toString(), currency };
}

function mapShipment(record: ShipmentRecord): ShipmentDto {
  return {
    id: record.id,
    vendorOrderId: record.vendorOrderId,
    provider: record.provider,
    providerShipmentReference: record.providerShipmentReference,
    trackingNumber: record.trackingNumber,
    status: record.status,
    fee: record.feeAmountMinor !== null && record.currency ? money(record.feeAmountMinor, record.currency) : null,
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

export class BuyerLogisticsQueryService {
  constructor(
    private readonly repository: PrismaLogisticsRepository,
    private readonly orderBoundary: OrderFulfillmentBoundary,
  ) {}

  async listOrderShipments(principal: AccessPrincipal, orderId: string): Promise<ShipmentDto[]> {
    const vendorOrderIds = await this.orderBoundary.listUserOrderVendorOrderIds(principal.userId, orderId);
    if (!vendorOrderIds) throw new LogisticsError("ORDER_NOT_FOUND", "Order was not found.", 404);
    const groups = await Promise.all(vendorOrderIds.map((id) => this.repository.listVendorOrderShipments(id)));
    return groups.flat().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(mapShipment);
  }

  async getShipment(principal: AccessPrincipal, shipmentId: string): Promise<ShipmentDto> {
    const shipment = await this.repository.findShipment(shipmentId);
    if (!shipment) throw new LogisticsError("SHIPMENT_NOT_FOUND", "Shipment was not found.", 404);
    if (!(await this.orderBoundary.userOwnsVendorOrder(principal.userId, shipment.vendorOrderId))) {
      throw new LogisticsError("SHIPMENT_NOT_FOUND", "Shipment was not found.", 404);
    }
    return mapShipment(shipment);
  }
}
