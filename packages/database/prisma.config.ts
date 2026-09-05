import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code !== "ENOENT") throw error;
}

const localDatabaseUrl =
  "postgresql://cartnest:cartnest_dev_only@127.0.0.1:5432/cartnest";

const databaseUrl = process.env.DATABASE_URL ?? localDatabaseUrl;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
    ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
  },
});
