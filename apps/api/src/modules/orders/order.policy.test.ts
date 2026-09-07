import { describe, expect, it } from "vitest";
import {
  DefaultVendorAcceptancePolicy,
  P6BaselineCheckoutFinancialPolicy,
  P6PrePaymentVendorAcceptancePolicy,
} from "./order.policy.js";

describe("P6 checkout policies", () => {
  it("keeps financial placeholders neutral until configured policies are implemented", async () => {
    const quote = await new P6BaselineCheckoutFinancialPolicy().quoteStore({
      userId: "user",
      cartId: "cart",
      vendorId: "vendor",
      storeId: "store",
      currency: "NGN",
      deliveryAddress: {
        recipientName: "Daniel Praise",
        phone: "+2348000000000",
        line1: "1 Test Street",
        city: "Lagos",
        state: "Lagos",
        countryCode: "NG",
      },
      itemSubtotalAmountMinor: 100000n,
      lines: [],
    });

    expect(quote).toEqual({
      discountAmountMinor: 0n,
      deliveryAmountMinor: 0n,
      taxAmountMinor: 0n,
      commissionRateBps: 0,
      commissionAmountMinor: 0n,
    });
  });

  it("keeps new vendor orders pending before payment but defaults to auto acceptance after payment", async () => {
    expect(await new P6PrePaymentVendorAcceptancePolicy().modeForStore("store")).toBe("MANUAL");
    expect(await new DefaultVendorAcceptancePolicy().modeForStore("store")).toBe("AUTO");
  });
});
