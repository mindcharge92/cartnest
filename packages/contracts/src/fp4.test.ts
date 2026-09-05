import { Check } from "typebox/value";
import { describe, expect, it } from "vitest";
import { VendorProductSchema } from "./catalog.js";
import { VendorPermissionSchema } from "./vendor.js";

const vendorProduct = {
  id: "11111111-1111-4111-8111-111111111111",
  vendorId: "22222222-2222-4222-8222-222222222222",
  storeId: "33333333-3333-4333-8333-333333333333",
  category: null,
  name: "Running Shoe",
  slug: "running-shoe",
  description: "Lightweight running shoe.",
  status: "DRAFT",
  moderationStatus: "NOT_REQUIRED",
  options: [],
  variants: [],
  media: [],
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
  archivedAt: null,
};

describe("FP4 contracts", () => {
  it("includes the vendor owner on vendor product DTOs", () => {
    expect(Check(VendorProductSchema, vendorProduct)).toBe(true);
    const { vendorId: _vendorId, ...withoutVendor } = vendorProduct;
    expect(Check(VendorProductSchema, withoutVendor)).toBe(false);
  });

  it("recognizes product read as a first-class vendor permission", () => {
    expect(Check(VendorPermissionSchema, "product:read")).toBe(true);
  });
});
