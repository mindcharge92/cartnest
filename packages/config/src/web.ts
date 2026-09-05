import { readUrl } from "./shared.js";

export interface WebEnvironment {
  readonly publicApiBaseUrl: string;
}

export function getWebEnvironment(source: NodeJS.ProcessEnv = process.env): WebEnvironment {
  return Object.freeze({
    publicApiBaseUrl:
      readUrl(source, "NEXT_PUBLIC_API_BASE_URL", "http://localhost:4000") ??
      "http://localhost:4000",
  });
}
