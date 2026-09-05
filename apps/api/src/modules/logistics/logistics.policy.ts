import type { ShipmentStatusDto } from "@repo/contracts";

const manualTransitions: Readonly<Record<ShipmentStatusDto, readonly ShipmentStatusDto[]>> = {
  PENDING: ["BOOKED", "CANCELLED"],
  BOOKED: ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNING"],
  IN_TRANSIT: ["OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "RETURNING"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED", "RETURNING"],
  FAILED: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "RETURNING", "CANCELLED"],
  RETURNING: ["RETURNED"],
  RETURNED: [],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionManualShipment(
  current: ShipmentStatusDto,
  next: ShipmentStatusDto,
): boolean {
  return current === next || manualTransitions[current].includes(next);
}
