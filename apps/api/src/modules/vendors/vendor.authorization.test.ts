import { describe, expect, it } from "vitest";
import {
  effectiveVendorPermissions,
  requireActiveVendorMembership,
  requireVendorOwner,
  requireVendorPermission,
  type VendorMembershipContext,
} from "./vendor.authorization.js";

const owner: VendorMembershipContext = {
  id: "11111111-1111-4111-8111-111111111111",
  vendorId: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  role: "OWNER",
  status: "ACTIVE",
  permissions: [],
};

const staff: VendorMembershipContext = {
  ...owner,
  id: "44444444-4444-4444-8444-444444444444",
  userId: "55555555-5555-4555-8555-555555555555",
  role: "STAFF",
  permissions: ["store:read", "order:read"],
};

describe("vendor authorization", () => {
  it("treats an active owner as having all vendor permissions", () => {
    expect(() => requireVendorPermission(owner, "staff:remove")).not.toThrow();
    expect(effectiveVendorPermissions(owner)).toContain("inventory:adjust");
  });

  it("allows staff only for explicitly granted permissions", () => {
    expect(() => requireVendorPermission(staff, "store:read")).not.toThrow();
    expect(() => requireVendorPermission(staff, "inventory:adjust")).toThrow();
  });

  it("rejects invited or suspended memberships", () => {
    expect(() => requireActiveVendorMembership({ ...staff, status: "INVITED" })).toThrow();
    expect(() => requireActiveVendorMembership({ ...staff, status: "SUSPENDED" })).toThrow();
  });

  it("requires the owner role for owner-only changes", () => {
    expect(() => requireVendorOwner(owner)).not.toThrow();
    expect(() => requireVendorOwner(staff)).toThrow();
  });
});
