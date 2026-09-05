import { Prisma, type DatabaseClient } from "@repo/database";

export class ShipmentAllocationStore {
  constructor(private readonly database: DatabaseClient) {}

  async allocatedQuantities(vendorOrderId: string): Promise<Map<string, number>> {
    const rows = await this.database.$queryRaw<Array<{ orderItemId: string; quantity: number }>>(Prisma.sql`
      SELECT si."orderItemId", COALESCE(SUM(si."quantity"), 0)::int AS quantity
      FROM "ShipmentItem" si
      INNER JOIN "Shipment" s ON s."id" = si."shipmentId"
      WHERE s."vendorOrderId" = ${vendorOrderId}::uuid
        AND s."status" <> 'CANCELLED'
      GROUP BY si."orderItemId"
    `);
    return new Map(rows.map((row) => [row.orderItemId, row.quantity]));
  }
}
