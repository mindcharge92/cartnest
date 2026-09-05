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

function commissionFor(subtotal: bigint, rateBps: number): bigint {
  return (subtotal * BigInt(rateBps)) / 10_000n;
}

/**
 * P7 resolves commission in this order:
 * vendor+category -> vendor -> category -> platform default.
 * Priority and newest-created rule break ties inside the same specificity.
 *
 * Discount, delivery and tax remain zero-value seams until P8/P10. The exact
 * commission amount is persisted on VendorOrder and later PaymentAllocation;
 * effective rate is retained for the VendorOrder-level summary when multiple
 * category rules contribute to one store order.
 */
export class DatabaseCheckoutFinancialPolicy implements CheckoutFinancialPolicy {
  constructor(
    private readonly database: DatabaseClient,
    private readonly allowMissingDefault = true,
  ) {}

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
      select: {
        vendorId: true,
        categoryId: true,
        rateBps: true,
        priority: true,
        createdAt: true,
      },
    });

    let commissionAmountMinor = 0n;
    for (const line of input.lines) {
      const rule = chooseRule(rules, input.vendorId, line.categoryId);
      if (!rule && !this.allowMissingDefault) {
        throw new Error("No active commission rule resolves this checkout line.");
      }
      const lineSubtotal = line.unitPriceAmountMinor * BigInt(line.quantity);
      commissionAmountMinor += commissionFor(lineSubtotal, rule?.rateBps ?? 0);
    }

    const effectiveRateBps =
      input.itemSubtotalAmountMinor === 0n
        ? 0
        : Number((commissionAmountMinor * 10_000n) / input.itemSubtotalAmountMinor);

    return {
      discountAmountMinor: 0n,
      deliveryAmountMinor: 0n,
      taxAmountMinor: 0n,
      commissionRateBps: effectiveRateBps,
      commissionAmountMinor,
    };
  }
}
