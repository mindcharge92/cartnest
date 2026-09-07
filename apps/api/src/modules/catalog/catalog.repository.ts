import type {
  CatalogSortDto,
  CreateCategoryBodyDto,
  CreateProductBodyDto,
  CreateProductVariantFromIdsBodyDto,
  MediaOwnerTypeDto,
  MediaStatusDto,
  ModerationStatusDto,
  ProductStatusDto,
  UpdateCategoryBodyDto,
  UpdateMediaBodyDto,
  UpdateProductBodyDto,
  UpdateProductVariantBodyDto,
  VariantStatusDto,
} from "@repo/contracts";
import { Prisma, type DatabaseClient, writeAuditEntry } from "@repo/database";

export type CategoryStatus = "ACTIVE" | "INACTIVE";

export interface CategoryRecord {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly status: CategoryStatus;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductOptionValueRecord {
  readonly id: string;
  readonly optionId: string;
  readonly value: string;
  readonly position: number;
}

export interface ProductOptionRecord {
  readonly id: string;
  readonly productId: string;
  readonly name: string;
  readonly position: number;
  readonly values: readonly ProductOptionValueRecord[];
}

export interface VariantRecord {
  readonly id: string;
  readonly productId: string;
  readonly storeId: string;
  readonly sku: string;
  readonly priceAmountMinor: bigint;
  readonly currency: string;
  readonly status: VariantStatusDto;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly optionValues: readonly {
    readonly optionValue: {
      readonly id: string;
      readonly optionId: string;
      readonly value: string;
      readonly option: { readonly id: string; readonly name: string };
    };
  }[];
}

export interface MediaRecord {
  readonly id: string;
  readonly productId: string | null;
  readonly storeId: string | null;
  readonly objectKey: string;
  readonly bucket: string;
  readonly mimeType: string;
  readonly sizeBytes: bigint;
  readonly width: number | null;
  readonly height: number | null;
  readonly originalFilename: string | null;
  readonly altText: string | null;
  readonly displayOrder: number;
  readonly status: MediaStatusDto;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly product?: { readonly storeId: string } | null;
}

export interface ProductRecord {
  readonly id: string;
  readonly storeId: string;
  readonly categoryId: string | null;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly status: ProductStatusDto;
  readonly moderationStatus: ModerationStatusDto;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly store: {
    readonly id: string;
    readonly vendorId: string;
    readonly name: string;
    readonly slug: string;
    readonly status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
    readonly vendor: {
      readonly id: string;
      readonly displayName: string;
      readonly status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    };
  };
  readonly category: CategoryRecord | null;
  readonly options: readonly ProductOptionRecord[];
  readonly variants: readonly VariantRecord[];
  readonly media: readonly MediaRecord[];
}

export interface CatalogListInput {
  readonly q?: string;
  readonly categoryIds?: readonly string[];
  readonly storeId?: string;
  readonly currency?: string;
  readonly minPriceMinor?: bigint;
  readonly maxPriceMinor?: bigint;
  readonly sort: CatalogSortDto;
  readonly page: number;
  readonly pageSize: number;
}

export interface CatalogListResult {
  readonly items: ProductRecord[];
  readonly totalItems: number;
}

export interface CatalogRepository {
  listCategories(status?: CategoryStatus): Promise<CategoryRecord[]>;
  findCategory(categoryId: string): Promise<CategoryRecord | null>;
  findCategoryBySlug(slug: string): Promise<CategoryRecord | null>;
  listChildCategories(parentId: string): Promise<CategoryRecord[]>;
  createCategory(input: CreateCategoryBodyDto): Promise<CategoryRecord>;
  updateCategory(categoryId: string, input: UpdateCategoryBodyDto): Promise<CategoryRecord | null>;
  findProduct(productId: string): Promise<ProductRecord | null>;
  findStoreProductBySlug(storeId: string, slug: string): Promise<ProductRecord | null>;
  listStoreProducts(storeId: string): Promise<ProductRecord[]>;
  findSkuInStore(storeId: string, sku: string, excludingVariantId?: string): Promise<VariantRecord | null>;
  createProduct(storeId: string, input: CreateProductBodyDto): Promise<ProductRecord>;
  updateProduct(productId: string, input: UpdateProductBodyDto): Promise<ProductRecord | null>;
  setProductStatus(productId: string, status: ProductStatusDto, archivedAt?: Date | null): Promise<ProductRecord | null>;
  setModerationStatus(productId: string, status: ModerationStatusDto): Promise<ProductRecord | null>;
  listModerationProducts(status?: ModerationStatusDto): Promise<ProductRecord[]>;
  listProductOptionValues(productId: string, ids: readonly string[]): Promise<Array<ProductOptionValueRecord & { readonly option: { readonly id: string; readonly name: string } }>>;
  createVariant(productId: string, storeId: string, input: CreateProductVariantFromIdsBodyDto): Promise<VariantRecord>;
  findVariant(variantId: string): Promise<VariantRecord | null>;
  updateVariant(variantId: string, input: UpdateProductVariantBodyDto): Promise<VariantRecord | null>;
  createPendingMedia(input: {
    ownerType: MediaOwnerTypeDto;
    ownerId: string;
    objectKey: string;
    bucket: string;
    mimeType: string;
    sizeBytes: number;
    originalFilename?: string;
    altText?: string;
    displayOrder: number;
    createdBy: string;
  }): Promise<MediaRecord>;
  findMedia(mediaId: string): Promise<MediaRecord | null>;
  completeMedia(mediaId: string, input: { width?: number; height?: number }): Promise<MediaRecord | null>;
  updateMedia(mediaId: string, input: UpdateMediaBodyDto): Promise<MediaRecord | null>;
  deleteMedia(mediaId: string, now: Date): Promise<MediaRecord | null>;
  listPublicCatalog(input: CatalogListInput): Promise<CatalogListResult>;
  findPublicProduct(productId: string): Promise<ProductRecord | null>;
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

const productInclude = {
  store: {
    include: {
      vendor: { select: { id: true, displayName: true, status: true } },
    },
  },
  category: true,
  options: {
    orderBy: { position: "asc" as const },
    include: { values: { orderBy: { position: "asc" as const } } },
  },
  variants: {
    orderBy: { createdAt: "asc" as const },
    include: {
      optionValues: {
        include: {
          optionValue: { include: { option: { select: { id: true, name: true } } } },
        },
      },
    },
  },
  media: { orderBy: [{ displayOrder: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.ProductInclude;

const variantInclude = {
  optionValues: {
    include: {
      optionValue: { include: { option: { select: { id: true, name: true } } } },
    },
  },
} as const;

const PUBLIC_MODERATION_STATUSES: ModerationStatusDto[] = ["NOT_REQUIRED", "APPROVED"];

export class PrismaCatalogRepository implements CatalogRepository {
  constructor(private readonly database: DatabaseClient) {}

  private async requeueProductModeration(
    productId: string,
    transaction: Prisma.TransactionClient = this.database,
  ): Promise<void> {
    await transaction.product.updateMany({
      where: { id: productId, moderationStatus: { not: "NOT_REQUIRED" } },
      data: { moderationStatus: "PENDING", status: "DRAFT" },
    });
  }

  async listCategories(status?: CategoryStatus): Promise<CategoryRecord[]> {
    return this.database.category.findMany({
      ...(status ? { where: { status } } : {}),
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async findCategory(categoryId: string): Promise<CategoryRecord | null> {
    return this.database.category.findUnique({ where: { id: categoryId } });
  }

  async findCategoryBySlug(slug: string): Promise<CategoryRecord | null> {
    return this.database.category.findUnique({ where: { slug } });
  }

  async listChildCategories(parentId: string): Promise<CategoryRecord[]> {
    return this.database.category.findMany({
      where: { parentId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createCategory(input: CreateCategoryBodyDto): Promise<CategoryRecord> {
    return this.database.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        parentId: input.parentId ?? null,
        status: input.status ?? "ACTIVE",
        sortOrder: input.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(categoryId: string, input: UpdateCategoryBodyDto): Promise<CategoryRecord | null> {
    if (!(await this.findCategory(categoryId))) return null;
    return this.database.category.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
    });
  }

  async findProduct(productId: string): Promise<ProductRecord | null> {
    return this.database.product.findUnique({ where: { id: productId }, include: productInclude });
  }

  async findStoreProductBySlug(storeId: string, slug: string): Promise<ProductRecord | null> {
    return this.database.product.findUnique({
      where: { storeId_slug: { storeId, slug } },
      include: productInclude,
    });
  }

  async listStoreProducts(storeId: string): Promise<ProductRecord[]> {
    return this.database.product.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: productInclude,
    });
  }

  async findSkuInStore(storeId: string, sku: string, excludingVariantId?: string): Promise<VariantRecord | null> {
    return this.database.productVariant.findFirst({
      where: {
        storeId,
        sku,
        ...(excludingVariantId ? { id: { not: excludingVariantId } } : {}),
      },
      include: variantInclude,
    });
  }

  async createProduct(storeId: string, input: CreateProductBodyDto): Promise<ProductRecord> {
    const productId = await this.database.$transaction(async (transaction) => {
      const product = await transaction.product.create({
        data: {
          storeId,
          categoryId: input.categoryId ?? null,
          name: input.name,
          slug: input.slug,
          description: input.description,
          status: "DRAFT",
          moderationStatus: "NOT_REQUIRED",
        },
      });

      const valueIds = new Map<string, string>();
      for (const [optionPosition, optionInput] of input.options.entries()) {
        const option = await transaction.productOption.create({
          data: { productId: product.id, name: optionInput.name, position: optionPosition },
        });
        for (const [valuePosition, value] of optionInput.values.entries()) {
          const optionValue = await transaction.productOptionValue.create({
            data: { optionId: option.id, value, position: valuePosition },
          });
          valueIds.set(`${optionInput.name}\u0000${value}`, optionValue.id);
        }
      }

      for (const variantInput of input.variants) {
        const variant = await transaction.productVariant.create({
          data: {
            productId: product.id,
            storeId,
            sku: variantInput.sku,
            priceAmountMinor: BigInt(variantInput.price.amountMinor),
            currency: variantInput.price.currency,
            status: "ACTIVE",
          },
        });
        if (variantInput.optionSelections.length > 0) {
          await transaction.variantOptionValue.createMany({
            data: variantInput.optionSelections.map((selection) => ({
              variantId: variant.id,
              optionValueId: valueIds.get(`${selection.optionName}\u0000${selection.value}`)!,
            })),
          });
        }
      }
      return product.id;
    });

    const created = await this.findProduct(productId);
    if (!created) throw new Error("Created product could not be reloaded.");
    return created;
  }

  async updateProduct(productId: string, input: UpdateProductBodyDto): Promise<ProductRecord | null> {
    if (!(await this.findProduct(productId))) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.product.update({
        where: { id: productId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        },
      });
      await this.requeueProductModeration(productId, transaction);
    });
    return this.findProduct(productId);
  }

  async setProductStatus(productId: string, status: ProductStatusDto, archivedAt?: Date | null): Promise<ProductRecord | null> {
    if (!(await this.findProduct(productId))) return null;
    await this.database.product.update({
      where: { id: productId },
      data: { status, ...(archivedAt !== undefined ? { archivedAt } : {}) },
    });
    return this.findProduct(productId);
  }

  async setModerationStatus(productId: string, status: ModerationStatusDto): Promise<ProductRecord | null> {
    if (!(await this.findProduct(productId))) return null;
    await this.database.product.update({
      where: { id: productId },
      data: {
        moderationStatus: status,
        ...(["PENDING", "FLAGGED", "REJECTED"].includes(status) ? { status: "DRAFT" } : {}),
      },
    });
    return this.findProduct(productId);
  }

  async listModerationProducts(status?: ModerationStatusDto): Promise<ProductRecord[]> {
    return this.database.product.findMany({
      where: status ? { moderationStatus: status } : { moderationStatus: { not: "NOT_REQUIRED" } },
      orderBy: { updatedAt: "desc" },
      include: productInclude,
      take: 200,
    });
  }

  async listProductOptionValues(
    productId: string,
    ids: readonly string[],
  ): Promise<Array<ProductOptionValueRecord & { readonly option: { readonly id: string; readonly name: string } }>> {
    return this.database.productOptionValue.findMany({
      where: { id: { in: [...ids] }, option: { productId } },
      include: { option: { select: { id: true, name: true } } },
    });
  }

  async createVariant(productId: string, storeId: string, input: CreateProductVariantFromIdsBodyDto): Promise<VariantRecord> {
    const variantId = await this.database.$transaction(async (transaction) => {
      const variant = await transaction.productVariant.create({
        data: {
          productId,
          storeId,
          sku: input.sku,
          priceAmountMinor: BigInt(input.price.amountMinor),
          currency: input.price.currency,
          status: "ACTIVE",
        },
      });
      if (input.optionValueIds.length > 0) {
        await transaction.variantOptionValue.createMany({
          data: input.optionValueIds.map((optionValueId) => ({ variantId: variant.id, optionValueId })),
        });
      }
      await this.requeueProductModeration(productId, transaction);
      return variant.id;
    });
    const created = await this.findVariant(variantId);
    if (!created) throw new Error("Created variant could not be reloaded.");
    return created;
  }

  async findVariant(variantId: string): Promise<VariantRecord | null> {
    return this.database.productVariant.findUnique({ where: { id: variantId }, include: variantInclude });
  }

  async updateVariant(variantId: string, input: UpdateProductVariantBodyDto): Promise<VariantRecord | null> {
    const existing = await this.findVariant(variantId);
    if (!existing) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.productVariant.update({
        where: { id: variantId },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.price !== undefined
            ? { priceAmountMinor: BigInt(input.price.amountMinor), currency: input.price.currency }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });
      await this.requeueProductModeration(existing.productId, transaction);
    });
    return this.findVariant(variantId);
  }

  async createPendingMedia(input: {
    ownerType: MediaOwnerTypeDto;
    ownerId: string;
    objectKey: string;
    bucket: string;
    mimeType: string;
    sizeBytes: number;
    originalFilename?: string;
    altText?: string;
    displayOrder: number;
    createdBy: string;
  }): Promise<MediaRecord> {
    return this.database.media.create({
      data: {
        productId: input.ownerType === "PRODUCT" ? input.ownerId : null,
        storeId: input.ownerType === "STORE" ? input.ownerId : null,
        objectKey: input.objectKey,
        bucket: input.bucket,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        ...(input.originalFilename !== undefined ? { originalFilename: input.originalFilename } : {}),
        ...(input.altText !== undefined ? { altText: input.altText } : {}),
        displayOrder: input.displayOrder,
        status: "PENDING",
        createdBy: input.createdBy,
      },
      include: { product: { select: { storeId: true } } },
    });
  }

  async findMedia(mediaId: string): Promise<MediaRecord | null> {
    return this.database.media.findUnique({
      where: { id: mediaId },
      include: { product: { select: { storeId: true } } },
    });
  }

  async completeMedia(mediaId: string, input: { width?: number; height?: number }): Promise<MediaRecord | null> {
    const existing = await this.findMedia(mediaId);
    if (!existing) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.media.update({
        where: { id: mediaId },
        data: {
          status: "ACTIVE",
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
        },
      });
      if (existing.productId) await this.requeueProductModeration(existing.productId, transaction);
    });
    return this.findMedia(mediaId);
  }

  async updateMedia(mediaId: string, input: UpdateMediaBodyDto): Promise<MediaRecord | null> {
    const existing = await this.findMedia(mediaId);
    if (!existing) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.media.update({
        where: { id: mediaId },
        data: {
          ...(input.altText !== undefined ? { altText: input.altText } : {}),
          ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        },
      });
      if (existing.productId) await this.requeueProductModeration(existing.productId, transaction);
    });
    return this.findMedia(mediaId);
  }

  async deleteMedia(mediaId: string, now: Date): Promise<MediaRecord | null> {
    const existing = await this.findMedia(mediaId);
    if (!existing) return null;
    await this.database.$transaction(async (transaction) => {
      await transaction.media.update({
        where: { id: mediaId },
        data: { status: "DELETED", deletedAt: now },
      });
      if (existing.productId) await this.requeueProductModeration(existing.productId, transaction);
    });
    return this.findMedia(mediaId);
  }

  async listPublicCatalog(input: CatalogListInput): Promise<CatalogListResult> {
    const variantFilter: Prisma.ProductVariantWhereInput = {
      status: "ACTIVE",
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.minPriceMinor !== undefined || input.maxPriceMinor !== undefined
        ? {
            priceAmountMinor: {
              ...(input.minPriceMinor !== undefined ? { gte: input.minPriceMinor } : {}),
              ...(input.maxPriceMinor !== undefined ? { lte: input.maxPriceMinor } : {}),
            },
          }
        : {}),
    };

    const where: Prisma.ProductWhereInput = {
      status: "ACTIVE",
      moderationStatus: { in: PUBLIC_MODERATION_STATUSES },
      store: { status: "ACTIVE", vendor: { status: "APPROVED" } },
      variants: { some: variantFilter },
      ...(input.storeId ? { storeId: input.storeId } : {}),
      ...(input.categoryIds ? { categoryId: { in: [...input.categoryIds] } } : {}),
      ...(input.q
        ? {
            OR: [
              { name: { contains: input.q, mode: "insensitive" } },
              { description: { contains: input.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      input.sort === "NAME_ASC"
        ? { name: "asc" }
        : input.sort === "NAME_DESC"
          ? { name: "desc" }
          : { createdAt: "desc" };

    const [totalItems, items] = await Promise.all([
      this.database.product.count({ where }),
      this.database.product.findMany({
        where,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: productInclude,
      }),
    ]);
    return { items, totalItems };
  }

  async findPublicProduct(productId: string): Promise<ProductRecord | null> {
    return this.database.product.findFirst({
      where: {
        id: productId,
        status: "ACTIVE",
        moderationStatus: { in: PUBLIC_MODERATION_STATUSES },
        store: { status: "ACTIVE", vendor: { status: "APPROVED" } },
        variants: { some: { status: "ACTIVE" } },
      },
      include: productInclude,
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
    await writeAuditEntry(this.database, input);
  }
}
