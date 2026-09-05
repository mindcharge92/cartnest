import { readPort, readRuntimeEnvironment, readString, readUrl } from "./shared.js";

export interface ApiEnvironment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string | undefined;
  readonly redisUrl: string | undefined;
}

export function getApiEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  return Object.freeze({
    nodeEnv: readRuntimeEnvironment(source),
    host: readString(source, "HOST", "0.0.0.0") ?? "0.0.0.0",
    port: readPort(source, "PORT", 4000),
    databaseUrl: readUrl(source, "DATABASE_URL"),
    redisUrl: readUrl(source, "REDIS_URL"),
  });
}
