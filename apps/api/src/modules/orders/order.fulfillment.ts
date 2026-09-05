import type { DeliveryAddressSnapshotDto, ShipmentStatusDto } from "@repo/contracts";
import type { DatabaseClient } from "@repo/database";

export interface FulfillmentOrderItemContext {
  readonly id: string;
  readonly variantId: string;
  readonly productName: string;
  readonly quantity: number;
}

export interface VendorOrderFulfillmentContext {
  readonly id: string;
  readonly orderId: string;
  readonly storeId: string;
  readonly vendorId: string;
  readonly paymentStatus: string;
  readonly status: string;
  readonly deliveryAddress: DeliveryAddressSnapshotDto;
  readonly items: readonly FulfillmentOrderItemContext[];
}

export interface OrderFulfillmentBoundary {
  getVendorOrderContext(vendorOrderId: string): Promise<VendorOrderFulfillmentContext | null>;
  applyShipmentAggregate(vendorOrderId: string, statuses: readonly ShipmentStatusDto[], now: Date): Promise<void>;
}

export class DatabaseOrderFulfillmentBoundary implements OrderFulfillmentBoundary {
  constructor(private readonly database: DatabaseClient) {}

  async getVendorOrderContext(vendorOrderId: string): Promise<VendorOrderFulfillmentContext | null> {
    const row = await this.database.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: { order: true, items: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      orderId: row.orderId,
      storeId: row.storeId,
      vendorId: row.vendorId,
      paymentStatus: row.order.paymentStatus,
      status: row.status,
      deliveryAddress: row.order.deliveryAddressSnapshot as unknown as DeliveryAddressSnapshotDto,
      items: row.items.map((item) => ({ id: item.id, variantId: item.variantId, productName: item.productNameSnapshot, quantity: item.quantity })),
    };
  }

  async applyShipmentAggregate(vendorOrderId: string, statuses: readonly ShipmentStatusDto[], now: Date): Promise<void> {
    if (statuses.length === 0) return;
    const allDelivered = statuses.every((status) => status === "DELIVERED");
    const anyShipped = statuses.some((status) => ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status));
    const allTerminal = statuses.every((status) => ["DELIVERED", "CANCELLED", "RETURNED"].includes(status));
    const next = allDelivered ? "DELIVERED" : allTerminal ? "PARTIALLY_SHIPPED" : anyShipped ? "PARTIALLY_SHIPPED" : undefined;
    if (!next) return;

    await this.database.$transaction(async (tx) => {
      const vendorOrder = await tx.vendorOrder.update({
        where: { id: vendorOrderId },
        data: { status: next, ...(allDelivered ? { deliveredAt: now } : {}) },
      });
      const siblings = await tx.vendorOrder.findMany({ where: { orderId: vendorOrder.orderId }, select: { status: true } });
      const parentStatus = siblings.every((row) => row.status === "DELIVERED")
        ? "FULFILLED"
        : siblings.some((row) => ["PARTIALLY_SHIPPED", "SHIPPED", "DELIVERED"].includes(row.status))
          ? "PARTIALLY_FULFILLED"
          : undefined;
      if (parentStatus) await tx.order.update({ where: { id: vendorOrder.orderId }, data: { status: parentStatus } });
    });
  }
}
