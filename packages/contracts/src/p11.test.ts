import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import {
  PrivacyRequestListQuerySchema,
  ProcessPrivacyRequestBodySchema,
} from "./index.js";

describe("P11 privacy contracts", () => {
  it("accepts bounded privacy request pagination", () => {
    expect(Value.Check(PrivacyRequestListQuerySchema, { page: 1, pageSize: 50, status: "PENDING" })).toBe(true);
    expect(Value.Check(PrivacyRequestListQuerySchema, { page: 0, pageSize: 500 })).toBe(false);
  });

  it("requires an explicit reviewed erasure decision and reason", () => {
    expect(Value.Check(ProcessPrivacyRequestBodySchema, {
      decision: "ANONYMIZE",
      reason: "Identity was verified and no active obligations remain.",
    })).toBe(true);
    expect(Value.Check(ProcessPrivacyRequestBodySchema, { decision: "ANONYMIZE", reason: "ok" })).toBe(false);
    expect(Value.Check(ProcessPrivacyRequestBodySchema, { decision: "DELETE", reason: "Identity was verified and approved." })).toBe(false);
  });
});
