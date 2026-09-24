import { describe, expect, it, vi } from "vitest";
import type { PlatformRoleDto } from "@repo/contracts";
import type { DatabaseClient } from "@repo/database";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";
import { AdminService } from "./admin.service.js";

const superAdmin: AccessPrincipal = {
  userId: "123e4567-e89b-12d3-a456-426614174000",
  sessionId: "123e4567-e89b-12d3-a456-426614174001",
  platformRole: "SUPER_ADMIN",
  mfaSatisfied: true,
};

const admin: AccessPrincipal = {
  ...superAdmin,
  userId: "123e4567-e89b-12d3-a456-426614174002",
  platformRole: "ADMIN",
};

type TestUser = {
  id: string;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  platformRole: PlatformRoleDto;
  createdAt: Date;
  updatedAt: Date;
};

const target: TestUser = {
  id: "123e4567-e89b-12d3-a456-426614174010",
  email: "member@example.com",
  normalizedEmail: "member@example.com",
  phone: null,
  normalizedPhone: null,
  passwordHash: null,
  emailVerifiedAt: new Date("2026-09-01T08:00:00.000Z"),
  phoneVerifiedAt: null,
  status: "ACTIVE" as const,
  platformRole: "USER" as const,
  createdAt: new Date("2026-09-01T08:00:00.000Z"),
  updatedAt: new Date("2026-09-01T08:00:00.000Z"),
};

function serviceWith(overrides?: {
  existing?: TestUser | null;
  superAdminCount?: number;
}) {
  const existing = overrides && "existing" in overrides ? overrides.existing : target;
  const updated = { ...target, platformRole: "ADMIN" as const };
  const tx = {
    user: {
      count: vi.fn(async () => overrides?.superAdminCount ?? 2),
      update: vi.fn(async () => updated),
    },
    authSession: {
      updateMany: vi.fn(async () => ({ count: 2 })),
    },
    auditLog: {
      create: vi.fn(async () => ({ id: "audit-1" })),
    },
  };
  const database = {
    user: {
      findUnique: vi.fn(async () => existing),
    },
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  } as unknown as DatabaseClient;

  return {
    service: new AdminService(database, {} as VendorOwnershipBoundary),
    database,
    tx,
  };
}

describe("AdminService user role management", () => {
  it("requires SUPER_ADMIN for role changes", async () => {
    const { service } = serviceWith();

    await expect(
      service.setUserPlatformRole(admin, target.id, "ADMIN"),
    ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("prevents a SUPER_ADMIN from changing their own role", async () => {
    const { service } = serviceWith();

    await expect(
      service.setUserPlatformRole(superAdmin, superAdmin.userId, "USER"),
    ).rejects.toMatchObject({ code: "SELF_ROLE_CHANGE_FORBIDDEN", statusCode: 409 });
  });

  it("revokes active sessions after a role change", async () => {
    const { service, tx } = serviceWith();

    const changed = await service.setUserPlatformRole(superAdmin, target.id, "ADMIN");

    expect(changed.platformRole).toBe("ADMIN");
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: target.id },
      data: { platformRole: "ADMIN" },
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: target.id, revokedAt: null },
      data: expect.objectContaining({ revokedReason: "platform-role-changed" }),
    });
  });

  it("protects the final SUPER_ADMIN account", async () => {
    const superTarget = { ...target, platformRole: "SUPER_ADMIN" as const };
    const { service } = serviceWith({ existing: superTarget, superAdminCount: 1 });

    await expect(
      service.setUserPlatformRole(superAdmin, superTarget.id, "ADMIN"),
    ).rejects.toMatchObject({ code: "LAST_SUPER_ADMIN_REQUIRED", statusCode: 409 });
  });
});
