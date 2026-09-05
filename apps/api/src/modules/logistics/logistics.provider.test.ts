import { describe, expect, it } from "vitest";
import { mapGiglScanCode } from "./logistics.provider.js";

describe("GIGL tracking normalization", () => {
  it.each([
    ["SHD", "DELIVERED"],
    ["OKC", "DELIVERED"],
    ["OFDU", "OUT_FOR_DELIVERY"],
    ["SRFS", "PICKED_UP"],
    ["DTR", "IN_TRANSIT"],
    ["MRTE", "RETURNING"],
    ["RSR", "RETURNED"],
    ["DFA", "FAILED"],
    ["MSCP", "CANCELLED"],
    ["CRT", "BOOKED"],
  ] as const)("maps %s to %s", (providerCode, expected) => {
    expect(mapGiglScanCode(providerCode)).toBe(expected);
  });

  it("fails closed into an in-transit state for an unknown non-terminal provider scan", () => {
    expect(mapGiglScanCode("NEW_PROVIDER_CODE")).toBe("IN_TRANSIT");
  });
});
