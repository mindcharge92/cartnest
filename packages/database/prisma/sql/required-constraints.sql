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
  ADD CONSTRAINT "InventoryItem_reserved_lte_onHand" CHECK ("reserved" <= "onHand");

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
  ADD CONSTRAINT "InventoryReservation_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);

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
