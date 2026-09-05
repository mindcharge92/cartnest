import {
  type DatabaseClient,
  writeAuditEntry,
} from "@repo/database";

export type VendorStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type VendorMemberRole = "OWNER" | "STAFF";
export type VendorMemberStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
export type VerificationType = "BUSINESS" | "IDENTITY" | "BANK_ACCOUNT" | "OTHER";
export type VerificationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED";
export type StoreStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
export type PaymentProvider = "PAYSTACK" | "FLUTTERWAVE";
export type ProviderAccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "DISABLED";

export interface UserIdentityRecord {
  readonly id: string;
  readonly email: string | null;
  readonly normalizedEmail: string | null;
  readonly phone: string | null;
  readonly normalizedPhone: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
}

export interface VendorRecord {
  readonly id: string;
  readonly displayName: string;
  readonly legalName: string | null;
  readonly registrationNumber: string | null;
  readonly status: VendorStatus;
  readonly approvedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorMembershipRecord {
  readonly id: string;
  readonly vendorId: string;
  readonly userId: string;
  readonly role: VendorMemberRole;
  readonly status: VendorMemberStatus;
  readonly invitedAt: Date | null;
  readonly joinedAt: Date | null;
  readonly permissions: readonly string[];
}

export interface VendorMemberRecord extends VendorMembershipRecord {
  readonly user: {
    readonly id: string;
    readonly email: string | null;
    readonly phone: string | null;
  };
}

export interface VendorAccessRecord {
  readonly vendor: VendorRecord;
  readonly membership: VendorMembershipRecord;
}

export interface VerificationRecord {
  readonly id: string;
  readonly vendorId: string;
  readonly type: VerificationType;
  readonly status: VerificationStatus;
  readonly reference: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoreRecord {
  readonly id: string;
  readonly vendorId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly status: StoreStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProviderAccountRecord {
  readonly id: string;
  readonly vendorId: string;
  readonly provider: PaymentProvider;
  readonly externalSubaccountId: string;
  readonly status: ProviderAccountStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorRepository {
  findUserIdentity(userId: string): Promise<UserIdentityRecord | null>;
  findUserByIdentifier(normalizedIdentifier: string): Promise<UserIdentityRecord | null>;
  createVendorWithOwner(userId: string, input: { displayName: string; legalName?: string; registrationNumber?: string }): Promise<VendorAccessRecord>;
  findVendor(vendorId: string): Promise<VendorRecord | null>;
  listVendorsForUser(userId: string): Promise<VendorAccessRecord[]>;
  listAdminVendors(status?: VendorStatus): Promise<VendorRecord[]>;
  findMembership(vendorId: string, userId: string): Promise<VendorMembershipRecord | null>;
  listMembers(vendorId: string): Promise<VendorMemberRecord[]>;
  findMember(vendorId: string, memberId: string): Promise<VendorMemberRecord | null>;
  inviteMember(vendorId: string, userId: string, permissions: readonly string[], now: Date): Promise<VendorMemberRecord>;
  acceptInvitation(vendorId: string, userId: string, now: Date): Promise<VendorMembershipRecord | null>;
  updateMember(vendorId: string, memberId: string, input: { role?: VendorMemberRole; status?: "ACTIVE" | "SUSPENDED"; permissions?: readonly string[] }): Promise<VendorMemberRecord | null>;
  removeMember(vendorId: string, memberId: string): Promise<VendorMemberRecord | null>;
  countActiveOwners(vendorId: string): Promise<number>;
  createVerification(vendorId: string, type: VerificationType, reference?: string): Promise<VerificationRecord>;
  listVerifications(vendorId: string): Promise<VerificationRecord[]>;
  findVerification(verificationId: string): Promise<VerificationRecord | null>;
  reviewVerification(verificationId: string, status: "VERIFIED" | "REJECTED", reviewerId: string, reviewedAt: Date, expiresAt?: Date): Promise<VerificationRecord | null>;
  createStore(vendorId: string, input: { name: string; slug: string; description?: string }): Promise<StoreRecord>;
  listStores(vendorId: string): Promise<StoreRecord[]>;
  findStore(storeId: string): Promise<StoreRecord | null>;
  findStoreBySlug(slug: string): Promise<StoreRecord | null>;
  updateStore(storeId: string, input: { name?: string; slug?: string; description?: string }): Promise<StoreRecord | null>;
  setStoreStatus(storeId: string, status: StoreStatus): Promise<StoreRecord | null>;
  setVendorStatus(vendorId: string, status: VendorStatus, now: Date): Promise<VendorRecord | null>;
  listProviderAccounts(vendorId: string): Promise<ProviderAccountRecord[]>;
  upsertProviderAccount(vendorId: string, provider: PaymentProvider, externalSubaccountId: string): Promise<ProviderAccountRecord>;
  findProviderAccount(vendorId: string, provider: PaymentProvider): Promise<ProviderAccountRecord | null>;
  setProviderAccountStatus(vendorId: string, provider: PaymentProvider, status: "ACTIVE" | "SUSPENDED" | "DISABLED"): Promise<ProviderAccountRecord | null>;
  writeAudit(input: {
    actorType: "USER" | "SYSTEM" | "PROVIDER";
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void>;
}

function mapVendor(row: VendorRecord): VendorRecord {
  return row;
}

function mapMembership(row: {
  id: string;
  vendorId: string;
  userId: string;
  role: VendorMemberRole;
  status: VendorMemberStatus;
  invitedAt: Date | null;
  joinedAt: Date | null;
  permissions: readonly { permission: string }[];
}): VendorMembershipRecord {
  return {
    id: row.id,
    vendorId: row.vendorId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    invitedAt: row.invitedAt,
    joinedAt: row.joinedAt,
    permissions: row.permissions.map((entry) => entry.permission),
  };
}

function mapMember(row: {
  id: string;
  vendorId: string;
  userId: string;
  role: VendorMemberRole;
  status: VendorMemberStatus;
  invitedAt: Date | null;
  joinedAt: Date | null;
  permissions: readonly { permission: string }[];
  user: { id: string; email: string | null; phone: string | null };
}): VendorMemberRecord {
  return { ...mapMembership(row), user: row.user };
}

export class PrismaVendorRepository implements VendorRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findUserIdentity(userId: string): Promise<UserIdentityRecord | null> {
    return this.database.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        phone: true,
        normalizedPhone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    });
  }

  async findUserByIdentifier(normalizedIdentifier: string): Promise<UserIdentityRecord | null> {
    return this.database.user.findFirst({
      where: {
        OR: [
          { normalizedEmail: normalizedIdentifier },
          { normalizedPhone: normalizedIdentifier },
        ],
      },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        phone: true,
        normalizedPhone: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    });
  }

  async createVendorWithOwner(
    userId: string,
    input: { displayName: string; legalName?: string; registrationNumber?: string },
  ): Promise<VendorAccessRecord> {
    return this.database.$transaction(async (transaction) => {
      const vendor = await transaction.vendor.create({
        data: {
          displayName: input.displayName,
          ...(input.legalName ? { legalName: input.legalName } : {}),
          ...(input.registrationNumber ? { registrationNumber: input.registrationNumber } : {}),
        },
      });
      const membership = await transaction.vendorMember.create({
        data: {
          vendorId: vendor.id,
          userId,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        include: { permissions: true },
      });
      return { vendor: mapVendor(vendor), membership: mapMembership(membership) };
    });
  }

  async findVendor(vendorId: string): Promise<VendorRecord | null> {
    const vendor = await this.database.vendor.findUnique({ where: { id: vendorId } });
    return vendor ? mapVendor(vendor) : null;
  }

  async listVendorsForUser(userId: string): Promise<VendorAccessRecord[]> {
    const memberships = await this.database.vendorMember.findMany({
      where: { userId, status: { not: "REMOVED" } },
      include: { vendor: true, permissions: true },
      orderBy: { createdAt: "asc" },
    });
    return memberships.map((membership) => ({
      vendor: mapVendor(membership.vendor),
      membership: mapMembership(membership),
    }));
  }

  async listAdminVendors(status?: VendorStatus): Promise<VendorRecord[]> {
    const vendors = await this.database.vendor.findMany({
      ...(status ? { where: { status } } : {}),
      orderBy: { createdAt: "desc" },
    });
    return vendors.map(mapVendor);
  }

  async findMembership(vendorId: string, userId: string): Promise<VendorMembershipRecord | null> {
    const membership = await this.database.vendorMember.findUnique({
      where: { vendorId_userId: { vendorId, userId } },
      include: { permissions: true },
    });
    return membership ? mapMembership(membership) : null;
  }

  async listMembers(vendorId: string): Promise<VendorMemberRecord[]> {
    const rows = await this.database.vendorMember.findMany({
      where: { vendorId, status: { not: "REMOVED" } },
      include: {
        permissions: true,
        user: { select: { id: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(mapMember);
  }

  async findMember(vendorId: string, memberId: string): Promise<VendorMemberRecord | null> {
    const row = await this.database.vendorMember.findFirst({
      where: { id: memberId, vendorId },
      include: {
        permissions: true,
        user: { select: { id: true, email: true, phone: true } },
      },
    });
    return row ? mapMember(row) : null;
  }

  async inviteMember(
    vendorId: string,
    userId: string,
    permissions: readonly string[],
    now: Date,
  ): Promise<VendorMemberRecord> {
    await this.database.$transaction(async (transaction) => {
      const membership = await transaction.vendorMember.upsert({
        where: { vendorId_userId: { vendorId, userId } },
        create: {
          vendorId,
          userId,
          role: "STAFF",
          status: "INVITED",
          invitedAt: now,
        },
        update: {
          role: "STAFF",
          status: "INVITED",
          invitedAt: now,
          joinedAt: null,
        },
      });
      await transaction.vendorMemberPermission.deleteMany({ where: { vendorMemberId: membership.id } });
      if (permissions.length > 0) {
        await transaction.vendorMemberPermission.createMany({
          data: permissions.map((permission) => ({ vendorMemberId: membership.id, permission })),
          skipDuplicates: true,
        });
      }
    });
    const member = await this.database.vendorMember.findUnique({
      where: { vendorId_userId: { vendorId, userId } },
      include: {
        permissions: true,
        user: { select: { id: true, email: true, phone: true } },
      },
    });
    if (!member) throw new Error("Vendor membership disappeared after invite");
    return mapMember(member);
  }

  async acceptInvitation(vendorId: string, userId: string, now: Date): Promise<VendorMembershipRecord | null> {
    const result = await this.database.vendorMember.updateMany({
      where: { vendorId, userId, status: "INVITED" },
      data: { status: "ACTIVE", joinedAt: now },
    });
    if (result.count !== 1) return null;
    return this.findMembership(vendorId, userId);
  }

  async updateMember(
    vendorId: string,
    memberId: string,
    input: { role?: VendorMemberRole; status?: "ACTIVE" | "SUSPENDED"; permissions?: readonly string[] },
  ): Promise<VendorMemberRecord | null> {
    const exists = await this.database.vendorMember.findFirst({ where: { id: memberId, vendorId } });
    if (!exists) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.vendorMember.update({
        where: { id: memberId },
        data: {
          ...(input.role ? { role: input.role } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
      });
      if (input.permissions) {
        await transaction.vendorMemberPermission.deleteMany({ where: { vendorMemberId: memberId } });
        if (input.permissions.length > 0) {
          await transaction.vendorMemberPermission.createMany({
            data: input.permissions.map((permission) => ({ vendorMemberId: memberId, permission })),
            skipDuplicates: true,
          });
        }
      }
    });
    return this.findMember(vendorId, memberId);
  }

  async removeMember(vendorId: string, memberId: string): Promise<VendorMemberRecord | null> {
    const member = await this.findMember(vendorId, memberId);
    if (!member) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.vendorMember.update({
        where: { id: memberId },
        data: { status: "REMOVED" },
      });
      await transaction.vendorMemberPermission.deleteMany({ where: { vendorMemberId: memberId } });
    });
    return { ...member, status: "REMOVED", permissions: [] };
  }

  countActiveOwners(vendorId: string): Promise<number> {
    return this.database.vendorMember.count({
      where: { vendorId, role: "OWNER", status: "ACTIVE" },
    });
  }

  async createVerification(vendorId: string, type: VerificationType, reference?: string): Promise<VerificationRecord> {
    return this.database.vendorVerification.create({
      data: { vendorId, type, ...(reference ? { reference } : {}) },
    });
  }

  listVerifications(vendorId: string): Promise<VerificationRecord[]> {
    return this.database.vendorVerification.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
    });
  }

  findVerification(verificationId: string): Promise<VerificationRecord | null> {
    return this.database.vendorVerification.findUnique({ where: { id: verificationId } });
  }

  async reviewVerification(
    verificationId: string,
    status: "VERIFIED" | "REJECTED",
    reviewerId: string,
    reviewedAt: Date,
    expiresAt?: Date,
  ): Promise<VerificationRecord | null> {
    const exists = await this.database.vendorVerification.findUnique({ where: { id: verificationId } });
    if (!exists) return null;
    return this.database.vendorVerification.update({
      where: { id: verificationId },
      data: {
        status,
        reviewedBy: reviewerId,
        reviewedAt,
        ...(expiresAt ? { expiresAt } : {}),
      },
    });
  }

  createStore(vendorId: string, input: { name: string; slug: string; description?: string }): Promise<StoreRecord> {
    return this.database.store.create({
      data: {
        vendorId,
        name: input.name,
        slug: input.slug,
        ...(input.description ? { description: input.description } : {}),
      },
    });
  }

  listStores(vendorId: string): Promise<StoreRecord[]> {
    return this.database.store.findMany({ where: { vendorId }, orderBy: { createdAt: "asc" } });
  }

  findStore(storeId: string): Promise<StoreRecord | null> {
    return this.database.store.findUnique({ where: { id: storeId } });
  }

  findStoreBySlug(slug: string): Promise<StoreRecord | null> {
    return this.database.store.findUnique({ where: { slug } });
  }

  async updateStore(storeId: string, input: { name?: string; slug?: string; description?: string }): Promise<StoreRecord | null> {
    const exists = await this.database.store.findUnique({ where: { id: storeId } });
    if (!exists) return null;
    return this.database.store.update({
      where: { id: storeId },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.slug ? { slug: input.slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
  }

  async setStoreStatus(storeId: string, status: StoreStatus): Promise<StoreRecord | null> {
    const exists = await this.database.store.findUnique({ where: { id: storeId } });
    if (!exists) return null;
    return this.database.store.update({ where: { id: storeId }, data: { status } });
  }

  async setVendorStatus(vendorId: string, status: VendorStatus, now: Date): Promise<VendorRecord | null> {
    const vendor = await this.database.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) return null;
    return this.database.vendor.update({
      where: { id: vendorId },
      data: {
        status,
        approvedAt: status === "APPROVED" ? now : status === "PENDING" ? null : vendor.approvedAt,
        rejectedAt: status === "REJECTED" ? now : status === "APPROVED" ? null : vendor.rejectedAt,
        suspendedAt: status === "SUSPENDED" ? now : status === "APPROVED" ? null : vendor.suspendedAt,
      },
    });
  }

  listProviderAccounts(vendorId: string): Promise<ProviderAccountRecord[]> {
    return this.database.paymentProviderAccount.findMany({
      where: { vendorId },
      orderBy: { provider: "asc" },
    });
  }

  upsertProviderAccount(
    vendorId: string,
    provider: PaymentProvider,
    externalSubaccountId: string,
  ): Promise<ProviderAccountRecord> {
    return this.database.paymentProviderAccount.upsert({
      where: { vendorId_provider: { vendorId, provider } },
      create: { vendorId, provider, externalSubaccountId, status: "PENDING" },
      update: { externalSubaccountId, status: "PENDING" },
    });
  }

  findProviderAccount(vendorId: string, provider: PaymentProvider): Promise<ProviderAccountRecord | null> {
    return this.database.paymentProviderAccount.findUnique({
      where: { vendorId_provider: { vendorId, provider } },
    });
  }

  async setProviderAccountStatus(
    vendorId: string,
    provider: PaymentProvider,
    status: "ACTIVE" | "SUSPENDED" | "DISABLED",
  ): Promise<ProviderAccountRecord | null> {
    const account = await this.findProviderAccount(vendorId, provider);
    if (!account) return null;
    return this.database.paymentProviderAccount.update({
      where: { vendorId_provider: { vendorId, provider } },
      data: { status },
    });
  }

  async writeAudit(input: {
    actorType: "USER" | "SYSTEM" | "PROVIDER";
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await writeAuditEntry(transaction, input);
    });
  }
}
