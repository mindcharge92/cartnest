import { readRuntimeEnvironment, readUrl } from "./shared.js";

export interface WorkerEnvironment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly redisUrl: string;
}

export function getWorkerEnvironment(source: NodeJS.ProcessEnv = process.env): WorkerEnvironment {
  return Object.freeze({
    nodeEnv: readRuntimeEnvironment(source),
    redisUrl: readUrl(source, "REDIS_URL", "redis://127.0.0.1:6379") ?? "redis://127.0.0.1:6379",
  });
}
