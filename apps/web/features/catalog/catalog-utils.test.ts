import type { ProductVariantDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  bestVariantForOptionValue,
  buildVariantCombinations,
  formatMoney,
  parseNairaToMinor,
  slugifyProduct,
  variantSelection,
} from "./catalog-utils";

describe("catalog utilities", () => {
  it("formats and parses NGN minor-unit values", () => {
    expect(parseNairaToMinor("50,000.25")).toBe("5000025");
    expect(parseNairaToMinor("12.5")).toBe("1250");
    expect(parseNairaToMinor("12.345")).toBeNull();
    expect(formatMoney({ amountMinor: "5000025", currency: "NGN" })).toBe("₦50,000.25");
  });

  it("creates normalized product slugs", () => {
    expect(slugifyProduct("  Men's Running Shoe  ")).toBe("men-s-running-shoe");
  });

  it("builds the cartesian set of normalized variant combinations", () => {
    const combinations = buildVariantCombinations([
      { name: "Color", values: ["Black", "White"] },
      { name: "Size", values: ["42", "43"] },
    ]);
    expect(combinations).toHaveLength(4);
    expect(combinations.map((entry) => entry.key)).toContain("Color=Black|Size=42");
  });

  it("uses one default variant when no options exist", () => {
    expect(buildVariantCombinations([])).toEqual([{ key: "default", selections: [] }]);
  });

  it("returns an empty combination list when the 250-variant contract limit is exceeded", () => {
    const combinations = buildVariantCombinations([
      { name: "A", values: Array.from({ length: 20 }, (_, index) => `A${index}`) },
      { name: "B", values: Array.from({ length: 20 }, (_, index) => `B${index}`) },
    ]);
    expect(combinations).toEqual([]);
  });

  it("moves directly to a valid sparse combination when an option value changes", () => {
    const redSmall: ProductVariantDto = {
      id: "11111111-1111-4111-8111-111111111111",
      sku: "RED-S",
      price: { amountMinor: "10000", currency: "NGN" },
      status: "ACTIVE",
      optionValues: [
        { optionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", optionName: "Color", valueId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", value: "Red" },
        { optionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", optionName: "Size", valueId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", value: "Small" },
      ],
      createdAt: "2026-09-05T00:00:00.000Z",
      updatedAt: "2026-09-05T00:00:00.000Z",
    };
    const blueLarge: ProductVariantDto = {
      ...redSmall,
      id: "22222222-2222-4222-8222-222222222222",
      sku: "BLUE-L",
      optionValues: [
        { optionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", optionName: "Color", valueId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", value: "Blue" },
        { optionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", optionName: "Size", valueId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", value: "Large" },
      ],
    };

    const current = variantSelection(redSmall);
    const compatible = bestVariantForOptionValue(
      [redSmall, blueLarge],
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      current,
    );

    expect(compatible?.id).toBe(blueLarge.id);
    expect(compatible ? variantSelection(compatible) : null).toEqual({
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    });
  });
});
