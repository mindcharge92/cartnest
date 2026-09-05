-- CartNest PostgreSQL constraints/indexes that are intentionally stronger than
-- what is expressed in the Prisma schema. These statements are reviewed source
-- material for the generated migration; do not execute this file independently
-- in production without migration review.

ALTER TABLE "Media"
  ADD CONSTRAINT "Media_exactly_one_owner"
  CHECK (
    ("productId" IS NOT NULL AND "storeId" IS NULL)
    OR ("productId" IS NULL AND "storeId" IS NOT NULL)
  );

ALTER TABLE "InventoryItem"
  ADD CONSTRAINT "InventoryItem_onHand_nonnegative" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "InventoryItem_reserved_nonnegative" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "InventoryItem_reserved_lte_onHand" CHECK ("reserved" <= "onHand"),
  ADD CONSTRAINT "InventoryItem_version_nonnegative" CHECK ("version" >= 0);

ALTER TABLE "InventoryAdjustment"
  ADD CONSTRAINT "InventoryAdjustment_delta_nonzero" CHECK ("delta" <> 0);

CREATE UNIQUE INDEX "Cart_one_active_per_user"
  ON "Cart" ("userId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "CommissionRule"
  ADD CONSTRAINT "CommissionRule_rateBps_range" CHECK ("rateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "CommissionRule_valid_period" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "TaxRate"
  ADD CONSTRAINT "TaxRate_rateBps_range" CHECK ("rateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "TaxRate_valid_period" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "Promotion"
  ADD CONSTRAINT "Promotion_percentage_value_range"
  CHECK ("type" <> 'PERCENTAGE' OR "value" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "Promotion_valid_period" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "InventoryReservation_expiry_after_create" CHECK ("expiresAt" > "createdAt");

CREATE UNIQUE INDEX "InventoryReservation_one_held_per_order_variant"
  ON "InventoryReservation" ("orderId", "variantId")
  WHERE "status" = 'HELD' AND "orderId" IS NOT NULL;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_itemSubtotal_nonnegative" CHECK ("itemSubtotalAmountMinor" >= 0),
  ADD CONSTRAINT "Order_discount_nonnegative" CHECK ("discountAmountMinor" >= 0),
  ADD CONSTRAINT "Order_delivery_nonnegative" CHECK ("deliveryAmountMinor" >= 0),
  ADD CONSTRAINT "Order_tax_nonnegative" CHECK ("taxAmountMinor" >= 0),
  ADD CONSTRAINT "Order_grandTotal_nonnegative" CHECK ("grandTotalAmountMinor" >= 0),
  ADD CONSTRAINT "Order_total_arithmetic"
    CHECK (
      "grandTotalAmountMinor" =
      "itemSubtotalAmountMinor" - "discountAmountMinor" + "deliveryAmountMinor" + "taxAmountMinor"
    );

CREATE UNIQUE INDEX "VendorOrder_one_per_order_store"
  ON "VendorOrder" ("orderId", "storeId");

ALTER TABLE "VendorOrder"
  ADD CONSTRAINT "VendorOrder_itemSubtotal_nonnegative" CHECK ("itemSubtotalAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_discount_nonnegative" CHECK ("discountAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_delivery_nonnegative" CHECK ("deliveryAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_tax_nonnegative" CHECK ("taxAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_commission_rate_range" CHECK ("commissionRateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "VendorOrder_commission_nonnegative" CHECK ("commissionAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_gateway_fee_nonnegative" CHECK ("gatewayFeeAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_total_nonnegative" CHECK ("totalAmountMinor" >= 0),
  ADD CONSTRAINT "VendorOrder_total_arithmetic"
    CHECK (
      "totalAmountMinor" =
      "itemSubtotalAmountMinor" - "discountAmountMinor" + "deliveryAmountMinor" + "taxAmountMinor"
    );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "OrderItem_unit_price_nonnegative" CHECK ("unitPriceAmountMinor" >= 0),
  ADD CONSTRAINT "OrderItem_subtotal_nonnegative" CHECK ("subtotalAmountMinor" >= 0),
  ADD CONSTRAINT "OrderItem_discount_nonnegative" CHECK ("discountAmountMinor" >= 0),
  ADD CONSTRAINT "OrderItem_tax_nonnegative" CHECK ("taxAmountMinor" >= 0),
  ADD CONSTRAINT "OrderItem_line_total_nonnegative" CHECK ("lineTotalAmountMinor" >= 0),
  ADD CONSTRAINT "OrderItem_subtotal_arithmetic"
    CHECK ("subtotalAmountMinor" = "unitPriceAmountMinor" * "quantity"),
  ADD CONSTRAINT "OrderItem_line_total_arithmetic"
    CHECK (
      "lineTotalAmountMinor" = "subtotalAmountMinor" - "discountAmountMinor" + "taxAmountMinor"
    );

ALTER TABLE "PaymentIntent"
  ADD CONSTRAINT "PaymentIntent_amount_nonnegative" CHECK ("amountMinor" >= 0);

ALTER TABLE "ReturnItem"
  ADD CONSTRAINT "ReturnItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "ProductReview"
  ADD CONSTRAINT "ProductReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "StoreReview"
  ADD CONSTRAINT "StoreReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

CREATE UNIQUE INDEX "WishlistItem_product_without_variant_unique"
  ON "WishlistItem" ("wishlistId", "productId")
  WHERE "variantId" IS NULL;

-- P4 catalog indexes. The public catalog always filters on active products with
-- publishable moderation states, and text search uses case-insensitive contains.
CREATE INDEX "Product_public_catalog_created_idx"
  ON "Product" ("createdAt" DESC)
  WHERE "status" = 'ACTIVE'
    AND "moderationStatus" IN ('NOT_REQUIRED', 'APPROVED');

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Product_description_trgm_idx"
  ON "Product" USING GIN ("description" gin_trgm_ops);
