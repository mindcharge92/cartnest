import type { VendorPermissionDto } from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { VendorService } from "./vendor.service.js";

export interface StoreAccessContext {
  readonly store: {
    readonly id: string;
    readonly vendorId: string;
    readonly status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  };
  readonly vendor: {
    readonly id: string;
    readonly status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  };
}

export interface VendorOwnershipBoundary {
  requireStorePermission(
    principal: AccessPrincipal,
    storeId: string,
    permission: VendorPermissionDto,
  ): Promise<StoreAccessContext>;
}

export function asVendorOwnershipBoundary(service: VendorService): VendorOwnershipBoundary {
  return service;
}
