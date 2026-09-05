import { describe, expect, it } from "vitest";
import { isOpenUnpaidOrder } from "./order.repository.js";

describe("order repository state guards", () => {
  it("keeps partially cancelled unpaid orders open for remaining cancellation and expiry", () => {
    expect(isOpenUnpaidOrder("PENDING_PAYMENT", "PENDING")).toBe(true);
    expect(isOpenUnpaidOrder("PARTIALLY_CANCELLED", "PENDING")).toBe(true);
  });

  it("does not reopen paid or terminal orders", () => {
    expect(isOpenUnpaidOrder("PAID", "SUCCEEDED")).toBe(false);
    expect(isOpenUnpaidOrder("PARTIALLY_CANCELLED", "SUCCEEDED")).toBe(false);
    expect(isOpenUnpaidOrder("CANCELLED", "CANCELLED")).toBe(false);
  });
});
