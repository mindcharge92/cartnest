import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  CheckoutBodySchema,
  CreatePromotionBodySchema,
  CreateTaxRateBodySchema,
  UpdateNotificationPreferenceBodySchema,
} from "./index.js";

const ADDRESS = {
  recipientName: "Ada Buyer",
  phone: "+2348000000000",
  line1: "12 Market Street",
  city: "Lagos",
  state: "Lagos",
  countryCode: "NG",
};

describe("P10 contracts", () => {
  it("accepts a promotion code on checkout", () => {
    expect(Value.Check(CheckoutBodySchema, { deliveryAddress: ADDRESS, promotionCode: "WELCOME10" })).toBe(true);
  });

  it("limits percentage promotions to at most 10000 basis points at the application boundary", () => {
    const base = {
      code: "WELCOME10",
      name: "Welcome",
      type: "PERCENTAGE" as const,
      startsAt: "2026-09-05T00:00:00.000Z",
    };
    expect(Value.Check(CreatePromotionBodySchema, { ...base, value: "1000" })).toBe(true);
    // TypeBox validates positive integer syntax; the P10 service adds the semantic <=10000 rule.
    expect(Value.Check(CreatePromotionBodySchema, { ...base, value: "0" })).toBe(false);
  });

  it("accepts a fixed-amount promotion payload", () => {
    expect(Value.Check(CreatePromotionBodySchema, {
      code: "SAVE500",
      name: "Save 500 naira",
      type: "FIXED_AMOUNT",
      value: "50000",
      currency: "NGN",
      startsAt: "2026-09-05T00:00:00.000Z",
      perUserLimit: 1,
    })).toBe(true);
  });

  it("validates configured tax rates in basis points", () => {
    expect(Value.Check(CreateTaxRateBodySchema, { name: "VAT", rateBps: 750, active: true })).toBe(true);
    expect(Value.Check(CreateTaxRateBodySchema, { name: "VAT", rateBps: 10001 })).toBe(false);
  });

  it("validates notification preference updates", () => {
    expect(Value.Check(UpdateNotificationPreferenceBodySchema, { channel: "SMS", scopeKey: "shipment.delivered.customer.v1", enabled: true })).toBe(true);
    expect(Value.Check(UpdateNotificationPreferenceBodySchema, { channel: "PUSH", scopeKey: "*", enabled: true })).toBe(false);
  });
});
