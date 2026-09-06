import { describe, expect, it } from "vitest";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { OrderFulfillmentBoundary } from "../orders/order.fulfillment.js";
import { BuyerLogisticsQueryService } from "./logistics.query.js";
import type { PrismaLogisticsRepository, ShipmentRecord } from "./logistics.repository.js";

const principal: AccessPrincipal = {
  userId: "user-1",
  sessionId: "session-1",
  platformRole: "USER",
  mfaSatisfied: false,
};

function shipmentRecord(): ShipmentRecord {
  return {
    id: "shipment-1",
    vendorOrderId: "vendor-order-1",
    provider: "MANUAL",
    providerShipmentReference: null,
    trackingNumber: "CN-TRACK-1",
    status: "IN_TRANSIT",
    feeAmountMinor: 250000n,
    currency: "NGN",
    deliveredAt: null,
    createdAt: new Date("2026-09-06T06:00:00.000Z"),
    updatedAt: new Date("2026-09-06T06:15:00.000Z"),
    items: [
      { orderItemId: "order-item-1", quantity: 2 },
      { orderItemId: "order-item-2", quantity: 1 },
    ],
    events: [
      {
        id: "event-1",
        shipmentId: "shipment-1",
        status: "IN_TRANSIT",
        providerCode: null,
        message: "Parcel departed hub",
        location: "Lagos",
        metadata: null,
        eventTime: new Date("2026-09-06T06:10:00.000Z"),
        createdAt: new Date("2026-09-06T06:10:00.000Z"),
      },
    ],
  } as unknown as ShipmentRecord;
}

function serviceFor(record: ShipmentRecord) {
  const repository = {
    listVendorOrderShipments: async () => [record],
    findShipment: async () => record,
  } as unknown as PrismaLogisticsRepository;

  const orderBoundary: OrderFulfillmentBoundary = {
    getVendorOrderContext: async () => null,
    listUserOrderVendorOrderIds: async (userId, orderId) =>
      userId === principal.userId && orderId === "order-1" ? [record.vendorOrderId] : null,
    userOwnsVendorOrder: async (userId, vendorOrderId) =>
      userId === principal.userId && vendorOrderId === record.vendorOrderId,
    applyShipmentAggregate: async () => undefined,
  };

  return new BuyerLogisticsQueryService(repository, orderBoundary);
}

describe("BuyerLogisticsQueryService", () => {
  it("maps shipment item allocations into buyer order tracking responses", async () => {
    const result = await serviceFor(shipmentRecord()).listOrderShipments(principal, "order-1");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "shipment-1",
      trackingNumber: "CN-TRACK-1",
      status: "IN_TRANSIT",
      items: [
        { orderItemId: "order-item-1", quantity: 2 },
        { orderItemId: "order-item-2", quantity: 1 },
      ],
      fee: { amountMinor: "250000", currency: "NGN" },
      events: [
        {
          status: "IN_TRANSIT",
          message: "Parcel departed hub",
          location: "Lagos",
        },
      ],
    });
  });

  it("preserves shipment item allocations on single-shipment buyer lookup", async () => {
    const result = await serviceFor(shipmentRecord()).getShipment(principal, "shipment-1");

    expect(result.items).toEqual([
      { orderItemId: "order-item-1", quantity: 2 },
      { orderItemId: "order-item-2", quantity: 1 },
    ]);
  });
});
