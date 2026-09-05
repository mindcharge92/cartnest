import type { AccessPrincipal, PlatformRole } from "./auth.crypto.js";

export class AuthorizationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function requirePlatformRole(
  principal: AccessPrincipal,
  allowed: readonly PlatformRole[],
): void {
  if (!allowed.includes(principal.platformRole)) {
    throw new AuthorizationError("FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export function requirePrivilegedMfa(principal: AccessPrincipal): void {
  if (
    (principal.platformRole === "ADMIN" || principal.platformRole === "SUPER_ADMIN") &&
    !principal.mfaSatisfied
  ) {
    throw new AuthorizationError("MFA_REQUIRED", "Multi-factor authentication is required.", 401);
  }
}
