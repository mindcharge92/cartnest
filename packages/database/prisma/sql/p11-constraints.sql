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
