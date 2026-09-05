import type {
  CreateStoreBodyDto,
  CreateVendorBodyDto,
  InviteVendorMemberBodyDto,
  PaymentProviderAccountDto,
  PaymentProviderDto,
  RecordPaymentProviderAccountBodyDto,
  ReviewVendorVerificationBodyDto,
  StoreDto,
  SubmitVendorVerificationBodyDto,
  UpdateStoreBodyDto,
  UpdateVendorMemberBodyDto,
  VendorAccessDto,
  VendorDto,
  VendorMemberDto,
  VendorMembershipDto,
  VendorPermissionDto,
  VendorStatusDto,
  VendorVerificationDto,
} from "@repo/contracts";
import {
  normalizeAccountIdentifier,
  requirePlatformRole,
  requirePrivilegedMfa,
  type AccessPrincipal,
} from "../auth/auth.public.js";
import {
  effectiveVendorPermissions,
  requireActiveVendorMembership,
  requireVendorOwner,
  requireVendorPermission,
} from "./vendor.authorization.js";
import type {
  ProviderAccountRecord,
  StoreRecord,
  VendorAccessRecord,
  VendorMemberRecord,
  VendorMembershipRecord,
  VendorRecord,
  VendorRepository,
  VerificationRecord,
} from "./vendor.repository.js";

export class VendorError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "VendorError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toVendor(record: VendorRecord): VendorDto {
  return {
    id: record.id,
    displayName: record.displayName,
    legalName: record.legalName,
    registrationNumber: record.registrationNumber,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toMembership(record: VendorMembershipRecord): VendorMembershipDto {
  return {
    id: record.id,
    vendorId: record.vendorId,
    userId: record.userId,
    role: record.role,
    status: record.status,
    permissions: [...effectiveVendorPermissions(record)],
    joinedAt: record.joinedAt?.toISOString() ?? null,
  };
}

function toAccess(record: VendorAccessRecord): VendorAccessDto {
  return { vendor: toVendor(record.vendor), membership: toMembership(record.membership) };
}

function toMember(record: VendorMemberRecord): VendorMemberDto {
  return {
    id: record.id,
    vendorId: record.vendorId,
    user: record.user,
    role: record.role,
    status: record.status,
    permissions: [...effectiveVendorPermissions(record)],
    invitedAt: record.invitedAt?.toISOString() ?? null,
    joinedAt: record.joinedAt?.toISOString() ?? null,
  };
}

function toVerification(record: VerificationRecord): VendorVerificationDto {
  return {
    id: record.id,
    vendorId: record.vendorId,
    type: record.type,
    status: record.status,
    reference: record.reference,
    reviewedBy: record.reviewedBy,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toStore(record: StoreRecord): StoreDto {
  return {
    id: record.id,
    vendorId: record.vendorId,
    name: record.name,
    slug: record.slug,
    description: record.description,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toProviderAccount(record: ProviderAccountRecord): PaymentProviderAccountDto {
  return {
    id: record.id,
    vendorId: record.vendorId,
    provider: record.provider,
    externalSubaccountId: record.externalSubaccountId,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class VendorService {
  constructor(private readonly repository: VendorRepository) {}

  private async membershipFor(principal: AccessPrincipal, vendorId: string): Promise<VendorMembershipRecord> {
    const membership = await this.repository.findMembership(vendorId, principal.userId);
    requireActiveVendorMembership(membership);
    return membership;
  }

  private requireAdmin(principal: AccessPrincipal): void {
    requirePlatformRole(principal, ["ADMIN", "SUPER_ADMIN"]);
    requirePrivilegedMfa(principal);
  }

  private async audit(
    principal: AccessPrincipal,
    action: string,
    entityType: string,
    entityId: string,
    requestId?: string,
    metadata?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await this.repository.writeAudit({
      actorType: "USER",
      actorUserId: principal.userId,
      action,
      entityType,
      entityId,
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadata } : {}),
    });
  }

  async createVendor(
    principal: AccessPrincipal,
    input: CreateVendorBodyDto,
    requestId?: string,
  ): Promise<VendorAccessDto> {
    const user = await this.repository.findUserIdentity(principal.userId);
    if (!user) throw new VendorError("USER_NOT_FOUND", "User account was not found.", 404);
    if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw new VendorError(
        "VERIFIED_IDENTIFIER_REQUIRED",
        "Verify an email address or phone number before applying as a vendor.",
        409,
      );
    }
    const created = await this.repository.createVendorWithOwner(principal.userId, input);
    await this.audit(principal, "vendor.application.created", "Vendor", created.vendor.id, requestId);
    return toAccess(created);
  }

  async listMyVendors(principal: AccessPrincipal): Promise<VendorAccessDto[]> {
    return (await this.repository.listVendorsForUser(principal.userId)).map(toAccess);
  }

  async getVendor(principal: AccessPrincipal, vendorId: string): Promise<VendorAccessDto> {
    const [vendor, membership] = await Promise.all([
      this.repository.findVendor(vendorId),
      this.membershipFor(principal, vendorId),
    ]);
    if (!vendor) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    return toAccess({ vendor, membership });
  }

  async submitVerification(
    principal: AccessPrincipal,
    vendorId: string,
    input: SubmitVendorVerificationBodyDto,
    requestId?: string,
  ): Promise<VendorVerificationDto> {
    const membership = await this.membershipFor(principal, vendorId);
    requireVendorPermission(membership, "verification:manage");
    const existing = await this.repository.listVerifications(vendorId);
    if (existing.some((entry) => entry.type === input.type && entry.status === "PENDING")) {
      throw new VendorError(
        "VERIFICATION_ALREADY_PENDING",
        "A verification of this type is already pending review.",
        409,
      );
    }
    const record = await this.repository.createVerification(vendorId, input.type, input.reference);
    await this.audit(
      principal,
      "vendor.verification.submitted",
      "VendorVerification",
      record.id,
      requestId,
      { vendorId, type: input.type },
    );
    return toVerification(record);
  }

  async listVerifications(principal: AccessPrincipal, vendorId: string): Promise<VendorVerificationDto[]> {
    const membership = await this.membershipFor(principal, vendorId);
    requireVendorPermission(membership, "verification:manage");
    return (await this.repository.listVerifications(vendorId)).map(toVerification);
  }

  async createStore(
    principal: AccessPrincipal,
    vendorId: string,
    input: CreateStoreBodyDto,
    requestId?: string,
  ): Promise<StoreDto> {
    const membership = await this.membershipFor(principal, vendorId);
    requireVendorPermission(membership, "store:create");
    if (await this.repository.findStoreBySlug(input.slug)) {
      throw new VendorError("STORE_SLUG_TAKEN", "That store slug is already in use.", 409);
    }
    const store = await this.repository.createStore(vendorId, input);
    await this.audit(principal, "store.created", "Store", store.id, requestId, { vendorId });
    return toStore(store);
  }

  async listStores(principal: AccessPrincipal, vendorId: string): Promise<StoreDto[]> {
    const membership = await this.membershipFor(principal, vendorId);
    requireVendorPermission(membership, "store:read");
    return (await this.repository.listStores(vendorId)).map(toStore);
  }

  async requireStorePermission(
    principal: AccessPrincipal,
    storeId: string,
    permission: VendorPermissionDto,
  ): Promise<{ store: StoreRecord; membership: VendorMembershipRecord; vendor: VendorRecord }> {
    const store = await this.repository.findStore(storeId);
    if (!store) throw new VendorError("STORE_NOT_FOUND", "Store was not found.", 404);
    const membership = await this.membershipFor(principal, store.vendorId);
    requireVendorPermission(membership, permission);
    const vendor = await this.repository.findVendor(store.vendorId);
    if (!vendor) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    return { store, membership, vendor };
  }

  async updateStore(
    principal: AccessPrincipal,
    storeId: string,
    input: UpdateStoreBodyDto,
    requestId?: string,
  ): Promise<StoreDto> {
    const context = await this.requireStorePermission(principal, storeId, "store:update");
    if (input.slug && input.slug !== context.store.slug) {
      const collision = await this.repository.findStoreBySlug(input.slug);
      if (collision && collision.id !== storeId) {
        throw new VendorError("STORE_SLUG_TAKEN", "That store slug is already in use.", 409);
      }
    }
    const updated = await this.repository.updateStore(storeId, input);
    if (!updated) throw new VendorError("STORE_NOT_FOUND", "Store was not found.", 404);
    await this.audit(principal, "store.updated", "Store", storeId, requestId);
    return toStore(updated);
  }

  async activateStore(principal: AccessPrincipal, storeId: string, requestId?: string): Promise<StoreDto> {
    const context = await this.requireStorePermission(principal, storeId, "store:update");
    if (context.vendor.status !== "APPROVED") {
      throw new VendorError(
        "VENDOR_NOT_APPROVED",
        "The vendor must be approved before a store can become active.",
        409,
      );
    }
    if (context.store.status === "CLOSED") {
      throw new VendorError("STORE_CLOSED", "A closed store cannot be activated.", 409);
    }
    const updated = await this.repository.setStoreStatus(storeId, "ACTIVE");
    if (!updated) throw new VendorError("STORE_NOT_FOUND", "Store was not found.", 404);
    await this.audit(principal, "store.activated", "Store", storeId, requestId);
    return toStore(updated);
  }

  async closeStore(principal: AccessPrincipal, storeId: string, requestId?: string): Promise<StoreDto> {
    await this.requireStorePermission(principal, storeId, "store:update");
    const updated = await this.repository.setStoreStatus(storeId, "CLOSED");
    if (!updated) throw new VendorError("STORE_NOT_FOUND", "Store was not found.", 404);
    await this.audit(principal, "store.closed", "Store", storeId, requestId);
    return toStore(updated);
  }

  async listMembers(principal: AccessPrincipal, vendorId: string): Promise<VendorMemberDto[]> {
    const membership = await this.membershipFor(principal, vendorId);
    requireVendorPermission(membership, "staff:read");
    return (await this.repository.listMembers(vendorId)).map(toMember);
  }

  async inviteMember(
    principal: AccessPrincipal,
    vendorId: string,
    input: InviteVendorMemberBodyDto,
    requestId?: string,
  ): Promise<VendorMemberDto> {
    const actor = await this.membershipFor(principal, vendorId);
    requireVendorPermission(actor, "staff:invite");

    if (actor.role === "STAFF") {
      const actorPermissions = new Set(effectiveVendorPermissions(actor));
      const disallowed = input.permissions.filter((permission) => !actorPermissions.has(permission));
      if (disallowed.length > 0) {
        throw new VendorError(
          "PERMISSION_DELEGATION_FORBIDDEN",
          "Staff cannot delegate permissions they do not hold.",
          403,
        );
      }
    }

    let normalized: string;
    try {
      normalized = normalizeAccountIdentifier(input.identifier);
    } catch {
      throw new VendorError("INVALID_MEMBER_IDENTIFIER", "Enter a valid CartNest email or phone number.", 400);
    }
    const user = await this.repository.findUserByIdentifier(normalized);
    if (!user) {
      throw new VendorError(
        "MEMBER_ACCOUNT_NOT_FOUND",
        "The invited person must already have a CartNest account in the P3 baseline.",
        404,
      );
    }
    if (user.id === principal.userId) {
      throw new VendorError("SELF_INVITE_FORBIDDEN", "You cannot invite yourself.", 409);
    }
    const existing = await this.repository.findMembership(vendorId, user.id);
    if (existing && existing.status !== "REMOVED") {
      throw new VendorError("MEMBER_ALREADY_EXISTS", "That user already has a vendor membership.", 409);
    }

    const member = await this.repository.inviteMember(vendorId, user.id, input.permissions, new Date());
    await this.audit(
      principal,
      "vendor.member.invited",
      "VendorMember",
      member.id,
      requestId,
      { vendorId, invitedUserId: user.id },
    );
    return toMember(member);
  }

  async acceptInvitation(
    principal: AccessPrincipal,
    vendorId: string,
    requestId?: string,
  ): Promise<VendorMembershipDto> {
    const accepted = await this.repository.acceptInvitation(vendorId, principal.userId, new Date());
    if (!accepted) {
      throw new VendorError("INVITATION_NOT_FOUND", "No pending vendor invitation was found.", 404);
    }
    await this.audit(
      principal,
      "vendor.member.invitation.accepted",
      "VendorMember",
      accepted.id,
      requestId,
      { vendorId },
    );
    return toMembership(accepted);
  }

  async updateMember(
    principal: AccessPrincipal,
    vendorId: string,
    memberId: string,
    input: UpdateVendorMemberBodyDto,
    requestId?: string,
  ): Promise<VendorMemberDto> {
    const actor = await this.membershipFor(principal, vendorId);
    requireVendorPermission(actor, "staff:update");
    const target = await this.repository.findMember(vendorId, memberId);
    if (!target || target.status === "REMOVED") {
      throw new VendorError("VENDOR_MEMBER_NOT_FOUND", "Vendor member was not found.", 404);
    }
    if (target.userId === principal.userId) {
      throw new VendorError(
        "SELF_MEMBERSHIP_CHANGE_FORBIDDEN",
        "Use another vendor owner to change your own membership.",
        409,
      );
    }
    if (target.status === "INVITED" && (input.role !== undefined || input.status !== undefined)) {
      throw new VendorError(
        "INVITATION_ACCEPTANCE_REQUIRED",
        "The invited user must accept the vendor invitation before role or membership status can change.",
        409,
      );
    }
    if (target.role === "OWNER" && actor.role !== "OWNER") {
      throw new VendorError("VENDOR_OWNER_REQUIRED", "Only an owner can change another owner.", 403);
    }
    if (input.role && actor.role !== "OWNER") {
      throw new VendorError("VENDOR_OWNER_REQUIRED", "Only an owner can change membership roles.", 403);
    }
    if (actor.role === "STAFF" && input.permissions) {
      const actorPermissions = new Set(effectiveVendorPermissions(actor));
      if (input.permissions.some((permission) => !actorPermissions.has(permission))) {
        throw new VendorError(
          "PERMISSION_DELEGATION_FORBIDDEN",
          "Staff cannot delegate permissions they do not hold.",
          403,
        );
      }
    }

    const wouldRemoveActiveOwner =
      target.role === "OWNER" &&
      target.status === "ACTIVE" &&
      (input.role === "STAFF" || input.status === "SUSPENDED");
    if (wouldRemoveActiveOwner && (await this.repository.countActiveOwners(vendorId)) <= 1) {
      throw new VendorError("LAST_OWNER_REQUIRED", "A vendor must always retain an active owner.", 409);
    }

    const updated = await this.repository.updateMember(vendorId, memberId, input);
    if (!updated) throw new VendorError("VENDOR_MEMBER_NOT_FOUND", "Vendor member was not found.", 404);
    await this.audit(principal, "vendor.member.updated", "VendorMember", memberId, requestId, { vendorId });
    return toMember(updated);
  }

  async removeMember(
    principal: AccessPrincipal,
    vendorId: string,
    memberId: string,
    requestId?: string,
  ): Promise<void> {
    const actor = await this.membershipFor(principal, vendorId);
    requireVendorPermission(actor, "staff:remove");
    const target = await this.repository.findMember(vendorId, memberId);
    if (!target || target.status === "REMOVED") {
      throw new VendorError("VENDOR_MEMBER_NOT_FOUND", "Vendor member was not found.", 404);
    }
    if (target.userId === principal.userId) {
      throw new VendorError("SELF_REMOVAL_FORBIDDEN", "You cannot remove your own membership here.", 409);
    }
    if (target.role === "OWNER") {
      requireVendorOwner(actor);
      if (target.status === "ACTIVE" && (await this.repository.countActiveOwners(vendorId)) <= 1) {
        throw new VendorError("LAST_OWNER_REQUIRED", "A vendor must always retain an active owner.", 409);
      }
    }
    await this.repository.removeMember(vendorId, memberId);
    await this.audit(principal, "vendor.member.removed", "VendorMember", memberId, requestId, { vendorId });
  }

  async listProviderAccounts(
    principal: AccessPrincipal,
    vendorId: string,
  ): Promise<PaymentProviderAccountDto[]> {
    const membership = await this.membershipFor(principal, vendorId);
    requireVendorPermission(membership, "provider-account:read");
    return (await this.repository.listProviderAccounts(vendorId)).map(toProviderAccount);
  }

  async listAdminVendors(principal: AccessPrincipal, status?: VendorStatusDto): Promise<VendorDto[]> {
    this.requireAdmin(principal);
    return (await this.repository.listAdminVendors(status)).map(toVendor);
  }

  async approveVendor(
    principal: AccessPrincipal,
    vendorId: string,
    requestId?: string,
  ): Promise<VendorDto> {
    this.requireAdmin(principal);
    const vendor = await this.repository.findVendor(vendorId);
    if (!vendor) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    if (!["PENDING", "REJECTED", "SUSPENDED"].includes(vendor.status)) {
      throw new VendorError("INVALID_VENDOR_STATE", "Vendor cannot be approved from its current state.", 409);
    }
    const verifications = await this.repository.listVerifications(vendorId);
    const hasBusiness = verifications.some((entry) => entry.type === "BUSINESS" && entry.status === "VERIFIED");
    const hasIdentity = verifications.some((entry) => entry.type === "IDENTITY" && entry.status === "VERIFIED");
    if (!hasBusiness || !hasIdentity) {
      throw new VendorError(
        "VENDOR_KYC_INCOMPLETE",
        "Verified BUSINESS and IDENTITY checks are required before approval.",
        409,
      );
    }
    const updated = await this.repository.setVendorStatus(vendorId, "APPROVED", new Date());
    if (!updated) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    await this.audit(principal, "vendor.approved", "Vendor", vendorId, requestId);
    return toVendor(updated);
  }

  async rejectVendor(
    principal: AccessPrincipal,
    vendorId: string,
    reason: string | undefined,
    requestId?: string,
  ): Promise<VendorDto> {
    this.requireAdmin(principal);
    const vendor = await this.repository.findVendor(vendorId);
    if (!vendor) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    if (vendor.status !== "PENDING") {
      throw new VendorError("INVALID_VENDOR_STATE", "Only a pending vendor can be rejected.", 409);
    }
    const updated = await this.repository.setVendorStatus(vendorId, "REJECTED", new Date());
    if (!updated) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    await this.audit(
      principal,
      "vendor.rejected",
      "Vendor",
      vendorId,
      requestId,
      reason ? { reason } : undefined,
    );
    return toVendor(updated);
  }

  async suspendVendor(
    principal: AccessPrincipal,
    vendorId: string,
    reason: string | undefined,
    requestId?: string,
  ): Promise<VendorDto> {
    this.requireAdmin(principal);
    const vendor = await this.repository.findVendor(vendorId);
    if (!vendor) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    if (vendor.status !== "APPROVED") {
      throw new VendorError("INVALID_VENDOR_STATE", "Only an approved vendor can be suspended.", 409);
    }
    const updated = await this.repository.setVendorStatus(vendorId, "SUSPENDED", new Date());
    if (!updated) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    await this.audit(
      principal,
      "vendor.suspended",
      "Vendor",
      vendorId,
      requestId,
      reason ? { reason } : undefined,
    );
    return toVendor(updated);
  }

  async reviewVerification(
    principal: AccessPrincipal,
    verificationId: string,
    input: ReviewVendorVerificationBodyDto,
    requestId?: string,
  ): Promise<VendorVerificationDto> {
    this.requireAdmin(principal);
    const current = await this.repository.findVerification(verificationId);
    if (!current) {
      throw new VendorError("VERIFICATION_NOT_FOUND", "Vendor verification was not found.", 404);
    }
    if (current.status !== "PENDING") {
      throw new VendorError("INVALID_VERIFICATION_STATE", "Only pending verification can be reviewed.", 409);
    }
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : undefined;
    const updated = await this.repository.reviewVerification(
      verificationId,
      input.status,
      principal.userId,
      new Date(),
      expiresAt,
    );
    if (!updated) throw new VendorError("VERIFICATION_NOT_FOUND", "Vendor verification was not found.", 404);
    await this.audit(
      principal,
      `vendor.verification.${input.status.toLowerCase()}`,
      "VendorVerification",
      verificationId,
      requestId,
      {
        vendorId: current.vendorId,
        type: current.type,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    );
    return toVerification(updated);
  }

  async recordProviderAccount(
    principal: AccessPrincipal,
    vendorId: string,
    input: RecordPaymentProviderAccountBodyDto,
    requestId?: string,
  ): Promise<PaymentProviderAccountDto> {
    this.requireAdmin(principal);
    const vendor = await this.repository.findVendor(vendorId);
    if (!vendor) throw new VendorError("VENDOR_NOT_FOUND", "Vendor was not found.", 404);
    const account = await this.repository.upsertProviderAccount(
      vendorId,
      input.provider,
      input.externalSubaccountId,
    );
    await this.audit(
      principal,
      "vendor.provider-account.recorded",
      "PaymentProviderAccount",
      account.id,
      requestId,
      { vendorId, provider: input.provider },
    );
    return toProviderAccount(account);
  }

  async updateProviderAccountStatus(
    principal: AccessPrincipal,
    vendorId: string,
    provider: PaymentProviderDto,
    status: "ACTIVE" | "SUSPENDED" | "DISABLED",
    reason: string | undefined,
    requestId?: string,
  ): Promise<PaymentProviderAccountDto> {
    this.requireAdmin(principal);
    if (status === "ACTIVE") {
      const verifications = await this.repository.listVerifications(vendorId);
      if (!verifications.some((entry) => entry.type === "BANK_ACCOUNT" && entry.status === "VERIFIED")) {
        throw new VendorError(
          "BANK_VERIFICATION_REQUIRED",
          "A verified bank-account check is required before provider settlement can be activated.",
          409,
        );
      }
    }
    const updated = await this.repository.setProviderAccountStatus(vendorId, provider, status);
    if (!updated) {
      throw new VendorError("PROVIDER_ACCOUNT_NOT_FOUND", "Payment provider account was not found.", 404);
    }
    await this.audit(
      principal,
      "vendor.provider-account.status-changed",
      "PaymentProviderAccount",
      updated.id,
      requestId,
      {
        vendorId,
        provider,
        status,
        ...(reason ? { reason } : {}),
      },
    );
    return toProviderAccount(updated);
  }
}
