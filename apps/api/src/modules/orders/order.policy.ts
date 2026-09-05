export interface CheckoutPolicyLine {
  readonly productId: string;
  readonly categoryId: string | null;
  readonly variantId: string;
  readonly quantity: number;
  readonly unitPriceAmountMinor: bigint;
}

export interface CheckoutStorePolicyInput {
  readonly vendorId: string;
  readonly storeId: string;
  readonly currency: string;
  readonly itemSubtotalAmountMinor: bigint;
  readonly lines: readonly CheckoutPolicyLine[];
}

export interface CheckoutStoreFinancialQuote {
  readonly discountAmountMinor: bigint;
  readonly deliveryAmountMinor: bigint;
  readonly taxAmountMinor: bigint;
  readonly commissionRateBps: number;
  readonly commissionAmountMinor: bigint;
}

export interface CheckoutFinancialPolicy {
  quoteStore(input: CheckoutStorePolicyInput): Promise<CheckoutStoreFinancialQuote>;
}

/**
 * P6 deliberately establishes the financial-policy seam without inventing
 * production commission, tax, or logistics rates. P7/P8/P10 replace these
 * zero-value hooks with configured commission, delivery, tax, and promotion
 * policies before production checkout is enabled.
 */
export class P6BaselineCheckoutFinancialPolicy implements CheckoutFinancialPolicy {
  async quoteStore(_input: CheckoutStorePolicyInput): Promise<CheckoutStoreFinancialQuote> {
    return {
      discountAmountMinor: 0n,
      deliveryAmountMinor: 0n,
      taxAmountMinor: 0n,
      commissionRateBps: 0,
      commissionAmountMinor: 0n,
    };
  }
}

export type VendorAcceptanceMode = "AUTO" | "MANUAL";

export interface VendorAcceptancePolicy {
  modeForStore(storeId: string): Promise<VendorAcceptanceMode>;
}

/**
 * Approved MVP behavior is automatic acceptance unless an explicit store rule
 * requires manual handling. No manual-processing rule is persisted yet, so P6
 * defaults to AUTO and preserves a replaceable policy boundary.
 */
export class DefaultVendorAcceptancePolicy implements VendorAcceptancePolicy {
  async modeForStore(_storeId: string): Promise<VendorAcceptanceMode> {
    return "AUTO";
  }
}
