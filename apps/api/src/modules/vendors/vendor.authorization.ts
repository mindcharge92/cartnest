import type { VendorPermissionDto } from "@repo/contracts";

export const ALL_VENDOR_PERMISSIONS: readonly VendorPermissionDto[] = [
  "store:create",
  "store:read",
  "store:update",
  "product:create",
  "product:update",
  "product:archive",
  "inventory:read",
  "inventory:adjust",
  "order:read",
  "order:process",
  "order:fulfill",
  "refund:request",
  "staff:read",
  "staff:invite",
  "staff:update",
  "staff:remove",
  "analytics:read",
  "verification:manage",
  "provider-account:read",
] as const;

export interface VendorMembershipContext {
  readonly id: string;
  readonly vendorId: string;
  readonly userId: string;
  readonly role: "OWNER" | "STAFF";
  readonly status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
  readonly permissions: readonly string[];
}

export class VendorAuthorizationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 403) {
    super(message);
    this.name = "VendorAuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function requireActiveVendorMembership(
  membership: VendorMembershipContext | null | undefined,
): asserts membership is VendorMembershipContext {
  if (!membership || membership.status !== "ACTIVE") {
    throw new VendorAuthorizationError(
      "VENDOR_ACCESS_DENIED",
      "You do not have active access to this vendor.",
    );
  }
}

export function requireVendorOwner(membership: VendorMembershipContext): void {
  requireActiveVendorMembership(membership);
  if (membership.role !== "OWNER") {
    throw new VendorAuthorizationError(
      "VENDOR_OWNER_REQUIRED",
      "Vendor-owner access is required for this action.",
    );
  }
}

export function requireVendorPermission(
  membership: VendorMembershipContext,
  permission: VendorPermissionDto,
): void {
  requireActiveVendorMembership(membership);
  if (membership.role === "OWNER") return;
  if (!membership.permissions.includes(permission)) {
    throw new VendorAuthorizationError(
      "VENDOR_PERMISSION_REQUIRED",
      `The ${permission} permission is required for this action.`,
    );
  }
}

export function effectiveVendorPermissions(
  membership: VendorMembershipContext,
): readonly VendorPermissionDto[] {
  if (membership.role === "OWNER" && membership.status === "ACTIVE") {
    return ALL_VENDOR_PERMISSIONS;
  }
  return membership.permissions.filter((permission): permission is VendorPermissionDto =>
    ALL_VENDOR_PERMISSIONS.includes(permission as VendorPermissionDto),
  );
}
