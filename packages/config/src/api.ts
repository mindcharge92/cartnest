import {
  readBoolean,
  readCsv,
  readPort,
  readRuntimeEnvironment,
  readString,
  readUrl,
} from "./shared.js";

export interface ApiEnvironment {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly databaseUrl: string | undefined;
  readonly redisUrl: string | undefined;
  readonly webBaseUrl: string;
  readonly apiPublicBaseUrl: string;
  readonly corsOrigins: readonly string[];
  readonly authJwtSecret: string;
  readonly mfaEncryptionKey: string;
  readonly cookieSecure: boolean;
  readonly googleClientId: string | undefined;
  readonly googleClientSecret: string | undefined;
  readonly googleRedirectUri: string;
  readonly exposeDevelopmentAuthTokens: boolean;
}

function requiredSecret(
  source: NodeJS.ProcessEnv,
  key: string,
  nodeEnv: ApiEnvironment["nodeEnv"],
  developmentFallback: string,
): string {
  const value = readString(source, key, nodeEnv === "production" ? undefined : developmentFallback);
  if (!value || value.length < 32) {
    throw new Error(`${key} must contain at least 32 characters.`);
  }
  return value;
}

export function getApiEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  const nodeEnv = readRuntimeEnvironment(source);
  const webBaseUrl = readUrl(source, "WEB_BASE_URL", "http://localhost:3000") ?? "http://localhost:3000/";
  const apiPublicBaseUrl = readUrl(source, "API_PUBLIC_BASE_URL", "http://localhost:4000") ?? "http://localhost:4000/";
  const googleRedirectUri =
    readUrl(source, "GOOGLE_REDIRECT_URI") ??
    new URL("/api/v1/auth/google/callback", apiPublicBaseUrl).toString();
  const corsOrigins = readCsv(source, "CORS_ORIGINS", [new URL(webBaseUrl).origin]).map(
    (origin) => new URL(origin).origin,
  );

  return Object.freeze({
    nodeEnv,
    host: readString(source, "HOST", "0.0.0.0") ?? "0.0.0.0",
    port: readPort(source, "PORT", 4000),
    databaseUrl: readUrl(source, "DATABASE_URL"),
    redisUrl: readUrl(source, "REDIS_URL"),
    webBaseUrl,
    apiPublicBaseUrl,
    corsOrigins,
    authJwtSecret: requiredSecret(
      source,
      "AUTH_JWT_SECRET",
      nodeEnv,
      "cartnest-development-auth-jwt-secret-change-before-production",
    ),
    mfaEncryptionKey: requiredSecret(
      source,
      "MFA_ENCRYPTION_KEY",
      nodeEnv,
      "cartnest-development-mfa-encryption-key-change-before-production",
    ),
    cookieSecure: readBoolean(source, "AUTH_COOKIE_SECURE", nodeEnv === "production"),
    googleClientId: readString(source, "GOOGLE_CLIENT_ID"),
    googleClientSecret: readString(source, "GOOGLE_CLIENT_SECRET"),
    googleRedirectUri,
    exposeDevelopmentAuthTokens: readBoolean(source, "AUTH_EXPOSE_DEVELOPMENT_TOKENS", false),
  });
}
