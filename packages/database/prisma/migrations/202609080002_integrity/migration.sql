BEGIN;
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

CREATE UNIQUE INDEX "InventoryAdjustment_return_restock_once"
  ON "InventoryAdjustment" ("referenceType", "referenceId")
  WHERE "referenceType" = 'RETURN_RESTOCK' AND "referenceId" IS NOT NULL;

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
    CHECK ("type" <> 'PERCENTAGE' OR "value" BETWEEN 1 AND 10000),
  ADD CONSTRAINT "Promotion_fixed_value_positive"
    CHECK ("type" <> 'FIXED_AMOUNT' OR "value" > 0),
  ADD CONSTRAINT "Promotion_min_order_nonnegative"
    CHECK ("minOrderAmountMinor" IS NULL OR "minOrderAmountMinor" >= 0),
  ADD CONSTRAINT "Promotion_max_redemptions_positive"
    CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0),
  ADD CONSTRAINT "Promotion_per_user_limit_positive"
    CHECK ("perUserLimit" IS NULL OR "perUserLimit" > 0),
  ADD CONSTRAINT "Promotion_valid_period" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");

ALTER TABLE "PromotionRedemption"
  ADD CONSTRAINT "PromotionRedemption_amount_positive" CHECK ("amountMinor" > 0);

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

ALTER TABLE "PaymentAttempt"
  ADD CONSTRAINT "PaymentAttempt_amount_nonnegative" CHECK ("amountMinor" >= 0);

-- Payment/cancellation interlock.
-- Payment-attempt creation and cancellation both serialize on the parent Order row.
-- This prevents a cancellation/expiry transaction from releasing inventory while a
-- provider request is being created, and prevents a stale payment amount from being
-- charged after a partial vendor-order cancellation changes the parent total.
CREATE OR REPLACE FUNCTION "CartNest_guard_payment_attempt_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_order_id uuid;
  parent_status text;
  parent_payment_status text;
  intent_status text;
  intent_amount bigint;
  intent_currency text;
BEGIN
  SELECT "orderId"
  INTO parent_order_id
  FROM "PaymentIntent"
  WHERE "id" = NEW."paymentIntentId";

  IF parent_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1 FROM "Order" WHERE "id" = parent_order_id FOR UPDATE;

  SELECT
    o."status"::text,
    o."paymentStatus"::text,
    p."status"::text,
    p."amountMinor",
    p."currency"::text
  INTO
    parent_status,
    parent_payment_status,
    intent_status,
    intent_amount,
    intent_currency
  FROM "PaymentIntent" p
  JOIN "Order" o ON o."id" = p."orderId"
  WHERE p."id" = NEW."paymentIntentId";

  IF parent_status NOT IN ('PENDING_PAYMENT', 'PARTIALLY_CANCELLED')
     OR parent_payment_status <> 'PENDING'
     OR intent_status NOT IN ('PENDING', 'FAILED') THEN
    RAISE EXCEPTION 'ORDER_PAYMENT_STATE_CHANGED';
  END IF;

  IF NEW."amountMinor" <> intent_amount OR NEW."currency"::text <> intent_currency THEN
    RAISE EXCEPTION 'ORDER_PAYMENT_AMOUNT_CHANGED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PaymentAttempt" pa
    WHERE pa."paymentIntentId" = NEW."paymentIntentId"
      AND pa."status" IN ('PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED')
  ) THEN
    RAISE EXCEPTION 'ORDER_PAYMENT_ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "VendorOrder" vo
    WHERE vo."orderId" = parent_order_id
      AND vo."status" <> 'CANCELLED'
  ) OR EXISTS (
    SELECT 1
    FROM (
      SELECT oi."variantId", SUM(oi."quantity")::integer AS expected_quantity
      FROM "VendorOrder" vo
      JOIN "OrderItem" oi ON oi."vendorOrderId" = vo."id"
      WHERE vo."orderId" = parent_order_id
        AND vo."status" <> 'CANCELLED'
      GROUP BY oi."variantId"
    ) expected
    LEFT JOIN "InventoryReservation" r
      ON r."orderId" = parent_order_id
     AND r."variantId" = expected."variantId"
     AND r."status" = 'HELD'
    WHERE r."id" IS NULL
       OR r."quantity" <> expected.expected_quantity
       OR r."expiresAt" <= clock_timestamp()
  ) THEN
    RAISE EXCEPTION 'PAYMENT_RESERVATION_EXPIRED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PaymentAttempt_guard_payable_order"
BEFORE INSERT ON "PaymentAttempt"
FOR EACH ROW
EXECUTE FUNCTION "CartNest_guard_payment_attempt_insert"();

CREATE OR REPLACE FUNCTION "CartNest_guard_vendor_order_cancellation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'CANCELLED' AND OLD."status" <> 'CANCELLED' THEN
    PERFORM 1 FROM "Order" WHERE "id" = NEW."orderId" FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM "PaymentIntent" p
      JOIN "PaymentAttempt" pa ON pa."paymentIntentId" = p."id"
      WHERE p."orderId" = NEW."orderId"
        AND pa."status" IN ('PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED')
    ) THEN
      RAISE EXCEPTION 'ORDER_PAYMENT_ACTIVE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "VendorOrder_guard_active_payment_cancellation"
BEFORE UPDATE OF "status" ON "VendorOrder"
FOR EACH ROW
EXECUTE FUNCTION "CartNest_guard_vendor_order_cancellation"();

CREATE OR REPLACE FUNCTION "CartNest_guard_order_cancellation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'CANCELLED' AND OLD."status" <> 'CANCELLED' THEN
    IF EXISTS (
      SELECT 1
      FROM "PaymentIntent" p
      JOIN "PaymentAttempt" pa ON pa."paymentIntentId" = p."id"
      WHERE p."orderId" = NEW."id"
        AND pa."status" IN ('PENDING', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED')
    ) THEN
      RAISE EXCEPTION 'ORDER_PAYMENT_ACTIVE';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Order_guard_active_payment_cancellation"
BEFORE UPDATE OF "status" ON "Order"
FOR EACH ROW
EXECUTE FUNCTION "CartNest_guard_order_cancellation"();

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_amount_nonnegative" CHECK ("amountMinor" >= 0);

CREATE UNIQUE INDEX "ProviderEvent_provider_fingerprint_fallback_unique"
  ON "ProviderEvent" ("provider", "fingerprint")
  WHERE "externalEventId" IS NULL AND "fingerprint" IS NOT NULL;

-- P8 logistics constraints.
ALTER TABLE "StoreFulfillmentProfile"
  ADD CONSTRAINT "StoreFulfillmentProfile_store_fk"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "StoreFulfillmentProfile_manual_fee_nonnegative"
    CHECK ("manualDeliveryFeeAmountMinor" IS NULL OR "manualDeliveryFeeAmountMinor" >= 0),
  ADD CONSTRAINT "StoreFulfillmentProfile_gigl_station_required"
    CHECK ("defaultProvider" <> 'GIGL' OR "giglStationId" IS NOT NULL);

ALTER TABLE "VariantShippingProfile"
  ADD CONSTRAINT "VariantShippingProfile_variant_fk"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "VariantShippingProfile_weight_positive" CHECK ("weightGrams" > 0),
  ADD CONSTRAINT "VariantShippingProfile_pieces_positive" CHECK ("pieces" > 0),
  ADD CONSTRAINT "VariantShippingProfile_dimensions_positive"
    CHECK (
      ("lengthMm" IS NULL OR "lengthMm" > 0)
      AND ("widthMm" IS NULL OR "widthMm" > 0)
      AND ("heightMm" IS NULL OR "heightMm" > 0)
    );

ALTER TABLE "ShippingQuote"
  ADD CONSTRAINT "ShippingQuote_user_fk"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ShippingQuote_cart_fk"
    FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ShippingQuote_store_fk"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ShippingQuote_amount_nonnegative" CHECK ("amountMinor" >= 0),
  ADD CONSTRAINT "ShippingQuote_expiry_after_create" CHECK ("expiresAt" > "createdAt");

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_fee_nonnegative"
    CHECK ("feeAmountMinor" IS NULL OR "feeAmountMinor" >= 0),
  ADD CONSTRAINT "Shipment_delivered_timestamp_consistency"
    CHECK ("status" <> 'DELIVERED' OR "deliveredAt" IS NOT NULL);

ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_shipment_fk"
    FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ShipmentItem_order_item_fk"
    FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ShipmentItem_quantity_positive" CHECK ("quantity" > 0);

-- Cumulative ShipmentItem quantity is a cross-row invariant and cannot be
-- expressed as a CHECK constraint. Serialize allocations on VendorOrder so two
-- concurrent shipment requests cannot both consume the same final units.
CREATE OR REPLACE FUNCTION "CartNest_guard_shipment_item_allocation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_vendor_order_id uuid;
  ordered_quantity integer;
  already_allocated integer;
BEGIN
  SELECT s."vendorOrderId"
  INTO parent_vendor_order_id
  FROM "Shipment" s
  WHERE s."id" = NEW."shipmentId";

  IF parent_vendor_order_id IS NULL THEN
    RAISE EXCEPTION 'VENDOR_ORDER_NOT_FOUND';
  END IF;

  PERFORM 1 FROM "VendorOrder" WHERE "id" = parent_vendor_order_id FOR UPDATE;

  SELECT oi."quantity"
  INTO ordered_quantity
  FROM "OrderItem" oi
  WHERE oi."id" = NEW."orderItemId"
    AND oi."vendorOrderId" = parent_vendor_order_id;

  IF ordered_quantity IS NULL THEN
    RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND';
  END IF;

  SELECT COALESCE(SUM(si."quantity"), 0)::integer
  INTO already_allocated
  FROM "ShipmentItem" si
  JOIN "Shipment" s ON s."id" = si."shipmentId"
  WHERE s."vendorOrderId" = parent_vendor_order_id
    AND s."status" <> 'CANCELLED'
    AND si."orderItemId" = NEW."orderItemId";

  IF already_allocated + NEW."quantity" > ordered_quantity THEN
    RAISE EXCEPTION 'SHIPMENT_QUANTITY_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ShipmentItem_guard_order_quantity"
BEFORE INSERT ON "ShipmentItem"
FOR EACH ROW
EXECUTE FUNCTION "CartNest_guard_shipment_item_allocation"();

-- P9 returns/refunds/reviews constraints.
ALTER TABLE "ReturnItem"
  ADD CONSTRAINT "ReturnItem_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "ReturnRequest"
  ADD CONSTRAINT "ReturnRequest_approved_timestamp_consistency"
    CHECK ("approvedAt" IS NULL OR "approvedAt" >= "requestedAt"),
  ADD CONSTRAINT "ReturnRequest_received_timestamp_consistency"
    CHECK ("receivedAt" IS NULL OR "receivedAt" >= "requestedAt"),
  ADD CONSTRAINT "ReturnRequest_completed_timestamp_consistency"
    CHECK ("completedAt" IS NULL OR "completedAt" >= "requestedAt");

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountMinor" > 0),
  ADD CONSTRAINT "Refund_completed_timestamp_consistency"
    CHECK ("completedAt" IS NULL OR "completedAt" >= "createdAt");

CREATE INDEX "Refund_processing_reconciliation_idx"
  ON "Refund" ("updatedAt")
  WHERE "status" = 'PROCESSING';

ALTER TABLE "ProductReview"
  ADD CONSTRAINT "ProductReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "StoreReview"
  ADD CONSTRAINT "StoreReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- P10 notification preference/read-state relations.
ALTER TABLE "NotificationReceipt"
  ADD CONSTRAINT "NotificationReceipt_notification_fk"
    FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "NotificationReceipt_user_fk"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "NotificationPreference"
  ADD CONSTRAINT "NotificationPreference_user_fk"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

CREATE INDEX "Notification_in_app_user_created_idx"
  ON "Notification" ("userId", "createdAt" DESC)
  WHERE "channel" = 'IN_APP';

CREATE UNIQUE INDEX "WishlistItem_product_without_variant_unique"
  ON "WishlistItem" ("wishlistId", "productId")
  WHERE "variantId" IS NULL;

-- P4 catalog indexes.
CREATE INDEX "Product_public_catalog_created_idx"
  ON "Product" ("createdAt" DESC)
  WHERE "status" = 'ACTIVE'
    AND "moderationStatus" IN ('NOT_REQUIRED', 'APPROVED');

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Product_description_trgm_idx"
  ON "Product" USING GIN ("description" gin_trgm_ops);
-- P10 financial/notification constraints to fold into the reviewed Prisma
-- migration. Do not execute independently in production without migration
-- review.

-- CartNest currently supports one active platform-wide VAT/tax policy at a
-- time. The application updates old rows transactionally, while this partial
-- unique index prevents concurrent admin requests from leaving two active
-- policies behind.
CREATE UNIQUE INDEX "TaxRate_one_active_platform_policy"
  ON "TaxRate" ((1))
  WHERE "active" = true;

-- P11 privacy workflow and performance indexes.

ALTER TABLE "PrivacyRequest"
  ADD CONSTRAINT "PrivacyRequest_user_fk"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "PrivacyRequest_processed_by_fk"
    FOREIGN KEY ("processedBy") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "PrivacyRequest_one_active_per_user"
  ON "PrivacyRequest" ("userId")
  WHERE "status" IN ('PENDING', 'REQUIRES_REVIEW');

-- Analytics/read-path indexes identified during the P11 query review.
CREATE INDEX "Order_created_at_idx"
  ON "Order" ("createdAt" DESC);

CREATE INDEX "VendorOrder_store_created_at_idx"
  ON "VendorOrder" ("storeId", "createdAt" DESC);

CREATE INDEX "Refund_created_at_idx"
  ON "Refund" ("createdAt" DESC);

CREATE INDEX "PaymentIntent_status_created_at_idx"
  ON "PaymentIntent" ("status", "createdAt" DESC);

COMMIT;
