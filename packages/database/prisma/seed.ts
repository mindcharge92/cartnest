import { createDatabaseClient } from "../src/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) throw new Error("DATABASE_URL is required to seed CartNest.");
if (process.env.NODE_ENV === "production") throw new Error("The development seed must not run in production.");

const database = createDatabaseClient({ connectionString });

const categories = [
  { name: "Electronics", slug: "electronics", sortOrder: 10 },
  { name: "Fashion", slug: "fashion", sortOrder: 20 },
  { name: "Beauty", slug: "beauty", sortOrder: 30 },
  { name: "Home & Living", slug: "home-and-living", sortOrder: 40 },
  { name: "Groceries", slug: "groceries", sortOrder: 50 },
  { name: "Accessories", slug: "accessories", sortOrder: 60 },
] as const;

const stores = [
  { slug: "cartnest-select", name: "CartNest Select", vendor: "CartNest Select", description: "Thoughtfully selected technology, home and beauty essentials." },
  { slug: "urban-threads-lagos", name: "Urban Threads Lagos", vendor: "Urban Threads", description: "Contemporary fashion and accessories for everyday Nigerian style." },
] as const;

const products = [
  { store: "cartnest-select", category: "electronics", slug: "studio-pro-wireless-headphones", name: "Studio Pro Wireless Headphones", description: "Immersive over-ear headphones with rich sound, soft memory cushions and all-day battery life.", sku: "CNS-AUD-001", price: 6850000n, stock: 28, image: "images/products/studio-pro-headphones.png" },
  { store: "cartnest-select", category: "electronics", slug: "commuter-noise-cancelling-headphones", name: "Commuter Noise-Cancelling Headphones", description: "Comfortable wireless listening with active noise control for commutes, calls and focused work.", sku: "CNS-AUD-002", price: 5290000n, stock: 34, image: "images/products/commuter-headphones.png" },
  { store: "urban-threads-lagos", category: "fashion", slug: "everyday-court-sneakers", name: "Everyday Court Sneakers", description: "Clean, versatile low-top sneakers finished in warm white with a subtle green heel accent.", sku: "UTL-SHO-001", price: 4200000n, stock: 42, image: "images/products/everyday-sneakers.png" },
  { store: "urban-threads-lagos", category: "fashion", slug: "weekend-minimal-sneakers", name: "Weekend Minimal Sneakers", description: "Cushioned lifestyle sneakers designed for easy everyday outfits and long city walks.", sku: "UTL-SHO-002", price: 3850000n, stock: 31, image: "images/products/weekend-sneakers.png" },
  { store: "cartnest-select", category: "beauty", slug: "radiance-three-step-skincare-set", name: "Radiance Three-Step Skincare Set", description: "A gentle cleanser, hydrating serum and moisture cream curated for a simple daily ritual.", sku: "CNS-BEA-001", price: 2975000n, stock: 24, image: "images/products/radiance-skincare.png" },
  { store: "cartnest-select", category: "beauty", slug: "daily-glow-essentials", name: "Daily Glow Essentials", description: "A balanced trio for cleansing, replenishing moisture and supporting a healthy-looking glow.", sku: "CNS-BEA-002", price: 2490000n, stock: 38, image: "images/products/daily-glow.png" },
  { store: "urban-threads-lagos", category: "accessories", slug: "structured-city-tote", name: "Structured City Tote", description: "A spacious burnt-orange tote with a refined silhouette, sturdy handles and polished hardware.", sku: "UTL-BAG-001", price: 4650000n, stock: 18, image: "images/products/city-tote.png" },
  { store: "urban-threads-lagos", category: "accessories", slug: "workday-leather-tote", name: "Workday Leather Tote", description: "A polished everyday bag sized for work, errands and everything between.", sku: "UTL-BAG-002", price: 5200000n, stock: 15, image: "images/products/workday-tote.png" },
] as const;

try {
  const user = await database.user.findFirst({ orderBy: { createdAt: "desc" } });
  if (!user) throw new Error("Create a local CartNest account before running the development seed.");

  const categoryIds = new Map<string, string>();
  for (const category of categories) {
    const saved = await database.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: category.sortOrder, status: "ACTIVE" },
      create: { ...category, status: "ACTIVE" },
    });
    categoryIds.set(saved.slug, saved.id);
  }

  const storeIds = new Map<string, string>();
  for (const seedStore of stores) {
    const existing = await database.store.findUnique({ where: { slug: seedStore.slug } });
    const vendor = existing
      ? await database.vendor.update({ where: { id: existing.vendorId }, data: { displayName: seedStore.vendor, status: "APPROVED", approvedAt: new Date() } })
      : await database.vendor.create({ data: { displayName: seedStore.vendor, legalName: `${seedStore.vendor} Limited`, status: "APPROVED", approvedAt: new Date() } });

    await database.vendorMember.upsert({
      where: { vendorId_userId: { vendorId: vendor.id, userId: user.id } },
      update: { role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
      create: { vendorId: vendor.id, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    });

    const store = await database.store.upsert({
      where: { slug: seedStore.slug },
      update: { name: seedStore.name, description: seedStore.description, status: "ACTIVE" },
      create: { vendorId: vendor.id, name: seedStore.name, slug: seedStore.slug, description: seedStore.description, status: "ACTIVE" },
    });
    storeIds.set(store.slug, store.id);
  }

  for (const seedProduct of products) {
    const storeId = storeIds.get(seedProduct.store)!;
    const product = await database.product.upsert({
      where: { storeId_slug: { storeId, slug: seedProduct.slug } },
      update: { name: seedProduct.name, description: seedProduct.description, categoryId: categoryIds.get(seedProduct.category), status: "ACTIVE", moderationStatus: "APPROVED", archivedAt: null },
      create: { storeId, categoryId: categoryIds.get(seedProduct.category), name: seedProduct.name, slug: seedProduct.slug, description: seedProduct.description, status: "ACTIVE", moderationStatus: "APPROVED" },
    });

    const variant = await database.productVariant.upsert({
      where: { storeId_sku: { storeId, sku: seedProduct.sku } },
      update: { productId: product.id, priceAmountMinor: seedProduct.price, currency: "NGN", status: "ACTIVE" },
      create: { productId: product.id, storeId, sku: seedProduct.sku, priceAmountMinor: seedProduct.price, currency: "NGN", status: "ACTIVE" },
    });
    await database.inventoryItem.upsert({
      where: { variantId: variant.id },
      update: { onHand: seedProduct.stock, reserved: 0 },
      create: { variantId: variant.id, onHand: seedProduct.stock, reserved: 0 },
    });
    await database.media.upsert({
      where: { objectKey: seedProduct.image },
      update: { productId: product.id, storeId: null, altText: seedProduct.name, status: "ACTIVE", deletedAt: null },
      create: { productId: product.id, objectKey: seedProduct.image, bucket: "cartnest-development-assets", mimeType: "image/png", sizeBytes: 1500000n, width: 1254, height: 1254, originalFilename: seedProduct.image.split("/").at(-1), altText: seedProduct.name, status: "ACTIVE", createdBy: user.id },
    });
  }

  console.info(`Seeded ${products.length} products across ${stores.length} stores for ${user.email ?? user.phone ?? user.id}.`);
} finally {
  await database.$disconnect();
}
