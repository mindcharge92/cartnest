import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "@repo/database";
import { getApiEnvironment } from "@repo/config/api";
import { buildHardenedApp } from "./app.hardened.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { decryptEmail, NotificationDelivery } from "./modules/notifications/notification.delivery.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("PostgreSQL application integration", () => {
  let database: DatabaseClient;
  const userIds: string[] = [];
  const notificationIds: string[] = [];
  const environment = getApiEnvironment({ NODE_ENV: "test" });
  const send = vi.fn(async () => "provider-test-reference");
  let delivery: NotificationDelivery;
  let auth: AuthService;

  beforeAll(() => {
    if (!new URL(databaseUrl!).pathname.startsWith("/cartnest_test")) {
      throw new Error("Use a disposable cartnest_test database.");
    }
    database = createDatabaseClient({ connectionString: databaseUrl! });
    delivery = new NotificationDelivery(database, environment.mfaEncryptionKey, "https://cartnest.example", { send });
    auth = new AuthService(new PrismaAuthRepository(database), environment, delivery);
  });

  afterAll(async () => {
    if (!database) return;
    await database.notification.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { id: { in: notificationIds } }] } });
    await database.idempotencyRecord.deleteMany({ where: { principalId: { in: userIds } } });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await database.$disconnect();
  });

  it("verifies an account and resets a password through encrypted single-use email links", async () => {
    const email = `test-${randomUUID()}@example.test`;
    const session = await auth.register({ email, password: "Integration-password-123!" });
    const principal = await auth.verifyAccess(session.accessToken);
    userIds.push(principal.userId);
    const token = await auth.requestVerification(principal, "email");
    const queued = await database.notification.findFirstOrThrow({ where: { userId: principal.userId } });
    expect(JSON.stringify(queued.payload)).not.toContain(token);
    const payload = queued.payload as { encryptedMessage: string };
    expect(decryptEmail(payload.encryptedMessage, environment.mfaEncryptionKey).text).toContain("#token=");
    await auth.confirmVerification(token);
    await expect(auth.confirmVerification(token)).rejects.toThrow();
    expect((await database.user.findUniqueOrThrow({ where: { id: principal.userId } })).emailVerifiedAt).not.toBeNull();
    const resetToken = await auth.requestPasswordReset(email);
    expect(resetToken).toBeDefined();
    await auth.confirmPasswordReset(resetToken!, "Replacement-password-456!");
    await expect(auth.verifyAccess(session.accessToken)).rejects.toThrow();
    await expect(auth.confirmPasswordReset(resetToken!, "Another-password-789!")).rejects.toThrow();
    await expect(auth.login(email, "Replacement-password-456!")).resolves.toBeDefined();
  }, 30_000);

  it("delivers concurrent claims once and keeps failures bounded and observable", async () => {
    await database.notification.updateMany({ where: { userId: { in: userIds } }, data: { status: "CANCELLED" } });
    send.mockClear();
    const row = await database.notification.create({ data: {
      channel: "EMAIL", recipient: "test@example.test", templateKey: "order.created.customer.v1",
      status: "QUEUED", payload: {},
    } });
    notificationIds.push(row.id);
    await Promise.all([delivery.deliverPending(), delivery.deliverPending()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await database.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ status: "SENT", attempts: 1 });
    const failed = await database.notification.create({ data: {
      channel: "EMAIL", recipient: "test@example.test", templateKey: "order.created.customer.v1",
      status: "QUEUED", attempts: 4, payload: {},
    } });
    notificationIds.push(failed.id);
    send.mockRejectedValueOnce(new Error("private provider response"));
    await delivery.deliverPending();
    expect(await database.notification.findUniqueOrThrow({ where: { id: failed.id } }))
      .toMatchObject({ status: "FAILED", attempts: 5, lastError: "EMAIL_DELIVERY_FAILED" });
    await delivery.deliverPending();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("serves real database health and rejects anonymous protected routes", async () => {
    const app = buildHardenedApp({ logger: false }, { database: async () => true, redis: async () => true }, database);
    try {
      expect((await app.inject({ url: "/ready" })).statusCode).toBe(200);
      expect((await app.inject({ url: "/api/v1/orders" })).statusCode).toBe(401);
      expect((await app.inject({ url: "/api/v1/auth/session" })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
