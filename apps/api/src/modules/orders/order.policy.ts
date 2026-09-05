import type { DeliveryAddressSnapshotDto } from "@repo/contracts";

export interface CheckoutPolicyLine {
  readonly productId: string;
  readonly categoryId: string | null;
  readonly variantId: string;
  readonly quantity: number;
  readonly unitPriceAmountMinor: bigint;
}

export interface CheckoutStorePolicyInput {
  readonly userId: string;
  readonly cartId: string;
  readonly vendorId: string;
  readonly storeId: string;
  readonly currency: string;
  readonly deliveryAddress: DeliveryAddressSnapshotDto;
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

export class DefaultVendorAcceptancePolicy implements VendorAcceptancePolicy {
  async modeForStore(_storeId: string): Promise<VendorAcceptanceMode> {
    return "AUTO";
  }
}

export class P6PrePaymentVendorAcceptancePolicy implements VendorAcceptancePolicy {
  async modeForStore(_storeId: string): Promise<VendorAcceptanceMode> {
    return "MANUAL";
  }
}
