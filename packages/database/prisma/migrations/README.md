# Prisma migrations

Migration SQL is generated only after `prisma format` and `prisma validate` pass against the committed schema and PostgreSQL is available.

Planned sequence follows `docs/data/prisma-schema-and-migration-specification.md`:

1. `0001_extensions_and_identity`
2. `0002_vendor_store_membership_kyc`
3. `0003_catalog_categories_options_variants_media`
4. `0004_inventory_wishlist_cart`
5. `0005_orders_vendor_orders_items`
6. `0006_financial_rules_promotions_tax`
7. `0007_payments_provider_events_refunds`
8. `0008_logistics_shipments`
9. `0009_returns_and_reviews`
10. `0010_notifications_audit_outbox_idempotency`
11. `0011_partial_indexes_checks_and_search_support`

The raw checks/indexes in `../sql/required-constraints.sql` must be incorporated into reviewed migration SQL. Never substitute `prisma db push` for shared/staging/production migrations.
