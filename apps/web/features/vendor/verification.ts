import type {
  VendorVerificationDto,
  VendorVerificationStatusDto,
  VendorVerificationTypeDto,
} from "@repo/contracts";

export function latestVerification(
  items: readonly VendorVerificationDto[],
  type: VendorVerificationTypeDto,
): VendorVerificationDto | undefined {
  return items
    .filter((item) => item.type === type)
    .toSorted((left, right) => {
      const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
      if (createdDelta !== 0) return createdDelta;
      const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      if (updatedDelta !== 0) return updatedDelta;
      return right.id.localeCompare(left.id);
    })[0];
}

export function isCurrentVerified(
  item: VendorVerificationDto | undefined,
  nowMs = Date.now(),
): boolean {
  if (!item || item.status !== "VERIFIED") return false;
  return !item.expiresAt || Date.parse(item.expiresAt) > nowMs;
}

export function effectiveVerificationStatus(
  item: VendorVerificationDto,
  nowMs = Date.now(),
): VendorVerificationStatusDto {
  if (item.status === "VERIFIED" && item.expiresAt && Date.parse(item.expiresAt) <= nowMs) {
    return "EXPIRED";
  }
  return item.status;
}
