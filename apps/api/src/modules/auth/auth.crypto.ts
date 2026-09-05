import { hash, verify } from "@node-rs/argon2";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MFA_GRANT_TTL_SECONDS = 8 * 60 * 60;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type PlatformRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type ActionTokenPurpose = "password-reset" | "verify-email" | "verify-phone";

export interface AccessPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly platformRole: PlatformRole;
  readonly mfaSatisfied: boolean;
}

export interface OAuthStateClaims {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly intent: "login" | "link";
  readonly linkUserId: string | undefined;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const plus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Error("Invalid phone number.");
  if (plus) return `+${digits}`;
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  return `+${digits}`;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export function randomOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function accessExpiry(now = new Date()): Date {
  return new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000);
}

export function refreshExpiry(now = new Date()): Date {
  return new Date(now.getTime() + REFRESH_TTL_SECONDS * 1000);
}

export async function signAccessToken(
  secret: string,
  input: AccessPrincipal,
  now = new Date(),
): Promise<string> {
  return new SignJWT({
    type: "access",
    sid: input.sessionId,
    role: input.platformRole,
    mfa: input.mfaSatisfied,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("cartnest-api")
    .setAudience("cartnest")
    .setSubject(input.userId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + ACCESS_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifyAccessToken(secret: string, token: string): Promise<AccessPrincipal> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: "cartnest-api",
    audience: "cartnest",
    algorithms: ["HS256"],
  });
  if (
    payload.type !== "access" ||
    typeof payload.sub !== "string" ||
    typeof payload.sid !== "string" ||
    (payload.role !== "USER" && payload.role !== "ADMIN" && payload.role !== "SUPER_ADMIN") ||
    typeof payload.mfa !== "boolean"
  ) {
    throw new Error("Invalid access credential.");
  }
  return {
    userId: payload.sub,
    sessionId: payload.sid,
    platformRole: payload.role,
    mfaSatisfied: payload.mfa,
  };
}

export async function signMfaGrant(
  secret: string,
  userId: string,
  sessionId: string,
  now = new Date(),
): Promise<string> {
  return new SignJWT({ type: "mfa-grant", sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("cartnest-api")
    .setAudience("cartnest-mfa")
    .setSubject(userId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + MFA_GRANT_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifyMfaGrant(
  secret: string,
  token: string | undefined,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      issuer: "cartnest-api",
      audience: "cartnest-mfa",
      algorithms: ["HS256"],
    });
    return payload.type === "mfa-grant" && payload.sub === userId && payload.sid === sessionId;
  } catch {
    return false;
  }
}

export async function signActionToken(
  secret: string,
  input: { userId: string; purpose: ActionTokenPurpose; jti: string; channel?: "email" | "phone" },
  ttlSeconds: number,
  now = new Date(),
): Promise<string> {
  return new SignJWT({ type: "auth-action", purpose: input.purpose, channel: input.channel })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("cartnest-api")
    .setAudience("cartnest-auth-action")
    .setSubject(input.userId)
    .setJti(input.jti)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + ttlSeconds)
    .sign(secretKey(secret));
}

export async function verifyActionToken(
  secret: string,
  token: string,
  expectedPurpose: ActionTokenPurpose,
): Promise<{ userId: string; jti: string; channel: "email" | "phone" | undefined }> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: "cartnest-api",
    audience: "cartnest-auth-action",
    algorithms: ["HS256"],
  });
  if (
    payload.type !== "auth-action" ||
    payload.purpose !== expectedPurpose ||
    typeof payload.sub !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Invalid action token.");
  }
  const channel = payload.channel === "email" || payload.channel === "phone" ? payload.channel : undefined;
  return { userId: payload.sub, jti: payload.jti, channel };
}

export async function signOAuthState(
  secret: string,
  claims: OAuthStateClaims,
  now = new Date(),
): Promise<string> {
  return new SignJWT({
    type: "oauth-state",
    state: claims.state,
    nonce: claims.nonce,
    verifier: claims.codeVerifier,
    intent: claims.intent,
    linkUserId: claims.linkUserId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("cartnest-api")
    .setAudience("cartnest-google-oauth")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + OAUTH_STATE_TTL_SECONDS)
    .sign(secretKey(secret));
}

export async function verifyOAuthState(secret: string, token: string): Promise<OAuthStateClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: "cartnest-api",
    audience: "cartnest-google-oauth",
    algorithms: ["HS256"],
  });
  if (
    payload.type !== "oauth-state" ||
    typeof payload.state !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.verifier !== "string" ||
    (payload.intent !== "login" && payload.intent !== "link")
  ) {
    throw new Error("Invalid OAuth state.");
  }
  return {
    state: payload.state,
    nonce: payload.nonce,
    codeVerifier: payload.verifier,
    intent: payload.intent,
    linkUserId: typeof payload.linkUserId === "string" ? payload.linkUserId : undefined,
  };
}

export function encryptSecret(secret: string, encryptionSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encryptionSecret), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string, encryptionSecret: string): string {
  const parts = value.split(".");
  const ivPart = parts[0];
  const tagPart = parts[1];
  const dataPart = parts[2];
  if (!ivPart || !tagPart || !dataPart) throw new Error("Invalid encrypted secret.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(encryptionSecret),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? "";
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? "";
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function totpAt(secret: string, unixMilliseconds: number): string {
  const counter = BigInt(Math.floor(unixMilliseconds / 1000 / 30));
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  return [-30_000, 0, 30_000].some((offset) => safeEqual(totpAt(secret, now + offset), code));
}

export function buildTotpUri(secret: string, accountLabel: string): string {
  const issuer = "CartNest";
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
