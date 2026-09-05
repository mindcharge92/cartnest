import type { DatabaseClient } from "./client.js";

export async function isDatabaseReady(client: DatabaseClient): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
