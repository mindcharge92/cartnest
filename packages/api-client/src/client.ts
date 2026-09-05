import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./generated/schema.js";

export interface CartNestApiClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly middleware?: readonly Middleware[];
}

export function createCartNestApiClient(options: CartNestApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    credentials: "include",
  });

  for (const middleware of options.middleware ?? []) {
    client.use(middleware);
  }

  return client;
}

export type CartNestApiClient = ReturnType<typeof createCartNestApiClient>;
