import { describe, expect, it } from "vitest";
import {
  buildVariantCombinations,
  formatMoney,
  parseNairaToMinor,
  slugifyProduct,
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
});
