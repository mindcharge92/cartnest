import { randomUUID } from "node:crypto";
import type {
  CatalogProductDetailDto,
  CatalogProductListResponseDto,
  CatalogProductSummaryDto,
  CatalogQueryDto,
  CategoryDto,
  CompleteMediaUploadBodyDto,
  CreateCategoryBodyDto,
  CreateProductBodyDto,
  CreateProductVariantFromIdsBodyDto,
  MediaUploadIntentBodyDto,
  MediaUploadIntentResponseDto,
  ProductModerationBodyDto,
  ProductVariantDto,
  PublicMediaDto,
  UpdateCategoryBodyDto,
  UpdateMediaBodyDto,
  UpdateProductBodyDto,
  UpdateProductVariantBodyDto,
  VendorMediaDto,
  VendorProductDto,
} from "@repo/contracts";
import {
  requirePlatformRole,
  requirePrivilegedMfa,
  type AccessPrincipal,
} from "../auth/auth.public.js";
import type { VendorOwnershipBoundary } from "../vendors/vendor.public.js";
import type {
  CategoryRecord,
  CatalogRepository,
  MediaRecord,
  ProductRecord,
  VariantRecord,
} from "./catalog.repository.js";
import type { MediaStorage } from "./catalog.storage.js";

export class CatalogError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "CatalogError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function toCategory(record: CategoryRecord): CategoryDto {
  return {
    id: record.id,
    parentId: record.parentId,
    name: record.name,
    slug: record.slug,
    status: record.status,
    sortOrder: record.sortOrder,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toVariant(record: VariantRecord): ProductVariantDto {
  return {
    id: record.id,
    sku: record.sku,
    price: { amountMinor: record.priceAmountMinor.toString(), currency: record.currency },
    status: record.status,
    optionValues: record.optionValues
      .map((entry) => ({
        optionId: entry.optionValue.option.id,
        optionName: entry.optionValue.option.name,
        valueId: entry.optionValue.id,
        value: entry.optionValue.value,
      }))
      .sort((left, right) => left.optionName.localeCompare(right.optionName)),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mediaOwner(record: MediaRecord): { ownerType: "PRODUCT" | "STORE"; ownerId: string } {
  if (record.productId) return { ownerType: "PRODUCT", ownerId: record.productId };
  if (record.storeId) return { ownerType: "STORE", ownerId: record.storeId };
  throw new Error("Media has no owner.");
}

function toVendorMedia(record: MediaRecord, storage?: MediaStorage): VendorMediaDto {
  const owner = mediaOwner(record);
  return {
    id: record.id,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes.toString(),
    width: record.width,
    height: record.height,
    originalFilename: record.originalFilename,
    altText: record.altText,
    displayOrder: record.displayOrder,
    status: record.status,
    url:
      record.status === "ACTIVE" && storage && record.bucket === storage.bucket
        ? storage.publicUrl(record.objectKey)
        : null,
    createdAt: record.createdAt.toISOString(),
  };
}

function toPublicMedia(record: MediaRecord, storage?: MediaStorage): PublicMediaDto | null {
  if (record.status !== "ACTIVE" || !storage || record.bucket !== storage.bucket) return null;
  return {
    id: record.id,
    url: storage.publicUrl(record.objectKey),
    mimeType: record.mimeType,
    width: record.width,
    height: record.height,
    altText: record.altText,
    displayOrder: record.displayOrder,
  };
}

function toVendorProduct(record: ProductRecord, storage?: MediaStorage): VendorProductDto {
  return {
    id: record.id,
    storeId: record.storeId,
    category: record.category ? toCategory(record.category) : null,
    name: record.name,
    slug: record.slug,
    description: record.description,
    status: record.status,
    moderationStatus: record.moderationStatus,
    options: record.options.map((option) => ({
      id: option.id,
      name: option.name,
      position: option.position,
      values: option.values.map((value) => ({
        id: value.id,
        value: value.value,
        position: value.position,
      })),
    })),
    variants: record.variants.map(toVariant),
    media: record.media.map((media) => toVendorMedia(media, storage)),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
  };
}

function activeVariants(record: ProductRecord): VariantRecord[] {
  return record.variants.filter((variant) => variant.status === "ACTIVE");
}

function publicMedia(record: ProductRecord, storage?: MediaStorage): PublicMediaDto[] {
  return record.media
    .map((media) => toPublicMedia(media, storage))
    .filter((media): media is PublicMediaDto => media !== null);
}

function priceFrom(record: ProductRecord): { amountMinor: string; currency: string } {
  const variants = activeVariants(record);
  if (variants.length === 0) {
    throw new CatalogError("PRODUCT_HAS_NO_ACTIVE_VARIANTS", "Product has no active variants.", 409);
  }
  const currency = variants[0]!.currency;
  const sameCurrency = variants.filter((variant) => variant.currency === currency);
  const minimum = sameCurrency.reduce(
    (value, variant) => (variant.priceAmountMinor < value ? variant.priceAmountMinor : value),
    sameCurrency[0]!.priceAmountMinor,
  );
  return { amountMinor: minimum.toString(), currency };
}

function toPublicSummary(record: ProductRecord, storage?: MediaStorage): CatalogProductSummaryDto {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description,
    store: {
      id: record.store.id,
      name: record.store.name,
      slug: record.store.slug,
      vendorDisplayName: record.store.vendor.displayName,
    },
    category: record.category ? toCategory(record.category) : null,
    priceFrom: priceFrom(record),
    media: publicMedia(record, storage),
    createdAt: record.createdAt.toISOString(),
  };
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function assertNgCurrency(currency: string): void {
  if (currency !== "NGN") {
    throw new CatalogError(
      "UNSUPPORTED_CURRENCY",
      "The P4 marketplace catalog currently supports NGN product prices only.",
      400,
    );
  }
}

function validateProductStructure(input: CreateProductBodyDto): void {
  const optionNames = new Set<string>();
  const options = new Map<string, Set<string>>();

  for (const option of input.options) {
    const optionKey = normalizeKey(option.name);
    if (optionNames.has(optionKey)) {
      throw new CatalogError("DUPLICATE_PRODUCT_OPTION", "Product option names must be unique.", 400);
    }
    optionNames.add(optionKey);
    const values = new Set<string>();
    for (const value of option.values) {
      const valueKey = normalizeKey(value);
      if (values.has(valueKey)) {
        throw new CatalogError(
          "DUPLICATE_PRODUCT_OPTION_VALUE",
          `Values for the ${option.name} option must be unique.`,
          400,
        );
      }
      values.add(valueKey);
    }
    options.set(option.name, new Set(option.values));
  }

  if (input.options.length === 0 && input.variants.length !== 1) {
    throw new CatalogError(
      "OPTIONS_REQUIRED_FOR_MULTIPLE_VARIANTS",
      "A product without options must contain exactly one variant.",
      400,
    );
  }

  const skus = new Set<string>();
  const combinations = new Set<string>();
  for (const variant of input.variants) {
    assertNgCurrency(variant.price.currency);
    if (skus.has(variant.sku)) {
      throw new CatalogError("DUPLICATE_SKU", "Variant SKUs must be unique within the product.", 400);
    }
    skus.add(variant.sku);

    if (variant.optionSelections.length !== input.options.length) {
      throw new CatalogError(
        "INVALID_VARIANT_SELECTIONS",
        "Every variant must select exactly one value for every product option.",
        400,
      );
    }
    const selectedOptions = new Set<string>();
    for (const selection of variant.optionSelections) {
      if (selectedOptions.has(selection.optionName)) {
        throw new CatalogError(
          "DUPLICATE_VARIANT_OPTION",
          "A variant cannot select the same option more than once.",
          400,
        );
      }
      selectedOptions.add(selection.optionName);
      const allowedValues = options.get(selection.optionName);
      if (!allowedValues || !allowedValues.has(selection.value)) {
        throw new CatalogError(
          "INVALID_VARIANT_OPTION_VALUE",
          "Variant option selections must reference values defined by the product.",
          400,
        );
      }
    }
    const combination = [...variant.optionSelections]
      .sort((left, right) => left.optionName.localeCompare(right.optionName))
      .map((selection) => `${selection.optionName}=${selection.value}`)
      .join("|");
    if (combinations.has(combination)) {
      throw new CatalogError(
        "DUPLICATE_VARIANT_COMBINATION",
        "Two variants cannot represent the same option combination.",
        400,
      );
    }
    combinations.add(combination);
  }
}

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly vendorBoundary: VendorOwnershipBoundary,
    private readonly mediaStorage?: MediaStorage,
  ) {}

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

  async listPublicCategories(): Promise<CategoryDto[]> {
    return (await this.repository.listCategories("ACTIVE")).map(toCategory);
  }

  async listAdminCategories(principal: AccessPrincipal): Promise<CategoryDto[]> {
    this.requireAdmin(principal);
    return (await this.repository.listCategories()).map(toCategory);
  }

  private async assertCategoryParent(categoryId: string | undefined, parentId: string | null | undefined): Promise<void> {
    if (!parentId) return;
    if (categoryId && parentId === categoryId) {
      throw new CatalogError("CATEGORY_CYCLE", "A category cannot be its own parent.", 409);
    }
    let currentId: string | null = parentId;
    let depth = 0;
    while (currentId) {
      if (categoryId && currentId === categoryId) {
        throw new CatalogError("CATEGORY_CYCLE", "Category hierarchy cannot contain a cycle.", 409);
      }
      const current = await this.repository.findCategory(currentId);
      if (!current) throw new CatalogError("PARENT_CATEGORY_NOT_FOUND", "Parent category was not found.", 404);
      currentId = current.parentId;
      depth += 1;
      if (depth > 100) {
        throw new CatalogError("CATEGORY_HIERARCHY_INVALID", "Category hierarchy is too deep or cyclic.", 409);
      }
    }
  }

  async createCategory(
    principal: AccessPrincipal,
    input: CreateCategoryBodyDto,
    requestId?: string,
  ): Promise<CategoryDto> {
    this.requireAdmin(principal);
    await this.assertCategoryParent(undefined, input.parentId);
    if (await this.repository.findCategoryBySlug(input.slug)) {
      throw new CatalogError("CATEGORY_SLUG_TAKEN", "That category slug is already in use.", 409);
    }
    const category = await this.repository.createCategory(input);
    await this.audit(principal, "catalog.category.created", "Category", category.id, requestId);
    return toCategory(category);
  }

  async updateCategory(
    principal: AccessPrincipal,
    categoryId: string,
    input: UpdateCategoryBodyDto,
    requestId?: string,
  ): Promise<CategoryDto> {
    this.requireAdmin(principal);
    const existing = await this.repository.findCategory(categoryId);
    if (!existing) throw new CatalogError("CATEGORY_NOT_FOUND", "Category was not found.", 404);
    if (input.slug && input.slug !== existing.slug) {
      const collision = await this.repository.findCategoryBySlug(input.slug);
      if (collision && collision.id !== categoryId) {
        throw new CatalogError("CATEGORY_SLUG_TAKEN", "That category slug is already in use.", 409);
      }
    }
    if (input.parentId !== undefined) await this.assertCategoryParent(categoryId, input.parentId);
    const updated = await this.repository.updateCategory(categoryId, input);
    if (!updated) throw new CatalogError("CATEGORY_NOT_FOUND", "Category was not found.", 404);
    await this.audit(principal, "catalog.category.updated", "Category", categoryId, requestId);
    return toCategory(updated);
  }

  private async requireUsableCategory(categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) return;
    const category = await this.repository.findCategory(categoryId);
    if (!category) throw new CatalogError("CATEGORY_NOT_FOUND", "Category was not found.", 404);
    if (category.status !== "ACTIVE") {
      throw new CatalogError("CATEGORY_INACTIVE", "Products cannot be assigned to an inactive category.", 409);
    }
  }

  async createProduct(
    principal: AccessPrincipal,
    storeId: string,
    input: CreateProductBodyDto,
    requestId?: string,
  ): Promise<VendorProductDto> {
    await this.vendorBoundary.requireStorePermission(principal, storeId, "product:create");
    await this.requireUsableCategory(input.categoryId);
    validateProductStructure(input);
    if (await this.repository.findStoreProductBySlug(storeId, input.slug)) {
      throw new CatalogError("PRODUCT_SLUG_TAKEN", "That product slug is already used by this store.", 409);
    }
    for (const variant of input.variants) {
      if (await this.repository.findSkuInStore(storeId, variant.sku)) {
        throw new CatalogError("STORE_SKU_TAKEN", `SKU ${variant.sku} is already used by this store.`, 409);
      }
    }
    const product = await this.repository.createProduct(storeId, input);
    await this.audit(principal, "catalog.product.created", "Product", product.id, requestId, { storeId });
    return toVendorProduct(product, this.mediaStorage);
  }

  async listStoreProducts(principal: AccessPrincipal, storeId: string): Promise<VendorProductDto[]> {
    await this.vendorBoundary.requireStorePermission(principal, storeId, "product:update");
    return (await this.repository.listStoreProducts(storeId)).map((product) =>
      toVendorProduct(product, this.mediaStorage),
    );
  }

  private async vendorProduct(
    principal: AccessPrincipal,
    productId: string,
    permission: "product:update" | "product:archive",
  ): Promise<ProductRecord> {
    const product = await this.repository.findProduct(productId);
    if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, product.storeId, permission);
    return product;
  }

  async getVendorProduct(principal: AccessPrincipal, productId: string): Promise<VendorProductDto> {
    return toVendorProduct(
      await this.vendorProduct(principal, productId, "product:update"),
      this.mediaStorage,
    );
  }

  async updateProduct(
    principal: AccessPrincipal,
    productId: string,
    input: UpdateProductBodyDto,
    requestId?: string,
  ): Promise<VendorProductDto> {
    const existing = await this.vendorProduct(principal, productId, "product:update");
    await this.requireUsableCategory(input.categoryId);
    if (input.slug && input.slug !== existing.slug) {
      const collision = await this.repository.findStoreProductBySlug(existing.storeId, input.slug);
      if (collision && collision.id !== productId) {
        throw new CatalogError("PRODUCT_SLUG_TAKEN", "That product slug is already used by this store.", 409);
      }
    }
    const updated = await this.repository.updateProduct(productId, input);
    if (!updated) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    await this.audit(principal, "catalog.product.updated", "Product", productId, requestId);
    return toVendorProduct(updated, this.mediaStorage);
  }

  async addVariant(
    principal: AccessPrincipal,
    productId: string,
    input: CreateProductVariantFromIdsBodyDto,
    requestId?: string,
  ): Promise<ProductVariantDto> {
    const product = await this.vendorProduct(principal, productId, "product:update");
    if (product.status === "ARCHIVED") {
      throw new CatalogError("PRODUCT_ARCHIVED", "Archived products cannot receive new variants.", 409);
    }
    assertNgCurrency(input.price.currency);
    if (await this.repository.findSkuInStore(product.storeId, input.sku)) {
      throw new CatalogError("STORE_SKU_TAKEN", `SKU ${input.sku} is already used by this store.`, 409);
    }
    if (product.options.length === 0) {
      if (input.optionValueIds.length !== 0 || product.variants.length > 0) {
        throw new CatalogError(
          "INVALID_VARIANT_SELECTIONS",
          "A product without options can contain only one variant.",
          400,
        );
      }
    } else {
      const values = await this.repository.listProductOptionValues(productId, input.optionValueIds);
      if (values.length !== input.optionValueIds.length) {
        throw new CatalogError(
          "INVALID_VARIANT_OPTION_VALUE",
          "Every option value must belong to this product.",
          400,
        );
      }
      const optionIds = new Set(values.map((value) => value.option.id));
      if (optionIds.size !== product.options.length || values.length !== product.options.length) {
        throw new CatalogError(
          "INVALID_VARIANT_SELECTIONS",
          "A variant must select exactly one value for every product option.",
          400,
        );
      }
      const candidate = [...values].map((value) => value.id).sort().join("|");
      for (const variant of product.variants) {
        const existingCombination = variant.optionValues
          .map((entry) => entry.optionValue.id)
          .sort()
          .join("|");
        if (candidate === existingCombination) {
          throw new CatalogError(
            "DUPLICATE_VARIANT_COMBINATION",
            "That option combination already exists.",
            409,
          );
        }
      }
    }
    const variant = await this.repository.createVariant(productId, product.storeId, input);
    await this.audit(principal, "catalog.variant.created", "ProductVariant", variant.id, requestId, {
      productId,
      storeId: product.storeId,
    });
    return toVariant(variant);
  }

  async updateVariant(
    principal: AccessPrincipal,
    variantId: string,
    input: UpdateProductVariantBodyDto,
    requestId?: string,
  ): Promise<ProductVariantDto> {
    const variant = await this.repository.findVariant(variantId);
    if (!variant) throw new CatalogError("VARIANT_NOT_FOUND", "Variant was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, variant.storeId, "product:update");
    if (input.price) assertNgCurrency(input.price.currency);
    if (input.sku && input.sku !== variant.sku) {
      if (await this.repository.findSkuInStore(variant.storeId, input.sku, variantId)) {
        throw new CatalogError("STORE_SKU_TAKEN", `SKU ${input.sku} is already used by this store.`, 409);
      }
    }
    const updated = await this.repository.updateVariant(variantId, input);
    if (!updated) throw new CatalogError("VARIANT_NOT_FOUND", "Variant was not found.", 404);
    await this.audit(principal, "catalog.variant.updated", "ProductVariant", variantId, requestId);
    return toVariant(updated);
  }

  async publishProduct(
    principal: AccessPrincipal,
    productId: string,
    requestId?: string,
  ): Promise<VendorProductDto> {
    const product = await this.vendorProduct(principal, productId, "product:update");
    const context = await this.vendorBoundary.requireStorePermission(
      principal,
      product.storeId,
      "product:update",
    );
    if (context.vendor.status !== "APPROVED") {
      throw new CatalogError("VENDOR_NOT_APPROVED", "Vendor approval is required before publishing.", 409);
    }
    if (context.store.status !== "ACTIVE") {
      throw new CatalogError("STORE_NOT_ACTIVE", "The store must be active before publishing products.", 409);
    }
    if (product.status === "ARCHIVED") {
      throw new CatalogError("PRODUCT_ARCHIVED", "Archived products cannot be published.", 409);
    }
    if (!["NOT_REQUIRED", "APPROVED"].includes(product.moderationStatus)) {
      throw new CatalogError(
        "PRODUCT_MODERATION_REQUIRED",
        "This product must pass moderation before it can be published.",
        409,
      );
    }
    await this.requireUsableCategory(product.categoryId);
    if (activeVariants(product).length === 0) {
      throw new CatalogError("ACTIVE_VARIANT_REQUIRED", "At least one active variant is required.", 409);
    }
    const updated = await this.repository.setProductStatus(productId, "ACTIVE", null);
    if (!updated) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    await this.audit(principal, "catalog.product.published", "Product", productId, requestId);
    return toVendorProduct(updated, this.mediaStorage);
  }

  async archiveProduct(
    principal: AccessPrincipal,
    productId: string,
    requestId?: string,
  ): Promise<VendorProductDto> {
    await this.vendorProduct(principal, productId, "product:archive");
    const updated = await this.repository.setProductStatus(productId, "ARCHIVED", new Date());
    if (!updated) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    await this.audit(principal, "catalog.product.archived", "Product", productId, requestId);
    return toVendorProduct(updated, this.mediaStorage);
  }

  async listModerationProducts(
    principal: AccessPrincipal,
    status?: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED",
  ): Promise<VendorProductDto[]> {
    this.requireAdmin(principal);
    return (await this.repository.listModerationProducts(status)).map((product) =>
      toVendorProduct(product, this.mediaStorage),
    );
  }

  async moderateProduct(
    principal: AccessPrincipal,
    productId: string,
    input: ProductModerationBodyDto,
    requestId?: string,
  ): Promise<VendorProductDto> {
    this.requireAdmin(principal);
    const product = await this.repository.findProduct(productId);
    if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    const updated = await this.repository.setModerationStatus(productId, input.status);
    if (!updated) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    await this.audit(
      principal,
      `catalog.product.moderation.${input.status.toLowerCase()}`,
      "Product",
      productId,
      requestId,
      input.reason ? { reason: input.reason, storeId: product.storeId } : { storeId: product.storeId },
    );
    return toVendorProduct(updated, this.mediaStorage);
  }

  private storageOrThrow(): MediaStorage {
    if (!this.mediaStorage) {
      throw new CatalogError(
        "MEDIA_STORAGE_UNAVAILABLE",
        "Product media storage is not configured.",
        503,
      );
    }
    return this.mediaStorage;
  }

  private async mediaStoreId(
    principal: AccessPrincipal,
    ownerType: "PRODUCT" | "STORE",
    ownerId: string,
  ): Promise<string> {
    if (ownerType === "STORE") {
      await this.vendorBoundary.requireStorePermission(principal, ownerId, "store:update");
      return ownerId;
    }
    const product = await this.repository.findProduct(ownerId);
    if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    await this.vendorBoundary.requireStorePermission(principal, product.storeId, "product:update");
    return product.storeId;
  }

  private extensionForMimeType(mimeType: string): string {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    throw new CatalogError("UNSUPPORTED_MEDIA_TYPE", "Unsupported media type.", 400);
  }

  async createMediaUploadIntent(
    principal: AccessPrincipal,
    input: MediaUploadIntentBodyDto,
    requestId?: string,
  ): Promise<MediaUploadIntentResponseDto> {
    const storage = this.storageOrThrow();
    const storeId = await this.mediaStoreId(principal, input.ownerType, input.ownerId);
    const extension = this.extensionForMimeType(input.mimeType);
    const objectKey =
      input.ownerType === "PRODUCT"
        ? `stores/${storeId}/products/${input.ownerId}/${randomUUID()}.${extension}`
        : `stores/${storeId}/branding/${randomUUID()}.${extension}`;
    const media = await this.repository.createPendingMedia({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      objectKey,
      bucket: storage.bucket,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      ...(input.originalFilename ? { originalFilename: input.originalFilename } : {}),
      ...(input.altText !== undefined ? { altText: input.altText } : {}),
      displayOrder: input.displayOrder ?? 0,
      createdBy: principal.userId,
    });
    const upload = await storage.createUploadAuthorization(objectKey, input.mimeType);
    await this.audit(principal, "catalog.media.upload-intent.created", "Media", media.id, requestId, {
      storeId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
    });
    return {
      media: toVendorMedia(media, storage),
      upload: {
        method: upload.method,
        url: upload.url,
        headers: upload.headers,
        expiresAt: upload.expiresAt.toISOString(),
      },
    };
  }

  private async authorizeMedia(principal: AccessPrincipal, media: MediaRecord): Promise<void> {
    if (media.productId) {
      const storeId = media.product?.storeId;
      if (!storeId) throw new CatalogError("MEDIA_OWNER_INVALID", "Media product owner is invalid.", 409);
      await this.vendorBoundary.requireStorePermission(principal, storeId, "product:update");
      return;
    }
    if (media.storeId) {
      await this.vendorBoundary.requireStorePermission(principal, media.storeId, "store:update");
      return;
    }
    throw new CatalogError("MEDIA_OWNER_INVALID", "Media does not have a valid owner.", 409);
  }

  async completeMediaUpload(
    principal: AccessPrincipal,
    mediaId: string,
    input: CompleteMediaUploadBodyDto,
    requestId?: string,
  ): Promise<VendorMediaDto> {
    const storage = this.storageOrThrow();
    const media = await this.repository.findMedia(mediaId);
    if (!media) throw new CatalogError("MEDIA_NOT_FOUND", "Media was not found.", 404);
    await this.authorizeMedia(principal, media);
    if (media.status !== "PENDING") {
      throw new CatalogError("MEDIA_NOT_PENDING", "Only pending media can be completed.", 409);
    }
    if (media.bucket !== storage.bucket) {
      throw new CatalogError("MEDIA_STORAGE_MISMATCH", "Media belongs to a different storage bucket.", 409);
    }
    const object = await storage.headObject(media.objectKey);
    if (!object) throw new CatalogError("MEDIA_UPLOAD_NOT_FOUND", "Uploaded object was not found.", 409);
    if (object.sizeBytes !== Number(media.sizeBytes)) {
      throw new CatalogError("MEDIA_SIZE_MISMATCH", "Uploaded media size does not match the upload intent.", 409);
    }
    if (object.contentType && object.contentType !== media.mimeType) {
      throw new CatalogError("MEDIA_TYPE_MISMATCH", "Uploaded media type does not match the upload intent.", 409);
    }
    const completed = await this.repository.completeMedia(mediaId, input);
    if (!completed) throw new CatalogError("MEDIA_NOT_FOUND", "Media was not found.", 404);
    await this.audit(principal, "catalog.media.activated", "Media", mediaId, requestId);
    return toVendorMedia(completed, storage);
  }

  async updateMedia(
    principal: AccessPrincipal,
    mediaId: string,
    input: UpdateMediaBodyDto,
    requestId?: string,
  ): Promise<VendorMediaDto> {
    const media = await this.repository.findMedia(mediaId);
    if (!media) throw new CatalogError("MEDIA_NOT_FOUND", "Media was not found.", 404);
    await this.authorizeMedia(principal, media);
    const updated = await this.repository.updateMedia(mediaId, input);
    if (!updated) throw new CatalogError("MEDIA_NOT_FOUND", "Media was not found.", 404);
    await this.audit(principal, "catalog.media.updated", "Media", mediaId, requestId);
    return toVendorMedia(updated, this.mediaStorage);
  }

  private async categoryScope(categoryId?: string): Promise<string[] | undefined> {
    if (!categoryId) return undefined;
    const root = await this.repository.findCategory(categoryId);
    if (!root || root.status !== "ACTIVE") return [];
    const ids = [root.id];
    const queue = [root.id];
    while (queue.length > 0) {
      const parentId = queue.shift()!;
      const children = await this.repository.listChildCategories(parentId);
      for (const child of children) {
        if (child.status !== "ACTIVE" || ids.includes(child.id)) continue;
        ids.push(child.id);
        queue.push(child.id);
        if (ids.length > 1000) {
          throw new CatalogError("CATEGORY_SCOPE_TOO_LARGE", "Category hierarchy is too large.", 409);
        }
      }
    }
    return ids;
  }

  async listPublicCatalog(query: CatalogQueryDto): Promise<CatalogProductListResponseDto> {
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "20", 10)));
    const currency = query.currency ?? "NGN";
    assertNgCurrency(currency);
    const minPriceMinor = query.minPriceMinor !== undefined ? BigInt(query.minPriceMinor) : undefined;
    const maxPriceMinor = query.maxPriceMinor !== undefined ? BigInt(query.maxPriceMinor) : undefined;
    if (minPriceMinor !== undefined && maxPriceMinor !== undefined && minPriceMinor > maxPriceMinor) {
      throw new CatalogError("INVALID_PRICE_RANGE", "Minimum price cannot exceed maximum price.", 400);
    }
    const result = await this.repository.listPublicCatalog({
      ...(query.q ? { q: query.q.trim() } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(await this.categoryScope(query.categoryId)
        ? { categoryIds: await this.categoryScope(query.categoryId) }
        : {}),
      currency,
      ...(minPriceMinor !== undefined ? { minPriceMinor } : {}),
      ...(maxPriceMinor !== undefined ? { maxPriceMinor } : {}),
      sort: query.sort ?? "NEWEST",
      page,
      pageSize,
    });
    return {
      items: result.items.map((product) => toPublicSummary(product, this.mediaStorage)),
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: result.totalItems === 0 ? 0 : Math.ceil(result.totalItems / pageSize),
      },
    };
  }

  async getPublicProduct(productId: string): Promise<CatalogProductDetailDto> {
    const product = await this.repository.findPublicProduct(productId);
    if (!product) throw new CatalogError("PRODUCT_NOT_FOUND", "Product was not found.", 404);
    const summary = toPublicSummary(product, this.mediaStorage);
    return {
      ...summary,
      options: product.options.map((option) => ({
        id: option.id,
        name: option.name,
        position: option.position,
        values: option.values.map((value) => ({
          id: value.id,
          value: value.value,
          position: value.position,
        })),
      })),
      variants: activeVariants(product).map(toVariant),
    };
  }
}
