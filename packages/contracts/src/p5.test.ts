import Value from "typebox/value";
import { describe, expect, it } from "vitest";
import { AdjustInventoryBodySchema } from "./inventory.js";
import { AddWishlistItemBodySchema } from "./wishlist.js";
import { AddCartItemBodySchema, CheckoutPreviewResponseSchema } from "./cart.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("P5 contracts", () => {
  it("requires optimistic inventory version and integer delta", () => {
    expect(
      Value.Check(AdjustInventoryBodySchema, {
        delta: 10,
        reason: "Initial stock",
        expectedVersion: 0,
      }),
    ).toBe(true);
    expect(
      Value.Check(AdjustInventoryBodySchema, {
        delta: 1.5,
        reason: "Invalid fractional stock",
        expectedVersion: 0,
      }),
    ).toBe(false);
  });

  it("supports product-level or variant-specific wishlist items", () => {
    expect(Value.Check(AddWishlistItemBodySchema, { productId: UUID })).toBe(true);
    expect(Value.Check(AddWishlistItemBodySchema, { productId: UUID, variantId: UUID })).toBe(true);
  });

  it("rejects non-positive cart quantities", () => {
    expect(Value.Check(AddCartItemBodySchema, { variantId: UUID, quantity: 2 })).toBe(true);
    expect(Value.Check(AddCartItemBodySchema, { variantId: UUID, quantity: 0 })).toBe(false);
  });

  it("represents a server-calculated checkout preview", () => {
    expect(
      Value.Check(CheckoutPreviewResponseSchema, {
        cartId: UUID,
        ready: true,
        currency: "NGN",
        subtotal: { amountMinor: "250000", currency: "NGN" },
        itemCount: 2,
        storeGroups: [],
        issues: [],
        generatedAt: "2026-09-05T10:00:00.000Z",
      }),
    ).toBe(true);
  });
});