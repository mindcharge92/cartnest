import type { Prisma } from "./generated/prisma/client.js";
import type { DatabaseClient } from "./client.js";

export type DatabaseTransaction = Prisma.TransactionClient;

export async function withTransaction<T>(
  client: DatabaseClient,
  work: (transaction: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return client.$transaction(async (transaction) => work(transaction));
}
