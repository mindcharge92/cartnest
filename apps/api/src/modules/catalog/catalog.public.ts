import type { CatalogProductDetailDto, ProductVariantDto } from "@repo/contracts";
import { CatalogError, type CatalogService } from "./catalog.service.js";
import type { CatalogRepository, ProductRecord, VariantRecord } from "./catalog.repository.js";

export interface CommerceVariantContext {
  readonly id: string;
  readonly productId: string;
  readonly storeId: string;
  readonly sku: string;
  readonly priceAmountMinor: bigint;
  readonly currency: string;
  readonly status: "ACTIVE" | "INACTIVE";
  readonly productName: string;
  readonly productSlug: string;
  readonly productStatus: "DRAFT" | "ACTIVE" | "ARCHIVED";
  readonly moderationStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  readonly storeName: string;
  readonly storeSlug: string;
  readonly storeStatus: "DRAFT" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  readonly vendorId: string;
  readonly vendorDisplayName: string;
  readonly vendorStatus: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  readonly optionValues: readonly {
    readonly optionId: string;
    readonly optionName: string;
    readonly valueId: string;
    readonly value: string;
  }[];
}

function variantContext(product: ProductRecord, variant: VariantRecord): CommerceVariantContext {
  return {
    id: variant.id,
    productId: variant.productId,
    storeId: variant.storeId,
    sku: variant.sku,
    priceAmountMinor: variant.priceAmountMinor,
    currency: variant.currency,
    status: variant.status,
    productName: product.name,
    productSlug: product.slug,
    productStatus: product.status,
    moderationStatus: product.moderationStatus,
    storeName: product.store.name,
    storeSlug: product.store.slug,
    storeStatus: product.store.status,
    vendorId: product.store.vendor.id,
    vendorDisplayName: product.store.vendor.displayName,
    vendorStatus: product.store.vendor.status,
    optionValues: variant.optionValues
      .map((entry) => ({
        optionId: entry.optionValue.option.id,
        optionName: entry.optionValue.option.name,
        valueId: entry.optionValue.id,
        value: entry.optionValue.value,
      }))
      .sort((left, right) => left.optionName.localeCompare(right.optionName)),
  };
}

export interface CatalogCommerceBoundary {
  findVariantContext(variantId: string): Promise<CommerceVariantContext | null>;
  findPurchasableVariant(variantId: string): Promise<CommerceVariantContext | null>;
  listStoreVariantContexts(storeId: string): Promise<CommerceVariantContext[]>;
  findPublicProduct(productId: string): Promise<CatalogProductDetailDto | null>;
  findPublicVariant(productId: string, variantId: string): Promise<ProductVariantDto | null>;
}

export class DefaultCatalogCommerceBoundary implements CatalogCommerceBoundary {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly service: CatalogService,
  ) {}

  async findVariantContext(variantId: string): Promise<CommerceVariantContext | null> {
    const variant = await this.repository.findVariant(variantId);
    if (!variant) return null;
    const product = await this.repository.findProduct(variant.productId);
    if (!product) return null;
    return variantContext(product, variant);
  }

  async findPurchasableVariant(variantId: string): Promise<CommerceVariantContext | null> {
    const variant = await this.repository.findVariant(variantId);
    if (!variant || variant.status !== "ACTIVE") return null;
    const product = await this.repository.findPublicProduct(variant.productId);
    if (!product) return null;
    const currentVariant = product.variants.find((entry) => entry.id === variantId && entry.status === "ACTIVE");
    return currentVariant ? variantContext(product, currentVariant) : null;
  }

  async listStoreVariantContexts(storeId: string): Promise<CommerceVariantContext[]> {
    const products = await this.repository.listStoreProducts(storeId);
    return products.flatMap((product) =>
      product.variants.map((variant) => variantContext(product, variant)),
    );
  }

  async findPublicProduct(productId: string): Promise<CatalogProductDetailDto | null> {
    try {
      return await this.service.getPublicProduct(productId);
    } catch (error) {
      if (error instanceof CatalogError && error.code === "PRODUCT_NOT_FOUND") return null;
      throw error;
    }
  }

  async findPublicVariant(productId: string, variantId: string): Promise<ProductVariantDto | null> {
    const product = await this.findPublicProduct(productId);
    if (!product) return null;
    return product.variants.find((variant) => variant.id === variantId) ?? null;
  }
}
