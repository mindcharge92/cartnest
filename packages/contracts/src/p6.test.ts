import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CheckoutBodySchema,
  CheckoutHeadersSchema,
  OrderStatusSchema,
  VendorOrderSchema,
  VendorOrderStatusSchema,
} from "./orders.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const address = {
  recipientName: "Ada Okafor",
  phone: "+2348012345678",
  line1: "10 Market Road",
  city: "Lagos",
  state: "Lagos",
  countryCode: "NG",
};

const money = { amountMinor: "10000", currency: "NGN" };
const zero = { amountMinor: "0", currency: "NGN" };

function vendorOrder() {
  return {
    id: UUID,
    orderId: UUID,
    vendorId: UUID,
    store: { id: UUID, name: "Ada Store", slug: "ada-store", vendorDisplayName: "Ada Ventures" },
    status: "PENDING",
    orderStatus: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    itemSubtotal: money,
    discount: zero,
    delivery: zero,
    tax: zero,
    commissionRateBps: 0,
    commission: zero,
    gatewayFee: zero,
    total: money,
    items: [],
    acceptedAt: null,
    deliveredAt: null,
    createdAt: "2026-09-05T10:00:00.000Z",
    updatedAt: "2026-09-05T10:00:00.000Z",
  };
}

describe("P6 contracts", () => {
  it("accepts a checkout request with an explicit delivery snapshot", () => {
    expect(Check(CheckoutBodySchema, { deliveryAddress: address })).toBe(true);
  });

  it("requires a sufficiently long idempotency key", () => {
    expect(Check(CheckoutHeadersSchema, { "idempotency-key": "checkout-123" })).toBe(true);
    expect(Check(CheckoutHeadersSchema, { "idempotency-key": "short" })).toBe(false);
  });

  it("contains the checkout cancellation states used by P6", () => {
    expect(Check(OrderStatusSchema, "PENDING_PAYMENT")).toBe(true);
    expect(Check(OrderStatusSchema, "PARTIALLY_CANCELLED")).toBe(true);
    expect(Check(VendorOrderStatusSchema, "ACCEPTED")).toBe(true);
    expect(Check(VendorOrderStatusSchema, "CANCELLED")).toBe(true);
  });

  it("requires parent order and payment state on vendor-order responses", () => {
    const valid = vendorOrder();
    expect(Check(VendorOrderSchema, valid)).toBe(true);

    const { orderStatus: _orderStatus, ...withoutOrderStatus } = valid;
    const { paymentStatus: _paymentStatus, ...withoutPaymentStatus } = valid;
    expect(Check(VendorOrderSchema, withoutOrderStatus)).toBe(false);
    expect(Check(VendorOrderSchema, withoutPaymentStatus)).toBe(false);
  });
});
