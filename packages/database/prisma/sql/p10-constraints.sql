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
