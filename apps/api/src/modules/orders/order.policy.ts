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
 * This is the post-payment MVP default defined by ADR-006. P7 should evaluate
 * this policy after a payment is verified and then transition eligible vendor
 * orders from PENDING to ACCEPTED.
 */
export class DefaultVendorAcceptancePolicy implements VendorAcceptancePolicy {
  async modeForStore(_storeId: string): Promise<VendorAcceptanceMode> {
    return "AUTO";
  }
}

/**
 * Checkout itself must not enter fulfillment before payment succeeds. P6 uses
 * this gate so every newly created VendorOrder remains PENDING. P7 replaces
 * this pre-payment gate with post-payment acceptance processing.
 */
export class P6PrePaymentVendorAcceptancePolicy implements VendorAcceptancePolicy {
  async modeForStore(_storeId: string): Promise<VendorAcceptanceMode> {
    return "MANUAL";
  }
}
