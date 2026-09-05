import type { ApiErrorDto } from "@repo/contracts";

export interface ContractRequestOptions extends Omit<RequestInit, "body"> {
  readonly body?: unknown;
}

export interface ContractRequestClient {
  request<TResponse>(path: string, options?: ContractRequestOptions): Promise<TResponse>;
}

export interface ContractRequestClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class CartNestApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | undefined;
  readonly details: unknown;

  constructor(status: number, payload: ApiErrorDto | undefined, fallbackMessage: string) {
    super(payload?.error.message ?? fallbackMessage);
    this.name = "CartNestApiError";
    this.status = status;
    this.code = payload?.error.code ?? `HTTP_${status}`;
    this.requestId = payload?.error.requestId;
    this.details = payload?.error.details;
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorDto {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; requestId?: unknown };
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.requestId === "string"
  );
}

export function createContractRequestClient(options: ContractRequestClientOptions): ContractRequestClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    async request<TResponse>(path: string, requestOptions: ContractRequestOptions = {}): Promise<TResponse> {
      const { body, headers: inputHeaders, ...rest } = requestOptions;
      const headers = new Headers(inputHeaders);
      let encodedBody: BodyInit | undefined;

      if (body !== undefined) {
        if (!headers.has("content-type")) headers.set("content-type", "application/json");
        encodedBody = JSON.stringify(body);
      }

      const normalizedPath = path.startsWith("/") ? path : `/${path}`;
      const response = await fetchImpl(`${baseUrl}${normalizedPath}`, {
        ...rest,
        headers,
        ...(encodedBody !== undefined ? { body: encodedBody } : {}),
        credentials: rest.credentials ?? "include",
      });

      const contentType = response.headers.get("content-type") ?? "";
      let payload: unknown;
      if (response.status !== 204) {
        payload = contentType.includes("application/json")
          ? await response.json().catch(() => undefined)
          : await response.text().catch(() => undefined);
      }

      if (!response.ok) {
        throw new CartNestApiError(
          response.status,
          isApiErrorPayload(payload) ? payload : undefined,
          `CartNest API request failed (${response.status}).`,
        );
      }

      return payload as TResponse;
    },
  };
}
