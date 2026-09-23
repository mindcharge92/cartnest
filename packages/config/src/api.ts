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
  readonly vendorRequireVerifiedIdentifier: boolean;
  readonly r2AccountId: string | undefined;
  readonly r2AccessKeyId: string | undefined;
  readonly r2SecretAccessKey: string | undefined;
  readonly r2Bucket: string | undefined;
  readonly r2PublicBaseUrl: string | undefined;
  readonly paystackSecretKey: string | undefined;
  readonly paystackBaseUrl: string;
  readonly flutterwaveSecretKey: string | undefined;
  readonly flutterwaveSecretHash: string | undefined;
  readonly flutterwaveBaseUrl: string;
  readonly paymentCallbackUrl: string;
  readonly paymentCollectionSplitsEnabled: boolean;
  readonly giglAccessToken: string | undefined;
  readonly giglCustomerCode: string | undefined;
  readonly giglBaseUrl: string;
  readonly resendApiKey: string | undefined;
  readonly emailFrom: string | undefined;
  readonly backgroundTasksEnabled: boolean;
}

function requiredSecret(
  source: NodeJS.ProcessEnv,
  key: string,
  nodeEnv: ApiEnvironment["nodeEnv"],
  developmentFallback: string,
): string {
  const value = readString(source, key, nodeEnv === "production" ? undefined : developmentFallback);
  if (!value || value.length < 32) throw new Error(`${key} must contain at least 32 characters.`);
  return value;
}

export function getApiEnvironment(source: NodeJS.ProcessEnv = process.env): ApiEnvironment {
  const nodeEnv = readRuntimeEnvironment(source);
  const webBaseUrl = readUrl(source, "WEB_BASE_URL", "http://localhost:3000") ?? "http://localhost:3000/";
  const apiPublicBaseUrl = readUrl(source, "API_PUBLIC_BASE_URL", "http://localhost:4000") ?? "http://localhost:4000/";
  const googleRedirectUri = readUrl(source, "GOOGLE_REDIRECT_URI") ?? new URL("/api/v1/auth/google/callback", apiPublicBaseUrl).toString();
  const paymentCallbackUrl = readUrl(source, "PAYMENT_CALLBACK_URL") ?? new URL("/payment/callback", webBaseUrl).toString();
  const corsOrigins = readCsv(source, "CORS_ORIGINS", [new URL(webBaseUrl).origin]).map((origin) => new URL(origin).origin);

  return Object.freeze({
    nodeEnv,
    host: readString(source, "HOST", "0.0.0.0") ?? "0.0.0.0",
    port: readPort(source, "PORT", 4000),
    databaseUrl: readUrl(source, "DATABASE_URL"),
    redisUrl: readUrl(source, "REDIS_URL"),
    webBaseUrl,
    apiPublicBaseUrl,
    corsOrigins,
    authJwtSecret: requiredSecret(source, "AUTH_JWT_SECRET", nodeEnv, "cartnest-development-auth-jwt-secret-change-before-production"),
    mfaEncryptionKey: requiredSecret(source, "MFA_ENCRYPTION_KEY", nodeEnv, "cartnest-development-mfa-encryption-key-change-before-production"),
    cookieSecure: readBoolean(source, "AUTH_COOKIE_SECURE", nodeEnv === "production"),
    googleClientId: readString(source, "GOOGLE_CLIENT_ID"),
    googleClientSecret: readString(source, "GOOGLE_CLIENT_SECRET"),
    googleRedirectUri,
    exposeDevelopmentAuthTokens: readBoolean(source, "AUTH_EXPOSE_DEVELOPMENT_TOKENS", false),
    vendorRequireVerifiedIdentifier: readBoolean(source, "VENDOR_REQUIRE_VERIFIED_IDENTIFIER", true),
    r2AccountId: readString(source, "R2_ACCOUNT_ID"),
    r2AccessKeyId: readString(source, "R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: readString(source, "R2_SECRET_ACCESS_KEY"),
    r2Bucket: readString(source, "R2_BUCKET"),
    r2PublicBaseUrl: readUrl(source, "R2_PUBLIC_BASE_URL"),
    paystackSecretKey: readString(source, "PAYSTACK_SECRET_KEY"),
    paystackBaseUrl: readUrl(source, "PAYSTACK_BASE_URL", "https://api.paystack.co/") ?? "https://api.paystack.co/",
    flutterwaveSecretKey: readString(source, "FLUTTERWAVE_SECRET_KEY"),
    flutterwaveSecretHash: readString(source, "FLUTTERWAVE_SECRET_HASH"),
    flutterwaveBaseUrl: readUrl(source, "FLUTTERWAVE_BASE_URL", "https://api.flutterwave.com/v3/") ?? "https://api.flutterwave.com/v3/",
    paymentCallbackUrl,
    paymentCollectionSplitsEnabled: readBoolean(source, "PAYMENT_COLLECTION_SPLITS_ENABLED", false),
    giglAccessToken: readString(source, "GIGL_ACCESS_TOKEN"),
    giglCustomerCode: readString(source, "GIGL_CUSTOMER_CODE"),
    giglBaseUrl: readUrl(source, "GIGL_BASE_URL", "https://dev-thirdpartynode.theagilitysystems.com/") ?? "https://dev-thirdpartynode.theagilitysystems.com/",
    resendApiKey: readString(source, "RESEND_API_KEY"),
    emailFrom: readString(source, "EMAIL_FROM"),
    backgroundTasksEnabled: readBoolean(source, "BACKGROUND_TASKS_ENABLED", nodeEnv !== "test"),
  });
}
