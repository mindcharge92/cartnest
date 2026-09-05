import { describe, expect, it } from "vitest";
import type { VendorOrderDto } from "@repo/contracts";
import { canCancelVendorOrder, isUnpaidOpenOrder, orderStatusLabel } from "./order-ui";

function vendorOrder(overrides: Partial<VendorOrderDto> = {}): VendorOrderDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    orderId: "22222222-2222-4222-8222-222222222222",
    vendorId: "33333333-3333-4333-8333-333333333333",
    store: {
      id: "44444444-4444-4444-8444-444444444444",
      name: "Test Store",
      slug: "test-store",
      vendorDisplayName: "Test Vendor",
    },
    status: "PENDING",
    orderStatus: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    itemSubtotal: { amountMinor: "10000", currency: "NGN" },
    discount: { amountMinor: "0", currency: "NGN" },
    delivery: { amountMinor: "1000", currency: "NGN" },
    tax: { amountMinor: "0", currency: "NGN" },
    commissionRateBps: 0,
    commission: { amountMinor: "0", currency: "NGN" },
    gatewayFee: { amountMinor: "0", currency: "NGN" },
    total: { amountMinor: "11000", currency: "NGN" },
    items: [],
    acceptedAt: null,
    deliveredAt: null,
    createdAt: "2026-09-05T10:00:00.000Z",
    updatedAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("FP6 order UI rules", () => {
  it("keeps unpaid partially-cancelled parent orders cancellable", () => {
    expect(isUnpaidOpenOrder("PARTIALLY_CANCELLED", "PENDING")).toBe(true);
  });

  it("does not expose vendor cancellation after payment succeeds", () => {
    expect(canCancelVendorOrder(vendorOrder({ paymentStatus: "SUCCEEDED", orderStatus: "PAID" }))).toBe(false);
  });

  it("allows pending vendor slices while the parent payment is pending", () => {
    expect(canCancelVendorOrder(vendorOrder())).toBe(true);
    expect(canCancelVendorOrder(vendorOrder({ status: "ACCEPTED" }))).toBe(true);
  });

  it("formats enum labels for presentation", () => {
    expect(orderStatusLabel("PARTIALLY_CANCELLED")).toBe("Partially Cancelled");
  });
});
