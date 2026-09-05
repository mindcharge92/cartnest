import type { AdminOrderOperationsDetailDto } from "@repo/contracts";
import type { DatabaseClient } from "@repo/database";
import {
  requirePlatformRole,
  requirePrivilegedMfa,
  type AccessPrincipal,
} from "../auth/auth.public.js";
import { AdminError } from "./admin.service.js";

function money(amountMinor: bigint, currency: string) {
  return { amountMinor: amountMinor.toString(), currency };
}

/**
 * Operational case view used by administrators to explain an order's
 * commercial state without direct database access.
 */
export class AdminOperationsService {
  constructor(private readonly database: DatabaseClient) {}

  private requireAdmin(principal: AccessPrincipal): void {
    requirePlatformRole(principal, ["ADMIN", "SUPER_ADMIN"]);
    requirePrivilegedMfa(principal);
  }

  async getOrderOperations(
    principal: AccessPrincipal,
    orderId: string,
  ): Promise<AdminOrderOperationsDetailDto> {
    this.requireAdmin(principal);
    const order = await this.database.order.findUnique({
      where: { id: orderId },
      include: {
        vendorOrders: {
          orderBy: { createdAt: "asc" },
          include: {
            refunds: { orderBy: { createdAt: "asc" } },
            shipments: { orderBy: { createdAt: "asc" } },
            returns: { orderBy: { requestedAt: "asc" } },
          },
        },
        paymentIntents: {
          orderBy: { createdAt: "asc" },
          include: {
            attempts: { orderBy: { initializedAt: "asc" } },
            allocations: { orderBy: { createdAt: "asc" } },
            refunds: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });
    if (!order) throw new AdminError("ORDER_NOT_FOUND", "Order was not found.", 404);

    const refunds = new Map<string, (typeof order.paymentIntents)[number]["refunds"][number]>();
    for (const intent of order.paymentIntents) {
      for (const refund of intent.refunds) refunds.set(refund.id, refund);
    }
    for (const vendorOrder of order.vendorOrders) {
      for (const refund of vendorOrder.refunds) refunds.set(refund.id, refund);
    }

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        status: order.status,
        paymentStatus: order.paymentStatus,
        itemSubtotal: money(order.itemSubtotalAmountMinor, order.currency),
        discount: money(order.discountAmountMinor, order.currency),
        delivery: money(order.deliveryAmountMinor, order.currency),
        tax: money(order.taxAmountMinor, order.currency),
        grandTotal: money(order.grandTotalAmountMinor, order.currency),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
      vendorOrders: order.vendorOrders.map((vendorOrder) => ({
        id: vendorOrder.id,
        vendorId: vendorOrder.vendorId,
        storeId: vendorOrder.storeId,
        status: vendorOrder.status,
        itemSubtotal: money(vendorOrder.itemSubtotalAmountMinor, vendorOrder.currency),
        discount: money(vendorOrder.discountAmountMinor, vendorOrder.currency),
        delivery: money(vendorOrder.deliveryAmountMinor, vendorOrder.currency),
        tax: money(vendorOrder.taxAmountMinor, vendorOrder.currency),
        commission: money(vendorOrder.commissionAmountMinor, vendorOrder.currency),
        gatewayFee: money(vendorOrder.gatewayFeeAmountMinor, vendorOrder.currency),
        total: money(vendorOrder.totalAmountMinor, vendorOrder.currency),
        acceptedAt: vendorOrder.acceptedAt?.toISOString() ?? null,
        deliveredAt: vendorOrder.deliveredAt?.toISOString() ?? null,
      })),
      paymentIntents: order.paymentIntents.map((intent) => ({
        id: intent.id,
        status: intent.status,
        amount: money(intent.amountMinor, intent.currency),
        attempts: intent.attempts.map((attempt) => ({
          id: attempt.id,
          provider: attempt.provider,
          providerReference: attempt.providerReference,
          providerTransactionId: attempt.providerTxnId,
          status: attempt.status,
          failureCategory: attempt.failureCategory,
          confirmedAt: attempt.confirmedAt?.toISOString() ?? null,
          updatedAt: attempt.updatedAt.toISOString(),
        })),
      })),
      allocations: order.paymentIntents.flatMap((intent) =>
        intent.allocations.flatMap((allocation) =>
          allocation.vendorOrderId
            ? [{
                paymentIntentId: intent.id,
                vendorOrderId: allocation.vendorOrderId,
                type: allocation.type,
                amount: money(allocation.amountMinor, allocation.currency),
              }]
            : [],
        ),
      ),
      refunds: [...refunds.values()]
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((refund) => ({
          id: refund.id,
          vendorOrderId: refund.vendorOrderId,
          provider: refund.provider,
          providerRefundReference: refund.providerRefundReference,
          status: refund.status,
          amount: money(refund.amountMinor, refund.currency),
          reason: refund.reason,
          createdAt: refund.createdAt.toISOString(),
          completedAt: refund.completedAt?.toISOString() ?? null,
        })),
      shipments: order.vendorOrders.flatMap((vendorOrder) =>
        vendorOrder.shipments.map((shipment) => ({
          id: shipment.id,
          vendorOrderId: vendorOrder.id,
          provider: shipment.provider,
          trackingNumber: shipment.trackingNumber,
          status: shipment.status,
          deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
          updatedAt: shipment.updatedAt.toISOString(),
        })),
      ),
      returns: order.vendorOrders.flatMap((vendorOrder) =>
        vendorOrder.returns.map((request) => ({
          id: request.id,
          vendorOrderId: vendorOrder.id,
          status: request.status,
          reason: request.reason,
          requestedAt: request.requestedAt.toISOString(),
          completedAt: request.completedAt?.toISOString() ?? null,
        })),
      ),
    };
  }
}
