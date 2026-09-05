import { describe, expect, it, vi } from "vitest";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { VendorMemberRecord, VendorMembershipRecord, VendorRepository } from "./vendor.repository.js";
import { VendorService } from "./vendor.service.js";

const vendorId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";
const invitedUserId = "33333333-3333-4333-8333-333333333333";
const memberId = "44444444-4444-4444-8444-444444444444";

const principal: AccessPrincipal = {
  userId: ownerUserId,
  sessionId: "55555555-5555-4555-8555-555555555555",
  platformRole: "USER",
  mfaSatisfied: false,
};

const owner: VendorMembershipRecord = {
  id: "66666666-6666-4666-8666-666666666666",
  vendorId,
  userId: ownerUserId,
  role: "OWNER",
  status: "ACTIVE",
  invitedAt: null,
  joinedAt: new Date("2026-09-05T12:00:00.000Z"),
  permissions: [],
};

const invitation: VendorMemberRecord = {
  id: memberId,
  vendorId,
  userId: invitedUserId,
  user: { id: invitedUserId, email: "staff@example.com", phone: null },
  role: "STAFF",
  status: "INVITED",
  invitedAt: new Date("2026-09-05T12:30:00.000Z"),
  joinedAt: null,
  permissions: ["store:read"],
};

function repository(overrides: Partial<VendorRepository> = {}): VendorRepository {
  return {
    findMembership: vi.fn().mockResolvedValue(owner),
    findMember: vi.fn().mockResolvedValue(invitation),
    updateMember: vi.fn().mockResolvedValue(invitation),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as VendorRepository;
}

describe("vendor invitation membership policy", () => {
  it("does not let an owner activate an invitation through the generic member update endpoint", async () => {
    const repo = repository();
    const service = new VendorService(repo);

    await expect(service.updateMember(principal, vendorId, memberId, { status: "ACTIVE" })).rejects.toMatchObject({
      code: "INVITATION_ACCEPTANCE_REQUIRED",
      statusCode: 409,
    });
    expect(repo.updateMember).not.toHaveBeenCalled();
  });

  it("does not let an owner promote a pending invitation before the invited user accepts it", async () => {
    const repo = repository();
    const service = new VendorService(repo);

    await expect(service.updateMember(principal, vendorId, memberId, { role: "OWNER" })).rejects.toMatchObject({
      code: "INVITATION_ACCEPTANCE_REQUIRED",
      statusCode: 409,
    });
    expect(repo.updateMember).not.toHaveBeenCalled();
  });

  it("still permits preparation of an invitation's permission set", async () => {
    const updated = { ...invitation, permissions: ["store:read", "product:create"] } as VendorMemberRecord;
    const repo = repository({ updateMember: vi.fn().mockResolvedValue(updated) });
    const service = new VendorService(repo);

    const result = await service.updateMember(principal, vendorId, memberId, {
      permissions: ["store:read", "product:create"],
    });

    expect(result.status).toBe("INVITED");
    expect(result.permissions).toContain("product:create");
    expect(repo.updateMember).toHaveBeenCalledWith(vendorId, memberId, {
      permissions: ["store:read", "product:create"],
    });
  });

  it("lets staff delegate an effective read prerequisite they already hold through a stronger capability", async () => {
    const staffUserId = "77777777-7777-4777-8777-777777777777";
    const staffPrincipal: AccessPrincipal = {
      ...principal,
      userId: staffUserId,
    };
    const staffActor: VendorMembershipRecord = {
      ...owner,
      id: "88888888-8888-4888-8888-888888888888",
      userId: staffUserId,
      role: "STAFF",
      permissions: ["staff:update"],
    };
    const updated = { ...invitation, permissions: ["staff:read"] } as VendorMemberRecord;
    const repo = repository({
      findMembership: vi.fn().mockResolvedValue(staffActor),
      updateMember: vi.fn().mockResolvedValue(updated),
    });
    const service = new VendorService(repo);

    const result = await service.updateMember(staffPrincipal, vendorId, memberId, {
      permissions: ["staff:read"],
    });

    expect(result.permissions).toContain("staff:read");
    expect(repo.updateMember).toHaveBeenCalledWith(vendorId, memberId, {
      permissions: ["staff:read"],
    });
  });
});
