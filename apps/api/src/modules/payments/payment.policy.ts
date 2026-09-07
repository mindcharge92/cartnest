import type { DatabaseClient } from "@repo/database";
import type {
  CheckoutFinancialPolicy,
  CheckoutStoreFinancialQuote,
  CheckoutStorePolicyInput,
} from "../orders/order.policy.js";

interface CommissionRuleCandidate {
  readonly vendorId: string | null;
  readonly categoryId: string | null;
  readonly rateBps: number;
  readonly priority: number;
  readonly createdAt: Date;
}

function specificity(rule: CommissionRuleCandidate, vendorId: string, categoryId: string | null): number {
  if (rule.vendorId === vendorId && categoryId && rule.categoryId === categoryId) return 4;
  if (rule.vendorId === vendorId && rule.categoryId === null) return 3;
  if (rule.vendorId === null && categoryId && rule.categoryId === categoryId) return 2;
  if (rule.vendorId === null && rule.categoryId === null) return 1;
  return 0;
}

function chooseRule(
  rules: readonly CommissionRuleCandidate[],
  vendorId: string,
  categoryId: string | null,
): CommissionRuleCandidate | null {
  return (
    [...rules]
      .filter((rule) => specificity(rule, vendorId, categoryId) > 0)
      .sort((left, right) => {
        const bySpecificity =
          specificity(right, vendorId, categoryId) - specificity(left, vendorId, categoryId);
        if (bySpecificity !== 0) return bySpecificity;
        if (right.priority !== left.priority) return right.priority - left.priority;
        return right.createdAt.getTime() - left.createdAt.getTime();
      })[0] ?? null
  );
}

function rateAmount(base: bigint, rateBps: number): bigint {
  return (base * BigInt(rateBps)) / 10_000n;
}

function normalizePromotionCode(value: string): string {
  return value.trim().toUpperCase();
}

function allocateFixedDiscount(
  amount: bigint,
  subtotals: ReadonlyMap<string, bigint>,
): ReadonlyMap<string, bigint> {
  const entries = [...subtotals.entries()].sort(([left], [right]) => left.localeCompare(right));
  const total = entries.reduce((sum, [, subtotal]) => sum + subtotal, 0n);
  if (total <= 0n || amount <= 0n) return new Map();
  const capped = amount > total ? total : amount;
  let allocated = 0n;
  const result = new Map<string, bigint>();
  for (const [index, [storeId, subtotal]] of entries.entries()) {
    const share = index === entries.length - 1 ? capped - allocated : (capped * subtotal) / total;
    const safeShare = share > subtotal ? subtotal : share;
    result.set(storeId, safeShare);
    allocated += safeShare;
  }
  return result;
}

/**
 * P10 financial policy:
 * - commission specificity remains vendor+category -> vendor -> category -> platform default;
 * - one optional platform promotion code is resolved against the entire active cart;
 * - percentage promotion values are basis points;
 * - fixed discounts are allocated deterministically across stores;
 * - VAT/tax is applied to the net merchandise value after discount, excluding delivery;
 * - commission remains based on pre-discount merchandise value to preserve the P7 baseline.
 */
export class DatabaseCheckoutFinancialPolicy implements CheckoutFinancialPolicy {
  constructor(
    private readonly database: DatabaseClient,
    private readonly allowMissingDefault = true,
    private readonly requireTaxRate = false,
  ) {}

  private async promotionForStore(input: CheckoutStorePolicyInput): Promise<{ id?: string; discount: bigint }> {
    if (!input.promotionCode) return { discount: 0n };
    const now = new Date();
    const promotion = await this.database.promotion.findUnique({
      where: { code: normalizePromotionCode(input.promotionCode) },
    });
    if (
      !promotion ||
      promotion.status !== "ACTIVE" ||
      promotion.startsAt > now ||
      (promotion.endsAt && promotion.endsAt <= now)
    ) {
      throw new Error("PROMOTION_INVALID");
    }

    const cartItems = await this.database.cartItem.findMany({
      where: { cartId: input.cartId, cart: { userId: input.userId, status: "ACTIVE" } },
      include: { variant: { include: { product: { select: { storeId: true } } } } },
    });
    const storeSubtotals = new Map<string, bigint>();
    for (const item of cartItems) {
      if (item.variant.currency !== input.currency) throw new Error("PROMOTION_INVALID");
      const subtotal = item.variant.priceAmountMinor * BigInt(item.quantity);
      const storeId = item.variant.product.storeId;
      storeSubtotals.set(storeId, (storeSubtotals.get(storeId) ?? 0n) + subtotal);
    }
    const cartSubtotal = [...storeSubtotals.values()].reduce((sum, value) => sum + value, 0n);
    if (promotion.minOrderAmountMinor !== null && cartSubtotal < promotion.minOrderAmountMinor) {
      throw new Error("PROMOTION_MINIMUM_NOT_MET");
    }
    if (promotion.maxRedemptions !== null) {
      const totalRedemptions = await this.database.promotionRedemption.count({ where: { promotionId: promotion.id } });
      if (totalRedemptions >= promotion.maxRedemptions) throw new Error("PROMOTION_EXHAUSTED");
    }
    if (promotion.perUserLimit !== null) {
      const userRedemptions = await this.database.promotionRedemption.count({
        where: { promotionId: promotion.id, userId: input.userId },
      });
      if (userRedemptions >= promotion.perUserLimit) throw new Error("PROMOTION_USER_LIMIT_REACHED");
    }

    let discount: bigint;
    if (promotion.type === "PERCENTAGE") {
      discount = rateAmount(input.itemSubtotalAmountMinor, Number(promotion.value));
    } else {
      if (promotion.currency && promotion.currency !== input.currency) throw new Error("PROMOTION_INVALID");
      discount = allocateFixedDiscount(promotion.value, storeSubtotals).get(input.storeId) ?? 0n;
    }
    if (discount > input.itemSubtotalAmountMinor) discount = input.itemSubtotalAmountMinor;
    return { id: promotion.id, discount };
  }

  async quoteStore(input: CheckoutStorePolicyInput): Promise<CheckoutStoreFinancialQuote> {
    const now = new Date();
    const categoryIds = [...new Set(input.lines.map((line) => line.categoryId).filter(Boolean))] as string[];
    const rules = await this.database.commissionRule.findMany({
      where: {
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        AND: [
          { OR: [{ vendorId: null }, { vendorId: input.vendorId }] },
          { OR: [{ categoryId: null }, ...(categoryIds.length ? [{ categoryId: { in: categoryIds } }] : [])] },
        ],
      },
      select: { vendorId: true, categoryId: true, rateBps: true, priority: true, createdAt: true },
    });

    let commissionAmountMinor = 0n;
    for (const line of input.lines) {
      const rule = chooseRule(rules, input.vendorId, line.categoryId);
      if (!rule && !this.allowMissingDefault) throw new Error("COMMISSION_RULE_REQUIRED");
      const lineSubtotal = line.unitPriceAmountMinor * BigInt(line.quantity);
      commissionAmountMinor += rateAmount(lineSubtotal, rule?.rateBps ?? 0);
    }
    const effectiveRateBps =
      input.itemSubtotalAmountMinor === 0n
        ? 0
        : Number((commissionAmountMinor * 10_000n) / input.itemSubtotalAmountMinor);

    const promotion = await this.promotionForStore(input);
    const taxRate = await this.database.taxRate.findFirst({
      where: {
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    });
    if (!taxRate && this.requireTaxRate) throw new Error("TAX_RATE_REQUIRED");
    const taxableMerchandise = input.itemSubtotalAmountMinor - promotion.discount;
    const taxAmountMinor = rateAmount(taxableMerchandise, taxRate?.rateBps ?? 0);

    return {
      discountAmountMinor: promotion.discount,
      deliveryAmountMinor: 0n,
      taxAmountMinor,
      commissionRateBps: effectiveRateBps,
      commissionAmountMinor,
      ...(promotion.id ? { promotionId: promotion.id } : {}),
    };
  }
}
