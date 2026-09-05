import { createCartNestApiClient } from "@repo/api-client";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export function readCsrfCookie(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const prefix = "cartnest_csrf=";
  const item = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}

const browserFetch: typeof globalThis.fetch = async (input, init) => {
  const sourceRequest = input instanceof Request ? input : undefined;
  const method = (init?.method ?? sourceRequest?.method ?? "GET").toUpperCase();
  const headers = new Headers(sourceRequest?.headers);
  if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  if (!new Set(["GET", "HEAD", "OPTIONS"]).has(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers.set("x-csrf-token", csrf);
  }
  return globalThis.fetch(input, { ...init, headers, credentials: "include" });
};

export const api = createCartNestApiClient({ baseUrl: API_BASE_URL, fetch: browserFetch });

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "error" in error) {
    const envelope = (error as { error?: { message?: unknown } }).error;
    if (envelope && typeof envelope.message === "string") return envelope.message;
  }
  return fallback;
}
