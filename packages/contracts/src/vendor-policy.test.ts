import Value from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  RecordPaymentProviderAccountBodySchema,
  ReviewVendorBodySchema,
  SubmitVendorVerificationBodySchema,
} from "./vendor.js";

describe("vendor policy contracts", () => {
  it("rejects blank verification references when a reference is supplied", () => {
    expect(
      Value.Check(SubmitVendorVerificationBodySchema, { type: "BUSINESS", reference: "CAC-123" }),
    ).toBe(true);
    expect(
      Value.Check(SubmitVendorVerificationBodySchema, { type: "BUSINESS", reference: "   " }),
    ).toBe(false);
  });

  it("requires a meaningful reason for adverse vendor decisions", () => {
    expect(
      Value.Check(ReviewVendorBodySchema, {
        reason: "Registration details could not be verified.",
      }),
    ).toBe(true);
    expect(Value.Check(ReviewVendorBodySchema, {})).toBe(false);
    expect(Value.Check(ReviewVendorBodySchema, { reason: "   " })).toBe(false);
  });

  it("rejects blank provider subaccount identifiers", () => {
    expect(
      Value.Check(RecordPaymentProviderAccountBodySchema, {
        provider: "PAYSTACK",
        externalSubaccountId: "ACCT_123",
      }),
    ).toBe(true);
    expect(
      Value.Check(RecordPaymentProviderAccountBodySchema, {
        provider: "PAYSTACK",
        externalSubaccountId: "   ",
      }),
    ).toBe(false);
  });
});
