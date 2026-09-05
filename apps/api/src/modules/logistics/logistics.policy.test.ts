import { describe, expect, it } from "vitest";
import { canTransitionManualShipment } from "./logistics.policy.js";

describe("manual shipment transitions", () => {
  it("allows normal forward fulfillment transitions", () => {
    expect(canTransitionManualShipment("BOOKED", "PICKED_UP")).toBe(true);
    expect(canTransitionManualShipment("PICKED_UP", "IN_TRANSIT")).toBe(true);
    expect(canTransitionManualShipment("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransitionManualShipment("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("does not allow a delivered shipment to move backwards", () => {
    expect(canTransitionManualShipment("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionManualShipment("DELIVERED", "CANCELLED")).toBe(false);
  });

  it("allows a failed attempt to resume or return without granting delivery", () => {
    expect(canTransitionManualShipment("FAILED", "IN_TRANSIT")).toBe(true);
    expect(canTransitionManualShipment("FAILED", "RETURNING")).toBe(true);
    expect(canTransitionManualShipment("FAILED", "DELIVERED")).toBe(false);
  });
});
