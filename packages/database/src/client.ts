import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type DatabaseClient = PrismaClient;

export interface DatabaseClientOptions {
  readonly connectionString: string;
}

export function createDatabaseClient(options: DatabaseClientOptions): DatabaseClient {
  const adapter = new PrismaPg({ connectionString: options.connectionString });
  return new PrismaClient({ adapter });
}
