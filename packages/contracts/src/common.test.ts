import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import { MoneySchema, PaginationQuerySchema } from "./common.js";

describe("shared contracts", () => {
  it("accepts lossless minor-unit money values", () => {
    expect(Check(MoneySchema, { amountMinor: "5000000", currency: "NGN" })).toBe(true);
    expect(Check(MoneySchema, { amountMinor: 5000000, currency: "NGN" })).toBe(false);
  });

  it("rejects invalid pagination bounds", () => {
    expect(Check(PaginationQuerySchema, { page: 1, pageSize: 20 })).toBe(true);
    expect(Check(PaginationQuerySchema, { page: 0, pageSize: 500 })).toBe(false);
  });
});