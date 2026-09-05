import type { VendorAccessDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { hasVendorPermission } from "./permissions";

function access(overrides: Partial<VendorAccessDto["membership"]> = {}): VendorAccessDto {
  return {
    vendor: {
      id: "11111111-1111-4111-8111-111111111111",
      displayName: "Example Vendor",
      legalName: null,
      registrationNumber: null,
      status: "APPROVED",
      createdAt: "2026-09-05T12:00:00.000Z",
      updatedAt: "2026-09-05T12:00:00.000Z",
    },
    membership: {
      id: "22222222-2222-4222-8222-222222222222",
      vendorId: "11111111-1111-4111-8111-111111111111",
      userId: "33333333-3333-4333-8333-333333333333",
      role: "STAFF",
      status: "ACTIVE",
      permissions: ["store:read"],
      joinedAt: "2026-09-05T12:00:00.000Z",
      ...overrides,
    },
  };
}

describe("hasVendorPermission", () => {
  it("allows active owners regardless of the explicit permission array", () => {
    expect(hasVendorPermission(access({ role: "OWNER", permissions: [] }), "staff:update")).toBe(true);
  });

  it("allows staff only when the permission is assigned", () => {
    const staff = access();
    expect(hasVendorPermission(staff, "store:read")).toBe(true);
    expect(hasVendorPermission(staff, "store:update")).toBe(false);
  });

  it("does not treat invited or suspended membership as active authorization", () => {
    expect(hasVendorPermission(access({ status: "INVITED", role: "OWNER" }), "store:create")).toBe(false);
    expect(hasVendorPermission(access({ status: "SUSPENDED", permissions: ["store:read"] }), "store:read")).toBe(false);
  });
});
