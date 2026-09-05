import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CheckoutBodySchema,
  CheckoutHeadersSchema,
  OrderStatusSchema,
  VendorOrderStatusSchema,
} from "./orders.js";

const address = {
  recipientName: "Ada Okafor",
  phone: "+2348012345678",
  line1: "10 Market Road",
  city: "Lagos",
  state: "Lagos",
  countryCode: "NG",
};

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
});
