import {
  beginIdempotencyRecord,
  type DatabaseClient,
  writeAuditEntry,
} from "@repo/database";
import type { PlatformRole } from "./auth.crypto.js";

export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED";

export interface AuthUserRecord {
  readonly id: string;
  readonly email: string | null;
  readonly normalizedEmail: string | null;
  readonly phone: string | null;
  readonly normalizedPhone: string | null;
  readonly passwordHash: string | null;
  readonly emailVerifiedAt: Date | null;
  readonly phoneVerifiedAt: Date | null;
  readonly status: UserStatus;
  readonly platformRole: PlatformRole;
}

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedBySessionId: string | null;
}

export interface TotpFactorRecord {
  readonly id: string;
  readonly userId: string;
  readonly secretEncrypted: string | null;
  readonly verifiedAt: Date | null;
  readonly disabledAt: Date | null;
}

export type RefreshRotationResult =
  | { readonly kind: "rotated"; readonly previousSessionId: string; readonly session: SessionRecord; readonly user: AuthUserRecord }
  | { readonly kind: "replay"; readonly userId: string }
  | { readonly kind: "expired" | "invalid" };

export interface CreateUserInput {
  readonly email?: string;
  readonly normalizedEmail?: string;
  readonly phone?: string;
  readonly normalizedPhone?: string;
  readonly passwordHash?: string;
  readonly status?: UserStatus;
  readonly platformRole?: PlatformRole;
  readonly emailVerifiedAt?: Date;
}

export interface AuthRepository {
  findUserByIdentifier(normalizedIdentifier: string): Promise<AuthUserRecord | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  findUserByNormalizedEmail(normalizedEmail: string): Promise<AuthUserRecord | null>;
  findSession(sessionId: string, userId: string): Promise<SessionRecord | null>;
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  markIdentifierVerified(userId: string, channel: "email" | "phone", now: Date): Promise<AuthUserRecord>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord>;
  rotateRefreshSession(tokenHash: string, nextTokenHash: string, nextExpiresAt: Date, now: Date): Promise<RefreshRotationResult>;
  revokeSessionByTokenHash(tokenHash: string, reason: string, now: Date): Promise<void>;
  revokeAllSessions(userId: string, reason: string, now: Date): Promise<void>;
  recordActionToken(userId: string, operation: string, tokenHash: string, expiresAt: Date): Promise<void>;
  consumeActionToken(userId: string, operation: string, tokenHash: string, now: Date): Promise<boolean>;
  findGoogleIdentity(providerSubject: string): Promise<AuthUserRecord | null>;
  linkGoogleIdentity(userId: string, providerSubject: string, providerEmail: string): Promise<void>;
  createGoogleUser(normalizedEmail: string, email: string, providerSubject: string, now: Date): Promise<AuthUserRecord>;
  getActiveTotpFactor(userId: string): Promise<TotpFactorRecord | null>;
  replaceTotpFactor(userId: string, secretEncrypted: string, now: Date): Promise<TotpFactorRecord>;
  confirmTotpFactor(factorId: string, now: Date): Promise<void>;
  writeAudit(input: {
    actorType: "USER" | "SYSTEM" | "PROVIDER";
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void>;
}

function mapUser(user: {
  id: string;
  email: string | null;
  normalizedEmail: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: UserStatus;
  platformRole: PlatformRole;
}): AuthUserRecord {
  return user;
}

function mapSession(session: {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
}): SessionRecord {
  return session;
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findUserByIdentifier(normalizedIdentifier: string): Promise<AuthUserRecord | null> {
    const user = await this.database.user.findFirst({
      where: { OR: [{ normalizedEmail: normalizedIdentifier }, { normalizedPhone: normalizedIdentifier }] },
    });
    return user ? mapUser(user) : null;
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const user = await this.database.user.findUnique({ where: { id: userId } });
    return user ? mapUser(user) : null;
  }

  async findUserByNormalizedEmail(normalizedEmail: string): Promise<AuthUserRecord | null> {
    const user = await this.database.user.findUnique({ where: { normalizedEmail } });
    return user ? mapUser(user) : null;
  }

  async findSession(sessionId: string, userId: string): Promise<SessionRecord | null> {
    const session = await this.database.authSession.findFirst({
      where: { id: sessionId, userId },
    });
    return session ? mapSession(session) : null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    const user = await this.database.user.create({
      data: {
        ...(input.email ? { email: input.email } : {}),
        ...(input.normalizedEmail ? { normalizedEmail: input.normalizedEmail } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.normalizedPhone ? { normalizedPhone: input.normalizedPhone } : {}),
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
        ...(input.emailVerifiedAt ? { emailVerifiedAt: input.emailVerifiedAt } : {}),
        status: input.status ?? "PENDING_VERIFICATION",
        platformRole: input.platformRole ?? "USER",
      },
    });
    return mapUser(user);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.database.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async markIdentifierVerified(userId: string, channel: "email" | "phone", now: Date): Promise<AuthUserRecord> {
    const user = await this.database.user.update({
      where: { id: userId },
      data: {
        ...(channel === "email" ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }),
        status: "ACTIVE",
      },
    });
    return mapUser(user);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<SessionRecord> {
    return mapSession(await this.database.authSession.create({ data: { userId, tokenHash, expiresAt } }));
  }

  async rotateRefreshSession(
    tokenHash: string,
    nextTokenHash: string,
    nextExpiresAt: Date,
    now: Date,
  ): Promise<RefreshRotationResult> {
    return this.database.$transaction(async (transaction) => {
      const current = await transaction.authSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!current) return { kind: "invalid" } as const;
      if (current.revokedAt) {
        if (current.replacedBySessionId) {
          await transaction.authSession.updateMany({
            where: { userId: current.userId, revokedAt: null },
            data: { revokedAt: now, revokedReason: "refresh-replay" },
          });
          return { kind: "replay", userId: current.userId } as const;
        }
        return { kind: "invalid" } as const;
      }
      if (current.expiresAt <= now) {
        await transaction.authSession.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: now, revokedReason: "expired" },
        });
        return { kind: "expired" } as const;
      }
      const next = await transaction.authSession.create({
        data: { userId: current.userId, tokenHash: nextTokenHash, expiresAt: nextExpiresAt },
      });
      const claimed = await transaction.authSession.updateMany({
        where: { id: current.id, revokedAt: null },
        data: {
          revokedAt: now,
          revokedReason: "rotated",
          replacedBySessionId: next.id,
          lastUsedAt: now,
        },
      });
      if (claimed.count !== 1) {
        await transaction.authSession.update({
          where: { id: next.id },
          data: { revokedAt: now, revokedReason: "refresh-race" },
        });
        await transaction.authSession.updateMany({
          where: { userId: current.userId, revokedAt: null },
          data: { revokedAt: now, revokedReason: "refresh-replay" },
        });
        return { kind: "replay", userId: current.userId } as const;
      }
      return {
        kind: "rotated",
        previousSessionId: current.id,
        session: mapSession(next),
        user: mapUser(current.user),
      } as const;
    });
  }

  async revokeSessionByTokenHash(tokenHash: string, reason: string, now: Date): Promise<void> {
    await this.database.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }

  async revokeAllSessions(userId: string, reason: string, now: Date): Promise<void> {
    await this.database.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }

  async recordActionToken(userId: string, operation: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await beginIdempotencyRecord(transaction, {
        principalId: userId,
        operation,
        idempotencyKey: tokenHash,
        requestFingerprint: "auth-action-token",
        expiresAt,
      });
    });
  }

  async consumeActionToken(userId: string, operation: string, tokenHash: string, now: Date): Promise<boolean> {
    const result = await this.database.idempotencyRecord.updateMany({
      where: {
        principalId: userId,
        operation,
        idempotencyKey: tokenHash,
        status: "IN_PROGRESS",
        expiresAt: { gt: now },
      },
      data: {
        status: "COMPLETED",
        resourceType: "User",
        resourceId: userId,
        responseStatus: 200,
      },
    });
    return result.count === 1;
  }

  async findGoogleIdentity(providerSubject: string): Promise<AuthUserRecord | null> {
    const identity = await this.database.authIdentity.findUnique({
      where: { provider_providerSubject: { provider: "GOOGLE", providerSubject } },
      include: { user: true },
    });
    return identity ? mapUser(identity.user) : null;
  }

  async linkGoogleIdentity(userId: string, providerSubject: string, providerEmail: string): Promise<void> {
    await this.database.authIdentity.create({
      data: { userId, provider: "GOOGLE", providerSubject, providerEmail },
    });
  }

  async createGoogleUser(
    normalizedEmail: string,
    email: string,
    providerSubject: string,
    now: Date,
  ): Promise<AuthUserRecord> {
    return this.database.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: { email, normalizedEmail, emailVerifiedAt: now, status: "ACTIVE", platformRole: "USER" },
      });
      await transaction.authIdentity.create({
        data: { userId: user.id, provider: "GOOGLE", providerSubject, providerEmail: email },
      });
      return mapUser(user);
    });
  }

  async getActiveTotpFactor(userId: string): Promise<TotpFactorRecord | null> {
    return this.database.mfaFactor.findFirst({
      where: { userId, type: "TOTP", disabledAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async replaceTotpFactor(userId: string, secretEncrypted: string, now: Date): Promise<TotpFactorRecord> {
    return this.database.$transaction(async (transaction) => {
      await transaction.mfaFactor.updateMany({
        where: { userId, type: "TOTP", disabledAt: null },
        data: { disabledAt: now },
      });
      return transaction.mfaFactor.create({ data: { userId, type: "TOTP", secretEncrypted } });
    });
  }

  async confirmTotpFactor(factorId: string, now: Date): Promise<void> {
    await this.database.mfaFactor.update({ where: { id: factorId }, data: { verifiedAt: now } });
  }

  async writeAudit(input: {
    actorType: "USER" | "SYSTEM" | "PROVIDER";
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId: string;
    requestId?: string;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void> {
    await this.database.$transaction(async (transaction) => {
      await writeAuditEntry(transaction, {
        actorType: input.actorType,
        ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    });
  }
}
