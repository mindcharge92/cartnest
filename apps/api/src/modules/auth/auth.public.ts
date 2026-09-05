import type { FastifyRequest } from "fastify";
import {
  AuthorizationError,
  requirePlatformRole,
  requirePrivilegedMfa,
} from "./auth.authorization.js";
import {
  normalizeEmail,
  normalizePhone,
  safeEqual,
  type AccessPrincipal,
} from "./auth.crypto.js";
import {
  ACCESS_COOKIE,
  AuthError,
  CSRF_COOKIE,
  type AuthService,
} from "./auth.service.js";

export async function requireAccessPrincipal(
  request: FastifyRequest,
  service: AuthService,
): Promise<AccessPrincipal> {
  const token = request.cookies[ACCESS_COOKIE];
  if (!token) {
    throw new AuthError("UNAUTHENTICATED", "Authentication is required.", 401);
  }
  return service.verifyAccess(token);
}

export function requireCsrfToken(request: FastifyRequest): void {
  const cookieToken = request.cookies[CSRF_COOKIE];
  const header = request.headers["x-csrf-token"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new AuthError("CSRF_REJECTED", "CSRF validation failed.", 403);
  }
}

export function normalizeAccountIdentifier(value: string): string {
  return value.includes("@") ? normalizeEmail(value) : normalizePhone(value);
}

export {
  AuthError,
  AuthorizationError,
  requirePlatformRole,
  requirePrivilegedMfa,
  type AccessPrincipal,
  type AuthService,
};
