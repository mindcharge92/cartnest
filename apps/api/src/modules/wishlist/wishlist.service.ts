import type {
  AddWishlistItemBodyDto,
  CatalogProductDetailDto,
  WishlistItemDto,
  WishlistResponseDto,
} from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { CatalogCommerceBoundary } from "../catalog/catalog.public.js";
import type { WishlistItemRecord, WishlistRecord, WishlistRepository } from "./wishlist.repository.js";

export class WishlistError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "WishlistError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function productSummary(product: CatalogProductDetailDto) {
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    store: product.store,
    category: product.category,
    priceFrom: product.priceFrom,
    media: product.media,
    createdAt: product.createdAt,
  };
}

export class WishlistService {
  constructor(
    private readonly repository: WishlistRepository,
    private readonly catalogBoundary: CatalogCommerceBoundary,
  ) {}

  private async mapItem(item: WishlistItemRecord): Promise<WishlistItemDto | null> {
    const product = await this.catalogBoundary.findPublicProduct(item.productId);
    if (!product) return null;
    const variant = item.variantId
      ? product.variants.find((candidate) => candidate.id === item.variantId) ?? null
      : null;
    return {
      id: item.id,
      product: productSummary(product),
      variant,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async toResponse(record: WishlistRecord): Promise<WishlistResponseDto> {
    const mapped = await Promise.all(record.items.map((item) => this.mapItem(item)));
    return {
      id: record.id,
      items: mapped.filter((item): item is WishlistItemDto => item !== null),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async getWishlist(principal: AccessPrincipal): Promise<WishlistResponseDto> {
    return this.toResponse(await this.repository.getOrCreate(principal.userId));
  }

  async addItem(
    principal: AccessPrincipal,
    input: AddWishlistItemBodyDto,
  ): Promise<WishlistResponseDto> {
    const product = await this.catalogBoundary.findPublicProduct(input.productId);
    if (!product) {
      throw new WishlistError("PRODUCT_NOT_AVAILABLE", "This product is not currently available.", 409);
    }
    if (input.variantId && !product.variants.some((variant) => variant.id === input.variantId)) {
      throw new WishlistError(
        "VARIANT_NOT_AVAILABLE",
        "The selected variant is not currently available for this product.",
        409,
      );
    }

    const wishlist = await this.repository.getOrCreate(principal.userId);
    const existing = await this.repository.findMatchingItem(
      wishlist.id,
      input.productId,
      input.variantId ?? null,
    );
    if (!existing) {
      await this.repository.addItem(wishlist.id, input.productId, input.variantId ?? null);
    }
    return this.toResponse((await this.repository.findForUser(principal.userId)) ?? wishlist);
  }

  async removeItem(principal: AccessPrincipal, wishlistItemId: string): Promise<WishlistResponseDto> {
    const removed = await this.repository.removeItem(principal.userId, wishlistItemId);
    if (!removed) throw new WishlistError("WISHLIST_ITEM_NOT_FOUND", "Wishlist item was not found.", 404);
    return this.toResponse(await this.repository.getOrCreate(principal.userId));
  }
}
