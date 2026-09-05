import type { OrderStatusDto, PaymentStatusDto, VendorOrderDto, VendorOrderStatusDto } from "@repo/contracts";

export function orderStatusLabel(status: string): string {
  return status.replaceAll("_", " ").toLocaleLowerCase("en").replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

export function orderStatusClass(status: string): string {
  if (["PAID", "FULFILLED", "DELIVERED", "SUCCEEDED", "REFUNDED"].includes(status)) return "statusPill statusPillGood";
  if (["CANCELLED", "FAILED"].includes(status)) return "statusPill statusPillDanger";
  return "statusPill statusPillWarning";
}

export function isUnpaidOpenOrder(status: OrderStatusDto, paymentStatus: PaymentStatusDto): boolean {
  return paymentStatus === "PENDING" && ["PENDING_PAYMENT", "PARTIALLY_CANCELLED"].includes(status);
}

export function canCancelVendorOrder(order: VendorOrderDto): boolean {
  return isUnpaidOpenOrder(order.orderStatus, order.paymentStatus) && ["PENDING", "ACCEPTED"].includes(order.status);
}

export const ORDER_STATUSES: readonly OrderStatusDto[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "PARTIALLY_CANCELLED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;

export const VENDOR_ORDER_STATUSES: readonly VendorOrderStatusDto[] = [
  "PENDING",
  "ACCEPTED",
  "PROCESSING",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;
