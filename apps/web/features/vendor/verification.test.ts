import type { VendorVerificationDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { effectiveVerificationStatus, isCurrentVerified, latestVerification } from "./verification";

const vendorId = "11111111-1111-4111-8111-111111111111";

function item(
  id: string,
  type: VendorVerificationDto["type"],
  status: VendorVerificationDto["status"],
  createdAt: string,
  expiresAt: string | null = null,
): VendorVerificationDto {
  return {
    id,
    vendorId,
    type,
    status,
    reference: `${type}-reference`,
    reviewedBy: status === "PENDING" ? null : "22222222-2222-4222-8222-222222222222",
    reviewedAt: status === "PENDING" ? null : createdAt,
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("vendor verification helpers", () => {
  it("uses the latest submission rather than any older verified record", () => {
    const oldVerified = item(
      "33333333-3333-4333-8333-333333333333",
      "BUSINESS",
      "VERIFIED",
      "2026-10-01T09:00:00.000Z",
    );
    const latestRejected = item(
      "44444444-4444-4444-8444-444444444444",
      "BUSINESS",
      "REJECTED",
      "2026-10-04T09:00:00.000Z",
    );

    expect(latestVerification([oldVerified, latestRejected], "BUSINESS")?.id).toBe(
      latestRejected.id,
    );
  });

  it("does not treat an expired verified check as current", () => {
    const expired = item(
      "55555555-5555-4555-8555-555555555555",
      "IDENTITY",
      "VERIFIED",
      "2026-10-01T09:00:00.000Z",
      "2026-10-03T00:00:00.000Z",
    );
    const now = Date.parse("2026-10-05T12:00:00.000Z");

    expect(isCurrentVerified(expired, now)).toBe(false);
    expect(effectiveVerificationStatus(expired, now)).toBe("EXPIRED");
  });
});
