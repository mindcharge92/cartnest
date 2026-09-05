import { createDatabaseClient } from "../src/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed CartNest.");
}

if (process.env.NODE_ENV === "production") {
  throw new Error("The development seed must not run in production.");
}

const database = createDatabaseClient({ connectionString });

const categories = [
  { name: "Electronics", slug: "electronics", sortOrder: 10 },
  { name: "Fashion", slug: "fashion", sortOrder: 20 },
  { name: "Home & Living", slug: "home-and-living", sortOrder: 30 },
] as const;

try {
  for (const category of categories) {
    await database.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: category.sortOrder },
      create: category,
    });
  }
} finally {
  await database.$disconnect();
}
