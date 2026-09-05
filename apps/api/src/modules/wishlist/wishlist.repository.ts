import type { DatabaseClient } from "@repo/database";

export interface WishlistItemRecord {
  readonly id: string;
  readonly wishlistId: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly createdAt: Date;
}

export interface WishlistRecord {
  readonly id: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly items: readonly WishlistItemRecord[];
}

export interface WishlistRepository {
  getOrCreate(userId: string): Promise<WishlistRecord>;
  findForUser(userId: string): Promise<WishlistRecord | null>;
  findMatchingItem(wishlistId: string, productId: string, variantId: string | null): Promise<WishlistItemRecord | null>;
  addItem(wishlistId: string, productId: string, variantId: string | null): Promise<WishlistItemRecord>;
  removeItem(userId: string, wishlistItemId: string): Promise<boolean>;
}

const includeItems = { items: { orderBy: { createdAt: "desc" as const } } } as const;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

export class PrismaWishlistRepository implements WishlistRepository {
  constructor(private readonly database: DatabaseClient) {}

  async getOrCreate(userId: string): Promise<WishlistRecord> {
    return this.database.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: includeItems,
    });
  }

  async findForUser(userId: string): Promise<WishlistRecord | null> {
    return this.database.wishlist.findUnique({ where: { userId }, include: includeItems });
  }

  async findMatchingItem(
    wishlistId: string,
    productId: string,
    variantId: string | null,
  ): Promise<WishlistItemRecord | null> {
    return this.database.wishlistItem.findFirst({
      where: { wishlistId, productId, variantId },
    });
  }

  async addItem(wishlistId: string, productId: string, variantId: string | null): Promise<WishlistItemRecord> {
    try {
      return await this.database.$transaction(async (transaction) => {
        const item = await transaction.wishlistItem.create({
          data: { wishlistId, productId, variantId },
        });
        await transaction.wishlist.update({ where: { id: wishlistId }, data: { updatedAt: new Date() } });
        return item;
      });
    } catch (error) {
      // Variant-specific rows use the Prisma composite unique key; product-only
      // rows use the reviewed partial PostgreSQL index because NULL is distinct
      // in a normal composite unique index. Concurrent duplicate saves are
      // intentionally idempotent at the API boundary.
      if (isUniqueConstraintError(error)) {
        const existing = await this.findMatchingItem(wishlistId, productId, variantId);
        if (existing) return existing;
      }
      throw error;
    }
  }

  async removeItem(userId: string, wishlistItemId: string): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const item = await transaction.wishlistItem.findFirst({
        where: { id: wishlistItemId, wishlist: { userId } },
      });
      if (!item) return false;
      await transaction.wishlistItem.delete({ where: { id: wishlistItemId } });
      await transaction.wishlist.update({ where: { id: item.wishlistId }, data: { updatedAt: new Date() } });
      return true;
    });
  }
}
