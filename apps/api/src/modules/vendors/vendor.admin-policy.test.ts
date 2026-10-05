import { describe, expect, it, vi } from "vitest";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type {
  ProviderAccountRecord,
  VendorRecord,
  VendorRepository,
  VerificationRecord,
} from "./vendor.repository.js";
import { VendorService } from "./vendor.service.js";

const vendorId = "11111111-1111-4111-8111-111111111111";
const adminUserId = "22222222-2222-4222-8222-222222222222";

const admin: AccessPrincipal = {
  userId: adminUserId,
  sessionId: "33333333-3333-4333-8333-333333333333",
  platformRole: "ADMIN",
  mfaSatisfied: true,
};

const pendingVendor: VendorRecord = {
  id: vendorId,
  displayName: "MIMI MART",
  legalName: "Mimi Mart Limited",
  registrationNumber: "RC1234567",
  status: "PENDING",
  approvedAt: null,
  rejectedAt: null,
  suspendedAt: null,
  createdAt: new Date("2026-10-01T09:00:00.000Z"),
  updatedAt: new Date("2026-10-01T09:00:00.000Z"),
};

const approvedVendor: VendorRecord = {
  ...pendingVendor,
  status: "APPROVED",
  approvedAt: new Date("2026-10-03T12:00:00.000Z"),
};

function verification(
  id: string,
  type: VerificationRecord["type"],
  status: VerificationRecord["status"],
  createdAt: string,
  expiresAt: Date | null = null,
): VerificationRecord {
  const created = new Date(createdAt);
  return {
    id,
    vendorId,
    type,
    status,
    reference: `${type}-reference`,
    reviewedBy: status === "PENDING" ? null : adminUserId,
    reviewedAt: status === "PENDING" ? null : created,
    expiresAt,
    createdAt: created,
    updatedAt: created,
  };
}

function repository(overrides: Partial<VendorRepository> = {}): VendorRepository {
  return {
    findVendor: vi.fn().mockResolvedValue(pendingVendor),
    listAdminVendors: vi.fn().mockResolvedValue([pendingVendor]),
    listVerifications: vi.fn().mockResolvedValue([]),
    findVerification: vi.fn().mockResolvedValue(null),
    reviewVerification: vi.fn(),
    setVendorStatus: vi.fn(),
    findProviderAccount: vi.fn().mockResolvedValue(providerAccount),
    findProviderAccountByExternalId: vi.fn().mockResolvedValue(null),
    setProviderAccountStatus: vi.fn(),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as VendorRepository;
}

describe("admin vendor verification policy", () => {
  it("allows an MFA-satisfied admin to read a vendor's verification queue", async () => {
    const business = verification(
      "44444444-4444-4444-8444-444444444444",
      "BUSINESS",
      "PENDING",
      "2026-10-02T09:00:00.000Z",
    );
    const repo = repository({ listVerifications: vi.fn().mockResolvedValue([business]) });
    const service = new VendorService(repo);

    const result = await service.listAdminVerifications(admin, vendorId);

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe("BUSINESS");
    expect(repo.findVendor).toHaveBeenCalledWith(vendorId);
  });

  it("requires a reason when an admin rejects a vendor", async () => {
    const repo = repository();
    const service = new VendorService(repo);

    await expect(service.rejectVendor(admin, vendorId, undefined)).rejects.toMatchObject({
      code: "REVIEW_REASON_REQUIRED",
      statusCode: 400,
    });
    expect(repo.setVendorStatus).not.toHaveBeenCalled();
  });

  it("requires a reason when an admin rejects a verification", async () => {
    const current = verification(
      "55555555-5555-4555-8555-555555555555",
      "IDENTITY",
      "PENDING",
      "2026-10-02T10:00:00.000Z",
    );
    const repo = repository({ findVerification: vi.fn().mockResolvedValue(current) });
    const service = new VendorService(repo);

    await expect(
      service.reviewVerification(admin, current.id, { status: "REJECTED" }),
    ).rejects.toMatchObject({ code: "REVIEW_REASON_REQUIRED", statusCode: 400 });
    expect(repo.reviewVerification).not.toHaveBeenCalled();
  });

  it("does not approve from an old verified record when the latest submission is rejected", async () => {
    const oldBusiness = verification(
      "66666666-6666-4666-8666-666666666666",
      "BUSINESS",
      "VERIFIED",
      "2026-10-01T09:00:00.000Z",
    );
    const rejectedBusiness = verification(
      "77777777-7777-4777-8777-777777777777",
      "BUSINESS",
      "REJECTED",
      "2026-10-03T09:00:00.000Z",
    );
    const identity = verification(
      "88888888-8888-4888-8888-888888888888",
      "IDENTITY",
      "VERIFIED",
      "2026-10-02T09:00:00.000Z",
    );
    const repo = repository({
      listVerifications: vi.fn().mockResolvedValue([oldBusiness, rejectedBusiness, identity]),
    });
    const service = new VendorService(repo);

    await expect(service.approveVendor(admin, vendorId)).rejects.toMatchObject({
      code: "VENDOR_KYC_INCOMPLETE",
      statusCode: 409,
    });
    expect(repo.setVendorStatus).not.toHaveBeenCalled();
  });

  it("approves when the latest BUSINESS and IDENTITY records are current and verified", async () => {
    const business = verification(
      "99999999-9999-4999-8999-999999999999",
      "BUSINESS",
      "VERIFIED",
      "2026-10-03T09:00:00.000Z",
    );
    const identity = verification(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "IDENTITY",
      "VERIFIED",
      "2026-10-03T10:00:00.000Z",
    );
    const approved = { ...pendingVendor, status: "APPROVED" as const, approvedAt: new Date() };
    const repo = repository({
      listVerifications: vi.fn().mockResolvedValue([business, identity]),
      setVendorStatus: vi.fn().mockResolvedValue(approved),
    });
    const service = new VendorService(repo);

    const result = await service.approveVendor(admin, vendorId);

    expect(result.status).toBe("APPROVED");
    expect(repo.setVendorStatus).toHaveBeenCalledWith(vendorId, "APPROVED", expect.any(Date));
  });
});

const providerAccount: ProviderAccountRecord = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  vendorId,
  provider: "PAYSTACK",
  externalSubaccountId: "ACCT_TEST",
  status: "PENDING",
  createdAt: new Date("2026-10-03T12:00:00.000Z"),
  updatedAt: new Date("2026-10-03T12:00:00.000Z"),
};

describe("admin settlement policy", () => {
  it("rejects a provider subaccount identifier already linked to another vendor", async () => {
    const otherVendorAccount: ProviderAccountRecord = {
      ...providerAccount,
      id: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
      vendorId: "edededed-eded-4ded-8ded-edededededed",
    };
    const repo = repository({
      findProviderAccountByExternalId: vi.fn().mockResolvedValue(otherVendorAccount),
      upsertProviderAccount: vi.fn(),
    });
    const service = new VendorService(repo);

    await expect(
      service.recordProviderAccount(admin, vendorId, {
        provider: "PAYSTACK",
        externalSubaccountId: " ACCT_TEST ",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_ACCOUNT_ID_TAKEN", statusCode: 409 });
    expect(repo.findProviderAccountByExternalId).toHaveBeenCalledWith("PAYSTACK", "ACCT_TEST");
    expect(repo.upsertProviderAccount).not.toHaveBeenCalled();
  });

  it("allows admins to read provider accounts without vendor membership", async () => {
    const repo = repository({ listProviderAccounts: vi.fn().mockResolvedValue([providerAccount]) });
    const service = new VendorService(repo);

    const result = await service.listAdminProviderAccounts(admin, vendorId);

    expect(result).toHaveLength(1);
    expect(result[0]?.provider).toBe("PAYSTACK");
    expect(repo.findVendor).toHaveBeenCalledWith(vendorId);
  });

  it("does not activate settlement from an old verified bank check when the latest check is rejected", async () => {
    const oldVerified = verification(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "BANK_ACCOUNT",
      "VERIFIED",
      "2026-10-01T09:00:00.000Z",
    );
    const latestRejected = verification(
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "BANK_ACCOUNT",
      "REJECTED",
      "2026-10-04T09:00:00.000Z",
    );
    const repo = repository({
      findVendor: vi.fn().mockResolvedValue(approvedVendor),
      listVerifications: vi.fn().mockResolvedValue([oldVerified, latestRejected]),
      setProviderAccountStatus: vi.fn(),
    });
    const service = new VendorService(repo);

    await expect(
      service.updateProviderAccountStatus(admin, vendorId, "PAYSTACK", "ACTIVE", undefined),
    ).rejects.toMatchObject({ code: "BANK_VERIFICATION_REQUIRED", statusCode: 409 });
    expect(repo.setProviderAccountStatus).not.toHaveBeenCalled();
  });

  it("does not activate settlement from an expired bank verification", async () => {
    const expired = verification(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      "BANK_ACCOUNT",
      "VERIFIED",
      "2026-10-03T09:00:00.000Z",
      new Date("2020-01-01T00:00:00.000Z"),
    );
    const repo = repository({
      findVendor: vi.fn().mockResolvedValue(approvedVendor),
      listVerifications: vi.fn().mockResolvedValue([expired]),
      setProviderAccountStatus: vi.fn(),
    });
    const service = new VendorService(repo);

    await expect(
      service.updateProviderAccountStatus(admin, vendorId, "PAYSTACK", "ACTIVE", undefined),
    ).rejects.toMatchObject({ code: "BANK_VERIFICATION_REQUIRED", statusCode: 409 });
  });

  it("requires a reason to suspend or disable settlement", async () => {
    const repo = repository({ setProviderAccountStatus: vi.fn() });
    const service = new VendorService(repo);

    await expect(
      service.updateProviderAccountStatus(admin, vendorId, "PAYSTACK", "SUSPENDED", " "),
    ).rejects.toMatchObject({ code: "REVIEW_REASON_REQUIRED", statusCode: 400 });
    await expect(
      service.updateProviderAccountStatus(admin, vendorId, "PAYSTACK", "DISABLED", undefined),
    ).rejects.toMatchObject({ code: "REVIEW_REASON_REQUIRED", statusCode: 400 });
    expect(repo.setProviderAccountStatus).not.toHaveBeenCalled();
  });

  it("does not activate settlement before the vendor is approved", async () => {
    const bank = verification(
      "abababab-abab-4bab-8bab-abababababab",
      "BANK_ACCOUNT",
      "VERIFIED",
      "2026-10-04T09:00:00.000Z",
    );
    const repo = repository({ listVerifications: vi.fn().mockResolvedValue([bank]) });
    const service = new VendorService(repo);

    await expect(
      service.updateProviderAccountStatus(admin, vendorId, "PAYSTACK", "ACTIVE", undefined),
    ).rejects.toMatchObject({ code: "VENDOR_NOT_APPROVED", statusCode: 409 });
    expect(repo.setProviderAccountStatus).not.toHaveBeenCalled();
  });

  it("returns provider-account not found before settlement policy checks", async () => {
    const repo = repository({
      findVendor: vi.fn().mockResolvedValue(approvedVendor),
      findProviderAccount: vi.fn().mockResolvedValue(null),
    });
    const service = new VendorService(repo);

    await expect(
      service.updateProviderAccountStatus(admin, vendorId, "PAYSTACK", "ACTIVE", undefined),
    ).rejects.toMatchObject({ code: "PROVIDER_ACCOUNT_NOT_FOUND", statusCode: 404 });
  });

  it("rejects a verification expiry that is already in the past", async () => {
    const current = verification(
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      "BANK_ACCOUNT",
      "PENDING",
      "2026-10-04T10:00:00.000Z",
    );
    const repo = repository({
      findVerification: vi.fn().mockResolvedValue(current),
      reviewVerification: vi.fn(),
    });
    const service = new VendorService(repo);

    await expect(
      service.reviewVerification(admin, current.id, {
        status: "VERIFIED",
        expiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "INVALID_VERIFICATION_EXPIRY", statusCode: 400 });
    expect(repo.reviewVerification).not.toHaveBeenCalled();
  });
});
