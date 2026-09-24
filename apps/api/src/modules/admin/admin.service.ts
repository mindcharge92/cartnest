import type {
  AdminListQueryDto,
  AdminUserListQueryDto,
  AdminUserSummaryDto,
  AnalyticsRangeQueryDto,
  CreatePromotionBodyDto,
  CreateTaxRateBodyDto,
  PlatformAnalyticsDto,
  PlatformRoleDto,
  PromotionDto,
  StoreAnalyticsDto,
  TaxRateDto,
} from "@repo/contracts";
import type { DatabaseClient } from "@repo/database";
import { writeAuditEntry } from "@repo/database";
import {
  requirePlatformRole,
  requirePrivilegedMfa,
  type AccessPrincipal,
} from "../auth/auth.public.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";

export class AdminError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

function money(amountMinor: bigint, currency = "NGN") {
  return { amountMinor: amountMinor.toString(), currency };
}

function rangeWhere(query: AnalyticsRangeQueryDto) {
  return {
    ...(query.from ? { gte: new Date(query.from) } : {}),
    ...(query.to ? { lt: new Date(query.to) } : {}),
  };
}

function pagination(page: number, pageSize: number, totalItems: number) {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
  };
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2025");
}

function mapAdminUser(record: {
  id: string;
  email: string | null;
  phone: string | null;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED";
  platformRole: "USER" | "ADMIN" | "SUPER_ADMIN";
  createdAt: Date;
}): AdminUserSummaryDto {
  return {
    id: record.id,
    email: record.email,
    phone: record.phone,
    status: record.status,
    platformRole: record.platformRole,
    createdAt: record.createdAt.toISOString(),
  };
}

function mapTaxRate(record: {
  id: string; name: string; rateBps: number; active: boolean; startsAt: Date; endsAt: Date | null; createdAt: Date; updatedAt: Date;
}): TaxRateDto {
  return {
    id: record.id,
    name: record.name,
    rateBps: record.rateBps,
    active: record.active,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapPromotion(record: {
  id: string; code: string; name: string; type: "PERCENTAGE" | "FIXED_AMOUNT"; value: bigint; currency: string | null;
  minOrderAmountMinor: bigint | null; maxRedemptions: number | null; perUserLimit: number | null;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "EXPIRED"; startsAt: Date; endsAt: Date | null; createdAt: Date; updatedAt: Date;
}): PromotionDto {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    type: record.type,
    value: record.value.toString(),
    currency: record.currency,
    minOrderAmountMinor: record.minOrderAmountMinor?.toString() ?? null,
    maxRedemptions: record.maxRedemptions,
    perUserLimit: record.perUserLimit,
    status: record.status,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class AdminService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly vendorBoundary: VendorOwnershipBoundary,
  ) {}

  private requireAdmin(principal: AccessPrincipal): void {
    requirePlatformRole(principal, ["ADMIN", "SUPER_ADMIN"]);
    requirePrivilegedMfa(principal);
  }

  private requireSuperAdmin(principal: AccessPrincipal): void {
    requirePlatformRole(principal, ["SUPER_ADMIN"]);
    requirePrivilegedMfa(principal);
  }

  async platformAnalytics(principal: AccessPrincipal, query: AnalyticsRangeQueryDto): Promise<PlatformAnalyticsDto> {
    this.requireAdmin(principal);
    const createdAt = rangeWhere(query);
    const orderWhere = Object.keys(createdAt).length ? { createdAt } : {};
    const refundWhere = Object.keys(createdAt).length ? { createdAt } : {};
    const [users, approvedVendors, activeStores, activeProducts, orders, paidOrders, gmv, refunds, pendingReturns, failedNotifications] = await Promise.all([
      this.database.user.count(),
      this.database.vendor.count({ where: { status: "APPROVED" } }),
      this.database.store.count({ where: { status: "ACTIVE" } }),
      this.database.product.count({ where: { status: "ACTIVE", moderationStatus: { in: ["NOT_REQUIRED", "APPROVED"] } } }),
      this.database.order.count({ where: orderWhere }),
      this.database.order.count({ where: { ...orderWhere, paymentStatus: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } } }),
      this.database.order.aggregate({ where: { ...orderWhere, paymentStatus: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { grandTotalAmountMinor: true } }),
      this.database.refund.aggregate({ where: { ...refundWhere, status: "SUCCEEDED" }, _sum: { amountMinor: true } }),
      this.database.returnRequest.count({ where: { status: { notIn: ["COMPLETED", "REJECTED", "CANCELLED"] } } }),
      this.database.notification.count({ where: { status: "FAILED" } }),
    ]);
    return {
      users,
      approvedVendors,
      activeStores,
      activeProducts,
      orders,
      paidOrders,
      grossMerchandiseValue: money(gmv._sum.grandTotalAmountMinor ?? 0n),
      refundedValue: money(refunds._sum.amountMinor ?? 0n),
      pendingReturns,
      failedNotifications,
    };
  }

  async storeAnalytics(principal: AccessPrincipal, storeId: string, query: AnalyticsRangeQueryDto): Promise<StoreAnalyticsDto> {
    if (principal.platformRole === "ADMIN" || principal.platformRole === "SUPER_ADMIN") {
      this.requireAdmin(principal);
    } else {
      await this.vendorBoundary.requireStorePermission(principal, storeId, "analytics:read");
    }
    const createdAt = rangeWhere(query);
    const where = { storeId, ...(Object.keys(createdAt).length ? { createdAt } : {}) };
    const [orders, deliveredOrders, sums, refunded] = await Promise.all([
      this.database.vendorOrder.count({ where }),
      this.database.vendorOrder.count({ where: { ...where, status: "DELIVERED" } }),
      this.database.vendorOrder.aggregate({ where, _sum: {
        totalAmountMinor: true,
        discountAmountMinor: true,
        taxAmountMinor: true,
        deliveryAmountMinor: true,
        commissionAmountMinor: true,
        gatewayFeeAmountMinor: true,
      } }),
      this.database.refund.aggregate({
        where: {
          vendorOrder: { is: { storeId } },
          status: "SUCCEEDED",
          ...(Object.keys(createdAt).length ? { createdAt } : {}),
        },
        _sum: { amountMinor: true },
      }),
    ]);
    return {
      storeId,
      orders,
      deliveredOrders,
      grossSales: money(sums._sum.totalAmountMinor ?? 0n),
      discounts: money(sums._sum.discountAmountMinor ?? 0n),
      tax: money(sums._sum.taxAmountMinor ?? 0n),
      delivery: money(sums._sum.deliveryAmountMinor ?? 0n),
      commission: money(sums._sum.commissionAmountMinor ?? 0n),
      gatewayFees: money(sums._sum.gatewayFeeAmountMinor ?? 0n),
      refundedValue: money(refunded._sum.amountMinor ?? 0n),
    };
  }

  async listUsers(principal: AccessPrincipal, query: AdminUserListQueryDto) {
    this.requireAdmin(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const where = {
      ...(query.role ? { platformRole: query.role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { normalizedEmail: { contains: search.toLowerCase(), mode: "insensitive" as const } },
              { normalizedPhone: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, totalItems] = await Promise.all([
      this.database.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.database.user.count({ where }),
    ]);
    return { items: items.map(mapAdminUser), pagination: pagination(page, pageSize, totalItems) };
  }

  async setUserPlatformRole(
    principal: AccessPrincipal,
    userId: string,
    role: PlatformRoleDto,
    requestId?: string,
  ): Promise<AdminUserSummaryDto> {
    this.requireSuperAdmin(principal);

    if (principal.userId === userId) {
      throw new AdminError(
        "SELF_ROLE_CHANGE_FORBIDDEN",
        "Use another SUPER_ADMIN account to change your own platform role.",
        409,
      );
    }

    const existing = await this.database.user.findUnique({ where: { id: userId } });
    if (!existing) throw new AdminError("USER_NOT_FOUND", "User account was not found.", 404);
    if (existing.platformRole === role) return mapAdminUser(existing);

    const now = new Date();
    return this.database.$transaction(async (tx) => {
      if (existing.platformRole === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
        const superAdminCount = await tx.user.count({ where: { platformRole: "SUPER_ADMIN" } });
        if (superAdminCount <= 1) {
          throw new AdminError(
            "LAST_SUPER_ADMIN_REQUIRED",
            "CartNest must retain at least one SUPER_ADMIN account.",
            409,
          );
        }
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: { platformRole: role },
      });

      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "platform-role-changed" },
      });

      await writeAuditEntry(tx, {
        actorType: "USER",
        actorUserId: principal.userId,
        action: "admin.user.role_changed",
        entityType: "User",
        entityId: userId,
        ...(requestId ? { requestId } : {}),
        metadata: {
          previousRole: existing.platformRole,
          newRole: role,
          sessionsRevoked: true,
        },
      });

      return mapAdminUser(updated);
    });
  }

  async listOrders(principal: AccessPrincipal, query: AdminListQueryDto) {
    this.requireAdmin(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, totalItems] = await Promise.all([
      this.database.order.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.database.order.count(),
    ]);
    return { items: items.map((item) => ({ id: item.id, orderNumber: item.orderNumber, userId: item.userId, status: item.status, paymentStatus: item.paymentStatus, grandTotal: money(item.grandTotalAmountMinor, item.currency), createdAt: item.createdAt.toISOString() })), pagination: pagination(page, pageSize, totalItems) };
  }

  async listPayments(principal: AccessPrincipal, query: AdminListQueryDto) {
    this.requireAdmin(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, totalItems] = await Promise.all([
      this.database.paymentIntent.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.database.paymentIntent.count(),
    ]);
    return { items: items.map((item) => ({ id: item.id, orderId: item.orderId, status: item.status, amount: money(item.amountMinor, item.currency), createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })), pagination: pagination(page, pageSize, totalItems) };
  }

  async listRefunds(principal: AccessPrincipal, query: AdminListQueryDto) {
    this.requireAdmin(principal);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, totalItems] = await Promise.all([
      this.database.refund.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      this.database.refund.count(),
    ]);
    return { items: items.map((item) => ({ id: item.id, vendorOrderId: item.vendorOrderId, provider: item.provider, status: item.status, amount: money(item.amountMinor, item.currency), reason: item.reason, createdAt: item.createdAt.toISOString() })), pagination: pagination(page, pageSize, totalItems) };
  }

  async listTaxRates(principal: AccessPrincipal): Promise<{ items: TaxRateDto[] }> {
    this.requireAdmin(principal);
    return { items: (await this.database.taxRate.findMany({ orderBy: { startsAt: "desc" } })).map(mapTaxRate) };
  }

  async createTaxRate(principal: AccessPrincipal, body: CreateTaxRateBodyDto): Promise<TaxRateDto> {
    this.requireAdmin(principal);
    const startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;
    if (endsAt && endsAt <= startsAt) throw new AdminError("INVALID_TAX_PERIOD", "Tax end time must be after its start time.", 400);
    const record = await this.database.$transaction(async (tx) => {
      if (body.active) await tx.taxRate.updateMany({ where: { active: true }, data: { active: false } });
      const created = await tx.taxRate.create({ data: { name: body.name, rateBps: body.rateBps, startsAt, endsAt, active: body.active ?? false } });
      await writeAuditEntry(tx, { actorType: "USER", actorUserId: principal.userId, action: "admin.tax_rate.created", entityType: "TaxRate", entityId: created.id, metadata: { rateBps: body.rateBps, active: created.active } });
      return created;
    });
    return mapTaxRate(record);
  }

  async setTaxRateActive(principal: AccessPrincipal, taxRateId: string, active: boolean): Promise<TaxRateDto> {
    this.requireAdmin(principal);
    try {
      const record = await this.database.$transaction(async (tx) => {
        if (active) await tx.taxRate.updateMany({ where: { active: true, id: { not: taxRateId } }, data: { active: false } });
        const changed = await tx.taxRate.update({ where: { id: taxRateId }, data: { active } });
        await writeAuditEntry(tx, { actorType: "USER", actorUserId: principal.userId, action: "admin.tax_rate.status_changed", entityType: "TaxRate", entityId: taxRateId, metadata: { active } });
        return changed;
      });
      return mapTaxRate(record);
    } catch (error) {
      if (isNotFound(error)) throw new AdminError("TAX_RATE_NOT_FOUND", "Tax rate was not found.", 404);
      throw error;
    }
  }

  async listPromotions(principal: AccessPrincipal): Promise<{ items: PromotionDto[] }> {
    this.requireAdmin(principal);
    return { items: (await this.database.promotion.findMany({ orderBy: { createdAt: "desc" } })).map(mapPromotion) };
  }

  async createPromotion(principal: AccessPrincipal, body: CreatePromotionBodyDto): Promise<PromotionDto> {
    this.requireAdmin(principal);
    const startsAt = new Date(body.startsAt);
    const endsAt = body.endsAt ? new Date(body.endsAt) : null;
    const value = BigInt(body.value);
    if (endsAt && endsAt <= startsAt) throw new AdminError("INVALID_PROMOTION_PERIOD", "Promotion end time must be after its start time.", 400);
    if (body.type === "PERCENTAGE" && value > 10000n) throw new AdminError("INVALID_PROMOTION_VALUE", "Percentage promotion value is expressed in basis points and cannot exceed 10000.", 400);
    let currency: string | null = null;
    if (body.type === "FIXED_AMOUNT") {
      if (!body.currency) throw new AdminError("PROMOTION_CURRENCY_REQUIRED", "Fixed-amount promotions require a currency.", 400);
      currency = body.currency;
    }
    const record = await this.database.$transaction(async (tx) => {
      const created = await tx.promotion.create({ data: {
        code: body.code.trim().toUpperCase(),
        name: body.name,
        type: body.type,
        value,
        currency,
        minOrderAmountMinor: body.minOrderAmountMinor ? BigInt(body.minOrderAmountMinor) : null,
        maxRedemptions: body.maxRedemptions ?? null,
        perUserLimit: body.perUserLimit ?? null,
        status: body.status ?? "DRAFT",
        startsAt,
        endsAt,
      } });
      await writeAuditEntry(tx, { actorType: "USER", actorUserId: principal.userId, action: "admin.promotion.created", entityType: "Promotion", entityId: created.id, metadata: { code: created.code, status: created.status } });
      return created;
    });
    return mapPromotion(record);
  }

  async setPromotionStatus(principal: AccessPrincipal, promotionId: string, status: PromotionDto["status"]): Promise<PromotionDto> {
    this.requireAdmin(principal);
    try {
      const record = await this.database.$transaction(async (tx) => {
        const changed = await tx.promotion.update({ where: { id: promotionId }, data: { status } });
        await writeAuditEntry(tx, { actorType: "USER", actorUserId: principal.userId, action: "admin.promotion.status_changed", entityType: "Promotion", entityId: promotionId, metadata: { status } });
        return changed;
      });
      return mapPromotion(record);
    } catch (error) {
      if (isNotFound(error)) throw new AdminError("PROMOTION_NOT_FOUND", "Promotion was not found.", 404);
      throw error;
    }
  }
}
