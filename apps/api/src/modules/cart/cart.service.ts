import type {
  AddCartItemBodyDto,
  CartItemDto,
  CartResponseDto,
  CheckoutPreviewIssueDto,
  CheckoutPreviewResponseDto,
  CheckoutPreviewStoreGroupDto,
  UpdateCartItemBodyDto,
} from "@repo/contracts";
import type { AccessPrincipal } from "../auth/auth.public.js";
import type { CatalogCommerceBoundary, CommerceVariantContext } from "../catalog/catalog.public.js";
import type { InventoryAvailabilityBoundary } from "../inventory/inventory.public.js";
import type { CartItemRecord, CartRecord, CartRepository } from "./cart.repository.js";

export class CartError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "CartError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function lineSubtotal(amountMinor: string, quantity: number): string {
  return (BigInt(amountMinor) * BigInt(quantity)).toString();
}

export class CartService {
  constructor(
    private readonly repository: CartRepository,
    private readonly catalogBoundary: CatalogCommerceBoundary,
    private readonly inventoryBoundary: InventoryAvailabilityBoundary,
  ) {}

  private async mapAvailableItem(item: CartItemRecord): Promise<CartItemDto | null> {
    const context = await this.catalogBoundary.findPurchasableVariant(item.variantId);
    if (!context) return null;
    const product = await this.catalogBoundary.findPublicProduct(context.productId);
    if (!product) return null;
    const variant = product.variants.find((candidate) => candidate.id === item.variantId);
    if (!variant) return null;
    const availability = await this.inventoryBoundary.getAvailability(item.variantId);
    return {
      id: item.id,
      quantity: item.quantity,
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        store: product.store,
        media: product.media,
      },
      variant,
      availableQuantity: availability.available,
      lineSubtotal: {
        amountMinor: lineSubtotal(variant.price.amountMinor, item.quantity),
        currency: variant.price.currency,
      },
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private async toResponse(cart: CartRecord): Promise<CartResponseDto> {
    const mapped = await Promise.all(cart.items.map((item) => this.mapAvailableItem(item)));
    const items = mapped.filter((item): item is CartItemDto => item !== null);
    const currency = items[0]?.variant.price.currency ?? "NGN";
    if (items.some((item) => item.variant.price.currency !== currency)) {
      throw new CartError("CART_CURRENCY_MISMATCH", "Cart items must use one currency.", 409);
    }
    const subtotal = items.reduce(
      (total, item) => total + BigInt(item.lineSubtotal.amountMinor),
      0n,
    );
    return {
      id: cart.id,
      status: cart.status,
      items,
      itemCount: items.reduce((count, item) => count + item.quantity, 0),
      distinctStoreCount: new Set(items.map((item) => item.product.store.id)).size,
      subtotal: { amountMinor: subtotal.toString(), currency },
      createdAt: cart.createdAt.toISOString(),
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  async getCart(principal: AccessPrincipal): Promise<CartResponseDto> {
    return this.toResponse(await this.repository.getOrCreateActive(principal.userId));
  }

  async addItem(principal: AccessPrincipal, input: AddCartItemBodyDto): Promise<CartResponseDto> {
    const variant = await this.catalogBoundary.findPurchasableVariant(input.variantId);
    if (!variant) throw new CartError("VARIANT_NOT_AVAILABLE", "This variant is not currently purchasable.", 409);
    const availability = await this.inventoryBoundary.getAvailability(input.variantId);
    const cart = await this.repository.getOrCreateActive(principal.userId);
    const existing = await this.repository.findItemByVariant(cart.id, input.variantId);
    const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
    if (nextQuantity > availability.available) {
      throw new CartError(
        "INSUFFICIENT_STOCK",
        `Only ${availability.available} unit(s) are currently available.`,
        409,
      );
    }
    await this.repository.setItemQuantity(cart.id, input.variantId, nextQuantity);
    return this.toResponse((await this.repository.findActive(principal.userId)) ?? cart);
  }

  async updateItem(
    principal: AccessPrincipal,
    cartItemId: string,
    input: UpdateCartItemBodyDto,
  ): Promise<CartResponseDto> {
    const item = await this.repository.findItemForUser(principal.userId, cartItemId);
    if (!item) throw new CartError("CART_ITEM_NOT_FOUND", "Cart item was not found.", 404);
    const variant = await this.catalogBoundary.findPurchasableVariant(item.variantId);
    if (!variant) throw new CartError("VARIANT_NOT_AVAILABLE", "This variant is not currently purchasable.", 409);
    const availability = await this.inventoryBoundary.getAvailability(item.variantId);
    if (input.quantity > availability.available) {
      throw new CartError(
        "INSUFFICIENT_STOCK",
        `Only ${availability.available} unit(s) are currently available.`,
        409,
      );
    }
    await this.repository.setItemQuantity(item.cartId, item.variantId, input.quantity);
    return this.toResponse(await this.repository.getOrCreateActive(principal.userId));
  }

  async removeItem(principal: AccessPrincipal, cartItemId: string): Promise<CartResponseDto> {
    const removed = await this.repository.removeItem(principal.userId, cartItemId);
    if (!removed) throw new CartError("CART_ITEM_NOT_FOUND", "Cart item was not found.", 404);
    return this.toResponse(await this.repository.getOrCreateActive(principal.userId));
  }

  private availabilityIssue(
    item: CartItemRecord,
    context: CommerceVariantContext | null,
  ): CheckoutPreviewIssueDto | null {
    if (!context) {
      return { cartItemId: item.id, code: "VARIANT_UNAVAILABLE", message: "The selected variant no longer exists." };
    }
    if (context.vendorStatus !== "APPROVED") {
      return { cartItemId: item.id, code: "VENDOR_UNAVAILABLE", message: "The vendor is not currently available." };
    }
    if (context.storeStatus !== "ACTIVE") {
      return { cartItemId: item.id, code: "STORE_UNAVAILABLE", message: "The store is not currently available." };
    }
    if (context.productStatus !== "ACTIVE" || !["NOT_REQUIRED", "APPROVED"].includes(context.moderationStatus)) {
      return { cartItemId: item.id, code: "PRODUCT_UNAVAILABLE", message: "The product is not currently available." };
    }
    if (context.status !== "ACTIVE") {
      return { cartItemId: item.id, code: "VARIANT_UNAVAILABLE", message: "The selected variant is not currently available." };
    }
    return null;
  }

  async previewCheckout(principal: AccessPrincipal): Promise<CheckoutPreviewResponseDto> {
    const cart = await this.repository.getOrCreateActive(principal.userId);
    const issues: CheckoutPreviewIssueDto[] = [];
    const groupTotals = new Map<string, { store: CheckoutPreviewStoreGroupDto["store"]; itemCount: number; subtotal: bigint }>();
    let subtotal = 0n;
    let itemCount = 0;
    let currency: string | undefined;

    for (const item of cart.items) {
      const context = await this.catalogBoundary.findVariantContext(item.variantId);
      const stateIssue = this.availabilityIssue(item, context);
      if (stateIssue) {
        issues.push(stateIssue);
        continue;
      }
      const purchasable = await this.catalogBoundary.findPurchasableVariant(item.variantId);
      if (!purchasable) {
        issues.push({ cartItemId: item.id, code: "VARIANT_UNAVAILABLE", message: "The selected variant is not purchasable." });
        continue;
      }
      if (currency && purchasable.currency !== currency) {
        throw new CartError("CART_CURRENCY_MISMATCH", "Cart items must use one currency.", 409);
      }
      currency ??= purchasable.currency;
      const availability = await this.inventoryBoundary.getAvailability(item.variantId);
      if (item.quantity > availability.available) {
        issues.push({
          cartItemId: item.id,
          code: "INSUFFICIENT_STOCK",
          message: `Only ${availability.available} unit(s) are available for ${purchasable.productName}.`,
        });
      }
      const line = purchasable.priceAmountMinor * BigInt(item.quantity);
      subtotal += line;
      itemCount += item.quantity;
      const current = groupTotals.get(purchasable.storeId);
      if (current) {
        current.itemCount += item.quantity;
        current.subtotal += line;
      } else {
        groupTotals.set(purchasable.storeId, {
          store: {
            id: purchasable.storeId,
            name: purchasable.storeName,
            slug: purchasable.storeSlug,
            vendorDisplayName: purchasable.vendorDisplayName,
          },
          itemCount: item.quantity,
          subtotal: line,
        });
      }
    }

    const resolvedCurrency = currency ?? "NGN";
    const storeGroups: CheckoutPreviewStoreGroupDto[] = [...groupTotals.values()].map((group) => ({
      store: group.store,
      itemCount: group.itemCount,
      subtotal: { amountMinor: group.subtotal.toString(), currency: resolvedCurrency },
    }));

    return {
      cartId: cart.id,
      ready: cart.items.length > 0 && issues.length === 0,
      currency: resolvedCurrency,
      subtotal: { amountMinor: subtotal.toString(), currency: resolvedCurrency },
      itemCount,
      storeGroups,
      issues,
      generatedAt: new Date().toISOString(),
    };
  }
}
