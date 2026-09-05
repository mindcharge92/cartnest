import type { DatabaseClient } from "@repo/database";

export interface CartItemRecord {
  readonly id: string;
  readonly cartId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CartRecord {
  readonly id: string;
  readonly userId: string;
  readonly status: "ACTIVE" | "CONVERTED" | "ABANDONED";
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly items: readonly CartItemRecord[];
}

export interface CartRepository {
  findActive(userId: string): Promise<CartRecord | null>;
  getOrCreateActive(userId: string): Promise<CartRecord>;
  findItemForUser(userId: string, cartItemId: string): Promise<CartItemRecord | null>;
  findItemByVariant(cartId: string, variantId: string): Promise<CartItemRecord | null>;
  setItemQuantity(cartId: string, variantId: string, quantity: number): Promise<CartItemRecord>;
  removeItem(userId: string, cartItemId: string): Promise<boolean>;
}

const includeItems = { items: { orderBy: { createdAt: "asc" as const } } } as const;

export class PrismaCartRepository implements CartRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findActive(userId: string): Promise<CartRecord | null> {
    return this.database.cart.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: includeItems,
    });
  }

  async getOrCreateActive(userId: string): Promise<CartRecord> {
    const existing = await this.findActive(userId);
    if (existing) return existing;
    return this.database.cart.create({ data: { userId, status: "ACTIVE" }, include: includeItems });
  }

  async findItemForUser(userId: string, cartItemId: string): Promise<CartItemRecord | null> {
    return this.database.cartItem.findFirst({
      where: { id: cartItemId, cart: { userId, status: "ACTIVE" } },
    });
  }

  async findItemByVariant(cartId: string, variantId: string): Promise<CartItemRecord | null> {
    return this.database.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  }

  async setItemQuantity(cartId: string, variantId: string, quantity: number): Promise<CartItemRecord> {
    return this.database.$transaction(async (transaction) => {
      const item = await transaction.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        create: { cartId, variantId, quantity },
        update: { quantity },
      });
      await transaction.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
      return item;
    });
  }

  async removeItem(userId: string, cartItemId: string): Promise<boolean> {
    return this.database.$transaction(async (transaction) => {
      const item = await transaction.cartItem.findFirst({
        where: { id: cartItemId, cart: { userId, status: "ACTIVE" } },
      });
      if (!item) return false;
      await transaction.cartItem.delete({ where: { id: cartItemId } });
      await transaction.cart.update({ where: { id: item.cartId }, data: { updatedAt: new Date() } });
      return true;
    });
  }
}
