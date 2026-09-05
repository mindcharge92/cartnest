import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CreateProductReviewBodySchema,
  CreateRefundBodySchema,
  CreateReturnBodySchema,
  RefundHeadersSchema,
  UpdateReturnStatusBodySchema,
} from "./returns.js";

const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("P9 contracts", () => {
  it("accepts a delivered-item return request shape", () => {
    expect(
      Value.Check(CreateReturnBodySchema, {
        vendorOrderId: ID,
        reason: "Item arrived damaged",
        items: [{ orderItemId: ID, quantity: 1, condition: "DAMAGED" }],
      }),
    ).toBe(true);
  });

  it("rejects an empty return item list", () => {
    expect(
      Value.Check(CreateReturnBodySchema, {
        vendorOrderId: ID,
        reason: "Item arrived damaged",
        items: [],
      }),
    ).toBe(false);
  });

  it("requires positive integer minor units for refunds", () => {
    expect(Value.Check(CreateRefundBodySchema, { amountMinor: "125000", reason: "Approved partial refund" })).toBe(true);
    expect(Value.Check(CreateRefundBodySchema, { amountMinor: "0", reason: "Invalid" })).toBe(false);
  });

  it("requires an idempotency key on refund requests", () => {
    expect(Value.Check(RefundHeadersSchema, { "idempotency-key": "refund-key-123" })).toBe(true);
    expect(Value.Check(RefundHeadersSchema, {})).toBe(false);
  });

  it("limits verified-purchase review ratings to one through five", () => {
    expect(Value.Check(CreateProductReviewBodySchema, { orderItemId: ID, rating: 5, text: "Good product" })).toBe(true);
    expect(Value.Check(CreateProductReviewBodySchema, { orderItemId: ID, rating: 6 })).toBe(false);
  });

  it("accepts only the return state vocabulary", () => {
    expect(Value.Check(UpdateReturnStatusBodySchema, { status: "RECEIVED" })).toBe(true);
    expect(Value.Check(UpdateReturnStatusBodySchema, { status: "PAID" })).toBe(false);
  });
});
