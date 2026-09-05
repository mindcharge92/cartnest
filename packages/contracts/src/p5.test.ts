import Value from "typebox/value";
import { describe, expect, it } from "vitest";
import { InventoryItemSchema, AdjustInventoryBodySchema } from "./inventory.js";
import { AddWishlistItemBodySchema, WishlistResponseSchema } from "./wishlist.js";
import { AddCartItemBodySchema, CartResponseSchema, CheckoutPreviewResponseSchema } from "./cart.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const UUID_2 = "223e4567-e89b-12d3-a456-426614174001";
const NOW = "2026-09-05T10:00:00.000Z";

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

  it("returns normalized option values with vendor inventory", () => {
    expect(
      Value.Check(InventoryItemSchema, {
        variantId: UUID,
        productId: UUID_2,
        storeId: UUID,
        productName: "Running shoe",
        sku: "SHOE-BLK-42",
        optionValues: [
          { optionId: UUID, optionName: "Color", valueId: UUID_2, value: "Black" },
        ],
        onHand: 20,
        reserved: 3,
        available: 17,
        version: 4,
        updatedAt: NOW,
      }),
    ).toBe(true);
  });

  it("supports product-level or variant-specific wishlist items", () => {
    expect(Value.Check(AddWishlistItemBodySchema, { productId: UUID })).toBe(true);
    expect(Value.Check(AddWishlistItemBodySchema, { productId: UUID, variantId: UUID_2 })).toBe(true);
  });

  it("keeps unavailable wishlist records removable", () => {
    expect(
      Value.Check(WishlistResponseSchema, {
        id: UUID,
        items: [],
        unavailableItems: [
          { id: UUID_2, productId: UUID, variantId: null, createdAt: NOW },
        ],
        updatedAt: NOW,
      }),
    ).toBe(true);
  });

  it("rejects non-positive cart quantities", () => {
    expect(Value.Check(AddCartItemBodySchema, { variantId: UUID, quantity: 2 })).toBe(true);
    expect(Value.Check(AddCartItemBodySchema, { variantId: UUID, quantity: 0 })).toBe(false);
  });

  it("keeps unavailable cart lines visible so buyers can remove them", () => {
    expect(
      Value.Check(CartResponseSchema, {
        id: UUID,
        status: "ACTIVE",
        items: [],
        unavailableItems: [
          {
            id: UUID_2,
            variantId: UUID,
            quantity: 2,
            productId: null,
            productName: null,
            storeId: null,
            sku: null,
            issueCode: "VARIANT_UNAVAILABLE",
            message: "The selected variant no longer exists.",
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        itemCount: 2,
        distinctStoreCount: 0,
        subtotal: { amountMinor: "0", currency: "NGN" },
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ).toBe(true);
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
        generatedAt: NOW,
      }),
    ).toBe(true);
  });
});
