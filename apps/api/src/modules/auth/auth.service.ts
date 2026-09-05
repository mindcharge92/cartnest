import type { ApiEnvironment } from "@repo/config/api";
import type {
  AuthSessionResponseDto,
  AuthUserDto,
  RegisterBodyDto,
  VerificationChannelDto,
} from "@repo/contracts";
import {
  accessExpiry,
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashOpaqueToken,
  hashPassword,
  normalizeEmail,
  normalizePhone,
  randomOpaqueToken,
  refreshExpiry,
  signAccessToken,
  signActionToken,
  signMfaGrant,
  verifyAccessToken,
  verifyActionToken,
  verifyMfaGrant,
  verifyPassword,
  verifyTotp,
  type AccessPrincipal,
} from "./auth.crypto.js";
import type { AuthRepository, AuthUserRecord } from "./auth.repository.js";

export const ACCESS_COOKIE = "cartnest_access";
export const REFRESH_COOKIE = "cartnest_refresh";
export const CSRF_COOKIE = "cartnest_csrf";
export const MFA_GRANT_COOKIE = "cartnest_mfa_grant";
export const GOOGLE_STATE_COOKIE = "cartnest_google_state";

const PASSWORD_RESET_TTL_SECONDS = 15 * 60;
const VERIFICATION_TTL_SECONDS = 24 * 60 * 60;

export class AuthError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface SessionArtifacts {
  readonly response: AuthSessionResponseDto;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly mfaGrantToken: string | undefined;
}

function publicUser(user: AuthUserRecord): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerifiedAt),
    phoneVerified: Boolean(user.phoneVerifiedAt),
    status: user.status,
    platformRole: user.platformRole,
  };
}

function isPrivileged(user: AuthUserRecord): boolean {
  return user.platformRole === "ADMIN" || user.platformRole === "SUPER_ADMIN";
}

function normalizedIdentifier(value: string): string {
  return value.includes("@") ? normalizeEmail(value) : normalizePhone(value);
}

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly environment: ApiEnvironment) {}

  async register(input: RegisterBodyDto, requestId?: string): Promise<SessionArtifacts> {
    if (!input.email && !input.phone) throw new AuthError("IDENTIFIER_REQUIRED", "Email or phone is required.", 400);
    const email = input.email?.trim();
    const phone = input.phone?.trim();
    const normalizedEmail = email ? normalizeEmail(email) : undefined;
    const normalizedPhone = phone ? normalizePhone(phone) : undefined;
    if (normalizedEmail && (await this.repository.findUserByIdentifier(normalizedEmail))) throw new AuthError("ACCOUNT_EXISTS", "An account already uses that identifier.", 409);
    if (normalizedPhone && (await this.repository.findUserByIdentifier(normalizedPhone))) throw new AuthError("ACCOUNT_EXISTS", "An account already uses that identifier.", 409);
    const user = await this.repository.createUser({
      ...(email ? { email } : {}),
      ...(normalizedEmail ? { normalizedEmail } : {}),
      ...(phone ? { phone } : {}),
      ...(normalizedPhone ? { normalizedPhone } : {}),
      passwordHash: await hashPassword(input.password),
    });
    await this.repository.writeAudit({ actorType: "USER", actorUserId: user.id, action: "auth.register", entityType: "User", entityId: user.id, ...(requestId ? { requestId } : {}) });
    return this.startSession(user, false);
  }

  async login(identifier: string, password: string, requestId?: string): Promise<SessionArtifacts> {
    let normalized: string;
    try { normalized = normalizedIdentifier(identifier); } catch { throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials.", 401); }
    const user = await this.repository.findUserByIdentifier(normalized);
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
      await this.repository.writeAudit({ actorType: "SYSTEM", action: "auth.login.failed", entityType: "Authentication", entityId: hashOpaqueToken(normalized), ...(requestId ? { requestId } : {}) });
      throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials.", 401);
    }
    if (user.status === "SUSPENDED" || user.status === "DISABLED") throw new AuthError("ACCOUNT_UNAVAILABLE", "This account is unavailable.", 403);
    await this.repository.writeAudit({ actorType: "USER", actorUserId: user.id, action: "auth.login.succeeded", entityType: "User", entityId: user.id, ...(requestId ? { requestId } : {}) });
    return this.startSession(user, false);
  }

  private async startSession(user: AuthUserRecord, mfaSatisfied: boolean): Promise<SessionArtifacts> {
    const now = new Date();
    const refreshToken = randomOpaqueToken();
    const refreshExpiresAt = refreshExpiry(now);
    const session = await this.repository.createSession(user.id, hashOpaqueToken(refreshToken), refreshExpiresAt);
    return this.buildArtifacts(user, session.id, refreshToken, refreshExpiresAt, mfaSatisfied, now);
  }

  private async buildArtifacts(user: AuthUserRecord, sessionId: string, refreshToken: string, refreshExpiresAt: Date, mfaSatisfied: boolean, now: Date): Promise<SessionArtifacts> {
    const factor = await this.repository.getActiveTotpFactor(user.id);
    const enrolled = Boolean(factor?.verifiedAt && !factor.disabledAt);
    const required = isPrivileged(user);
    const effectiveMfaSatisfied = required ? mfaSatisfied : false;
    const accessExpiresAt = accessExpiry(now);
    const csrfToken = randomOpaqueToken();
    const accessToken = await signAccessToken(this.environment.authJwtSecret, { userId: user.id, sessionId, platformRole: user.platformRole, mfaSatisfied: effectiveMfaSatisfied }, now);
    const mfaGrantToken = effectiveMfaSatisfied ? await signMfaGrant(this.environment.authJwtSecret, user.id, sessionId, now) : undefined;
    return { accessToken, refreshToken, mfaGrantToken, response: { user: publicUser(user), accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString(), csrfToken, mfa: { required, enrolled, satisfied: effectiveMfaSatisfied } } };
  }

  async refresh(refreshToken: string, mfaGrantToken?: string, requestId?: string): Promise<SessionArtifacts> {
    const now = new Date();
    const nextRefreshToken = randomOpaqueToken();
    const nextExpiry = refreshExpiry(now);
    const result = await this.repository.rotateRefreshSession(hashOpaqueToken(refreshToken), hashOpaqueToken(nextRefreshToken), nextExpiry, now);
    if (result.kind === "replay") {
      await this.repository.writeAudit({ actorType: "SYSTEM", actorUserId: result.userId, action: "auth.refresh.replay", entityType: "User", entityId: result.userId, ...(requestId ? { requestId } : {}) });
      throw new AuthError("SESSION_REPLAY_DETECTED", "Session replay detected. Sign in again.", 401);
    }
    if (result.kind !== "rotated") throw new AuthError("INVALID_SESSION", "Session has expired or is invalid.", 401);
    const mfaSatisfied = await verifyMfaGrant(this.environment.authJwtSecret, mfaGrantToken, result.user.id, result.previousSessionId);
    return this.buildArtifacts(result.user, result.session.id, nextRefreshToken, nextExpiry, mfaSatisfied, now);
  }

  async verifyAccess(token: string): Promise<AccessPrincipal> {
    try {
      const principal = await verifyAccessToken(this.environment.authJwtSecret, token);
      const [user, session] = await Promise.all([
        this.repository.findUserById(principal.userId),
        this.repository.findSession(principal.sessionId, principal.userId),
      ]);
      if (
        !user ||
        !session ||
        session.revokedAt !== null ||
        session.expiresAt <= new Date() ||
        user.status === "SUSPENDED" ||
        user.status === "DISABLED"
      ) throw new Error("Unavailable account or session");
      return principal;
    } catch {
      throw new AuthError("UNAUTHENTICATED", "Authentication is required.", 401);
    }
  }

  async currentSession(principal: AccessPrincipal, csrfToken: string): Promise<AuthSessionResponseDto> {
    const [user, session] = await Promise.all([
      this.repository.findUserById(principal.userId),
      this.repository.findSession(principal.sessionId, principal.userId),
    ]);
    if (!user || !session || session.revokedAt !== null || session.expiresAt <= new Date()) throw new AuthError("UNAUTHENTICATED", "Authentication is required.", 401);
    const factor = await this.repository.getActiveTotpFactor(user.id);
    return { user: publicUser(user), accessExpiresAt: accessExpiry().toISOString(), refreshExpiresAt: session.expiresAt.toISOString(), csrfToken, mfa: { required: isPrivileged(user), enrolled: Boolean(factor?.verifiedAt && !factor.disabledAt), satisfied: principal.mfaSatisfied } };
  }

  async logout(refreshToken: string | undefined, requestId?: string): Promise<void> {
    if (!refreshToken) return;
    const tokenHash = hashOpaqueToken(refreshToken);
    await this.repository.revokeSessionByTokenHash(tokenHash, "logout", new Date());
    await this.repository.writeAudit({ actorType: "SYSTEM", action: "auth.logout", entityType: "AuthSession", entityId: tokenHash.slice(0, 32), ...(requestId ? { requestId } : {}) });
  }

  async logoutAll(principal: AccessPrincipal, requestId?: string): Promise<void> {
    await this.repository.revokeAllSessions(principal.userId, "logout-all", new Date());
    await this.repository.writeAudit({ actorType: "USER", actorUserId: principal.userId, action: "auth.logout-all", entityType: "User", entityId: principal.userId, ...(requestId ? { requestId } : {}) });
  }

  async requestPasswordReset(identifier: string, requestId?: string): Promise<string | undefined> {
    let normalized: string;
    try { normalized = normalizedIdentifier(identifier); } catch { return undefined; }
    const user = await this.repository.findUserByIdentifier(normalized);
    if (!user) return undefined;
    const jti = randomOpaqueToken(24);
    const now = new Date();
    await this.repository.recordActionToken(user.id, "auth.password-reset", hashOpaqueToken(jti), new Date(now.getTime() + PASSWORD_RESET_TTL_SECONDS * 1000));
    const token = await signActionToken(this.environment.authJwtSecret, { userId: user.id, purpose: "password-reset", jti }, PASSWORD_RESET_TTL_SECONDS, now);
    await this.repository.writeAudit({ actorType: "SYSTEM", actorUserId: user.id, action: "auth.password-reset.requested", entityType: "User", entityId: user.id, ...(requestId ? { requestId } : {}) });
    return token;
  }

  async confirmPasswordReset(token: string, newPassword: string, requestId?: string): Promise<void> {
    let claims: Awaited<ReturnType<typeof verifyActionToken>>;
    try { claims = await verifyActionToken(this.environment.authJwtSecret, token, "password-reset"); } catch { throw new AuthError("INVALID_RESET_TOKEN", "Reset token is invalid or expired.", 400); }
    const consumed = await this.repository.consumeActionToken(claims.userId, "auth.password-reset", hashOpaqueToken(claims.jti), new Date());
    if (!consumed) throw new AuthError("INVALID_RESET_TOKEN", "Reset token is invalid or expired.", 400);
    await this.repository.updatePassword(claims.userId, await hashPassword(newPassword));
    await this.repository.revokeAllSessions(claims.userId, "password-reset", new Date());
    await this.repository.writeAudit({ actorType: "USER", actorUserId: claims.userId, action: "auth.password-reset.completed", entityType: "User", entityId: claims.userId, ...(requestId ? { requestId } : {}) });
  }

  async requestVerification(principal: AccessPrincipal, channel: VerificationChannelDto, requestId?: string): Promise<string> {
    const user = await this.repository.findUserById(principal.userId);
    if (!user) throw new AuthError("UNAUTHENTICATED", "Authentication is required.", 401);
    if (channel === "email" && !user.email) throw new AuthError("EMAIL_REQUIRED", "Add an email first.", 400);
    if (channel === "phone" && !user.phone) throw new AuthError("PHONE_REQUIRED", "Add a phone first.", 400);
    const jti = randomOpaqueToken(24);
    const purpose = channel === "email" ? "verify-email" : "verify-phone";
    const now = new Date();
    await this.repository.recordActionToken(user.id, `auth.${purpose}`, hashOpaqueToken(jti), new Date(now.getTime() + VERIFICATION_TTL_SECONDS * 1000));
    const token = await signActionToken(this.environment.authJwtSecret, { userId: user.id, purpose, jti, channel }, VERIFICATION_TTL_SECONDS, now);
    await this.repository.writeAudit({ actorType: "USER", actorUserId: user.id, action: `auth.verification.${channel}.requested`, entityType: "User", entityId: user.id, ...(requestId ? { requestId } : {}) });
    return token;
  }

  async confirmVerification(token: string, requestId?: string): Promise<void> {
    for (const candidate of ["verify-email", "verify-phone"] as const) {
      try {
        const claims = await verifyActionToken(this.environment.authJwtSecret, token, candidate);
        const channel = candidate === "verify-email" ? "email" : "phone";
        const consumed = await this.repository.consumeActionToken(claims.userId, `auth.${candidate}`, hashOpaqueToken(claims.jti), new Date());
        if (!consumed) throw new AuthError("INVALID_VERIFICATION_TOKEN", "Verification token is invalid or expired.", 400);
        await this.repository.markIdentifierVerified(claims.userId, channel, new Date());
        await this.repository.writeAudit({ actorType: "USER", actorUserId: claims.userId, action: `auth.verification.${channel}.completed`, entityType: "User", entityId: claims.userId, ...(requestId ? { requestId } : {}) });
        return;
      } catch (error) { if (error instanceof AuthError) throw error; }
    }
    throw new AuthError("INVALID_VERIFICATION_TOKEN", "Verification token is invalid or expired.", 400);
  }

  async beginTotpEnrollment(principal: AccessPrincipal): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.repository.findUserById(principal.userId);
    if (!user) throw new AuthError("UNAUTHENTICATED", "Authentication is required.", 401);
    const secret = generateTotpSecret();
    await this.repository.replaceTotpFactor(user.id, encryptSecret(secret, this.environment.mfaEncryptionKey), new Date());
    return { secret, otpauthUri: buildTotpUri(secret, user.email ?? user.phone ?? user.id) };
  }

  async confirmTotpEnrollment(principal: AccessPrincipal, code: string, requestId?: string): Promise<void> {
    const factor = await this.repository.getActiveTotpFactor(principal.userId);
    if (!factor?.secretEncrypted) throw new AuthError("MFA_NOT_ENROLLED", "Start MFA enrollment first.", 400);
    const secret = decryptSecret(factor.secretEncrypted, this.environment.mfaEncryptionKey);
    if (!verifyTotp(secret, code)) throw new AuthError("INVALID_MFA_CODE", "Invalid authentication code.", 400);
    await this.repository.confirmTotpFactor(factor.id, new Date());
    await this.repository.writeAudit({ actorType: "USER", actorUserId: principal.userId, action: "auth.mfa.enrolled", entityType: "User", entityId: principal.userId, ...(requestId ? { requestId } : {}) });
  }

  async challengeTotp(principal: AccessPrincipal, code: string, requestId?: string): Promise<string> {
    const factor = await this.repository.getActiveTotpFactor(principal.userId);
    if (!factor?.verifiedAt || !factor.secretEncrypted) throw new AuthError("MFA_NOT_ENROLLED", "MFA enrollment is required.", 403);
    const secret = decryptSecret(factor.secretEncrypted, this.environment.mfaEncryptionKey);
    if (!verifyTotp(secret, code)) throw new AuthError("INVALID_MFA_CODE", "Invalid authentication code.", 401);
    await this.repository.writeAudit({ actorType: "USER", actorUserId: principal.userId, action: "auth.mfa.challenge.succeeded", entityType: "AuthSession", entityId: principal.sessionId, ...(requestId ? { requestId } : {}) });
    return signMfaGrant(this.environment.authJwtSecret, principal.userId, principal.sessionId);
  }

  async issueMfaSatisfiedAccess(principal: AccessPrincipal): Promise<string> {
    return signAccessToken(this.environment.authJwtSecret, { ...principal, mfaSatisfied: true });
  }

  async completeGoogleLogin(input: { subject: string; email: string; emailVerified: boolean; linkUserId?: string; requestId?: string }): Promise<SessionArtifacts> {
    if (!input.emailVerified) throw new AuthError("GOOGLE_EMAIL_UNVERIFIED", "Google email is not verified.", 403);
    const normalizedEmail = normalizeEmail(input.email);
    const identityUser = await this.repository.findGoogleIdentity(input.subject);
    if (identityUser) return this.startSession(identityUser, false);
    if (input.linkUserId) {
      const linkUser = await this.repository.findUserById(input.linkUserId);
      if (!linkUser) throw new AuthError("ACCOUNT_NOT_FOUND", "Account not found.", 404);
      await this.repository.linkGoogleIdentity(linkUser.id, input.subject, input.email);
      await this.repository.writeAudit({ actorType: "USER", actorUserId: linkUser.id, action: "auth.google.linked", entityType: "User", entityId: linkUser.id, ...(input.requestId ? { requestId: input.requestId } : {}) });
      return this.startSession(linkUser, false);
    }
    if (await this.repository.findUserByNormalizedEmail(normalizedEmail)) throw new AuthError("GOOGLE_LINK_REQUIRED", "Sign in with your existing account before linking Google.", 409);
    const user = await this.repository.createGoogleUser(normalizedEmail, input.email, input.subject, new Date());
    await this.repository.writeAudit({ actorType: "USER", actorUserId: user.id, action: "auth.google.registered", entityType: "User", entityId: user.id, ...(input.requestId ? { requestId: input.requestId } : {}) });
    return this.startSession(user, false);
  }
}
