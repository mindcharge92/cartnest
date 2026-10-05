import { describe, expect, it, vi } from "vitest";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type {
  VendorMembershipRecord,
  VendorRepository,
  VerificationRecord,
} from "./vendor.repository.js";
import { VendorService } from "./vendor.service.js";

const vendorId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

const principal: AccessPrincipal = {
  userId,
  sessionId: "33333333-3333-4333-8333-333333333333",
  platformRole: "USER",
  mfaSatisfied: false,
};

const owner: VendorMembershipRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  vendorId,
  userId,
  role: "OWNER",
  status: "ACTIVE",
  invitedAt: null,
  joinedAt: new Date("2026-10-01T09:00:00.000Z"),
  permissions: [],
};

function repository(overrides: Partial<VendorRepository> = {}): VendorRepository {
  return {
    findMembership: vi.fn().mockResolvedValue(owner),
    listVerifications: vi.fn().mockResolvedValue([]),
    createVerification: vi.fn(),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as VendorRepository;
}

describe("vendor verification submission policy", () => {
  it.each(["BUSINESS", "IDENTITY", "BANK_ACCOUNT"] as const)(
    "requires a reference for %s verification",
    async (type) => {
      const repo = repository();
      const service = new VendorService(repo);

      await expect(service.submitVerification(principal, vendorId, { type })).rejects.toMatchObject(
        {
          code: "VERIFICATION_REFERENCE_REQUIRED",
          statusCode: 400,
        },
      );
      expect(repo.createVerification).not.toHaveBeenCalled();
    },
  );

  it("trims a submitted core verification reference before persistence", async () => {
    const record: VerificationRecord = {
      id: "55555555-5555-4555-8555-555555555555",
      vendorId,
      type: "BUSINESS",
      status: "PENDING",
      reference: "RC12345",
      reviewedBy: null,
      reviewedAt: null,
      expiresAt: null,
      createdAt: new Date("2026-10-05T09:00:00.000Z"),
      updatedAt: new Date("2026-10-05T09:00:00.000Z"),
    };
    const repo = repository({ createVerification: vi.fn().mockResolvedValue(record) });
    const service = new VendorService(repo);

    await service.submitVerification(principal, vendorId, {
      type: "BUSINESS",
      reference: "  RC12345  ",
    });

    expect(repo.createVerification).toHaveBeenCalledWith(vendorId, "BUSINESS", "RC12345");
  });

  it("still allows OTHER verification without a reference", async () => {
    const record: VerificationRecord = {
      id: "66666666-6666-4666-8666-666666666666",
      vendorId,
      type: "OTHER",
      status: "PENDING",
      reference: null,
      reviewedBy: null,
      reviewedAt: null,
      expiresAt: null,
      createdAt: new Date("2026-10-05T10:00:00.000Z"),
      updatedAt: new Date("2026-10-05T10:00:00.000Z"),
    };
    const repo = repository({ createVerification: vi.fn().mockResolvedValue(record) });
    const service = new VendorService(repo);

    await service.submitVerification(principal, vendorId, { type: "OTHER" });

    expect(repo.createVerification).toHaveBeenCalledWith(vendorId, "OTHER", undefined);
  });
});
