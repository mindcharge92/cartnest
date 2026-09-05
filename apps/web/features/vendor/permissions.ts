import type { VendorAccessDto, VendorPermissionDto } from "@repo/contracts";

export interface PermissionOption {
  readonly value: VendorPermissionDto;
  readonly label: string;
  readonly description: string;
}

export interface PermissionGroup {
  readonly label: string;
  readonly options: readonly PermissionOption[];
}

export const VENDOR_PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    label: "Stores",
    options: [
      { value: "store:create", label: "Create stores", description: "Create additional storefronts for this vendor." },
      { value: "store:read", label: "View stores", description: "View store configuration and operational state." },
      { value: "store:update", label: "Manage stores", description: "Edit, activate, or close stores." },
    ],
  },
  {
    label: "Catalog",
    options: [
      { value: "product:create", label: "Create products", description: "Create products and variants." },
      { value: "product:update", label: "Manage products", description: "Edit product, variant, and media details." },
      { value: "product:archive", label: "Archive products", description: "Remove products from active sale." },
    ],
  },
  {
    label: "Inventory",
    options: [
      { value: "inventory:read", label: "View inventory", description: "See variant-level inventory." },
      { value: "inventory:adjust", label: "Adjust inventory", description: "Create auditable stock adjustments." },
    ],
  },
  {
    label: "Orders and fulfillment",
    options: [
      { value: "order:read", label: "View orders", description: "View the vendor's order slice." },
      { value: "order:process", label: "Process orders", description: "Move orders through allowed processing states." },
      { value: "order:fulfill", label: "Fulfill orders", description: "Create and update shipment/fulfillment records." },
      { value: "refund:request", label: "Request refunds", description: "Submit permitted refund requests." },
    ],
  },
  {
    label: "Team",
    options: [
      { value: "staff:read", label: "View staff", description: "View vendor members and permissions." },
      { value: "staff:invite", label: "Invite staff", description: "Invite existing CartNest users to the vendor." },
      { value: "staff:update", label: "Manage staff", description: "Change staff role, state, and permissions." },
      { value: "staff:remove", label: "Remove staff", description: "Remove vendor memberships subject to owner safeguards." },
    ],
  },
  {
    label: "Business operations",
    options: [
      { value: "analytics:read", label: "View analytics", description: "View vendor and store analytics." },
      { value: "verification:manage", label: "Manage verification", description: "Submit and review vendor KYC state available to the vendor." },
      { value: "provider-account:read", label: "View settlement accounts", description: "View provider-account/subaccount state." },
    ],
  },
] as const;

export const ALL_VENDOR_PERMISSIONS = VENDOR_PERMISSION_GROUPS.flatMap((group) =>
  group.options.map((option) => option.value),
);

export function hasVendorPermission(access: VendorAccessDto, permission: VendorPermissionDto): boolean {
  if (access.membership.status !== "ACTIVE") return false;
  if (access.membership.role === "OWNER") return true;
  return access.membership.permissions.includes(permission);
}

export function canManageVerification(access: VendorAccessDto): boolean {
  return access.membership.status === "ACTIVE" &&
    (access.membership.role === "OWNER" || access.membership.permissions.includes("verification:manage"));
}

export function vendorWorkspacePath(vendorId: string): string {
  return `/vendor/${encodeURIComponent(vendorId)}`;
}
