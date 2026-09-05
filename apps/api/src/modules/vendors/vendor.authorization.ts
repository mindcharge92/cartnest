import type { VendorPermissionDto } from "@repo/contracts";

export const ALL_VENDOR_PERMISSIONS: readonly VendorPermissionDto[] = [
  "store:create",
  "store:read",
  "store:update",
  "product:create",
  "product:read",
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

const READ_PERMISSION_IMPLICATIONS: Readonly<
  Partial<Record<VendorPermissionDto, readonly VendorPermissionDto[]>>
> = {
  "store:read": [
    "store:update",
    "product:create",
    "product:read",
    "product:update",
    "product:archive",
    "inventory:read",
    "inventory:adjust",
    "order:read",
    "order:process",
    "order:fulfill",
    "refund:request",
    "analytics:read",
  ],
  "product:read": ["product:create", "product:update", "product:archive"],
  "inventory:read": ["inventory:adjust"],
  "order:read": ["order:process", "order:fulfill", "refund:request"],
  "staff:read": ["staff:invite", "staff:update", "staff:remove"],
};

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

function expandStaffPermissions(permissions: readonly string[]): VendorPermissionDto[] {
  const expanded = new Set(
    permissions.filter((permission): permission is VendorPermissionDto =>
      ALL_VENDOR_PERMISSIONS.includes(permission as VendorPermissionDto),
    ),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const [readPermission, capabilities] of Object.entries(READ_PERMISSION_IMPLICATIONS) as Array<
      [VendorPermissionDto, readonly VendorPermissionDto[]]
    >) {
      if (expanded.has(readPermission)) continue;
      if (capabilities.some((permission) => expanded.has(permission))) {
        expanded.add(readPermission);
        changed = true;
      }
    }
  }

  return ALL_VENDOR_PERMISSIONS.filter((permission) => expanded.has(permission));
}

function staffHasPermission(membership: VendorMembershipContext, permission: VendorPermissionDto): boolean {
  return expandStaffPermissions(membership.permissions).includes(permission);
}

export function requireVendorPermission(
  membership: VendorMembershipContext,
  permission: VendorPermissionDto,
): void {
  requireActiveVendorMembership(membership);
  if (membership.role === "OWNER") return;
  if (!staffHasPermission(membership, permission)) {
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
  return expandStaffPermissions(membership.permissions);
}
