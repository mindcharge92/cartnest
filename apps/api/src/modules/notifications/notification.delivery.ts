import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Prisma, type DatabaseClient } from "@repo/database";

export interface EmailMessage {
  readonly subject: string;
  readonly text: string;
}

export interface EmailSender {
  send(recipient: string, message: EmailMessage, idempotencyKey: string): Promise<string>;
}

/** The provider response body is never included in errors or logs. */
export class ResendEmailSender implements EmailSender {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(recipient: string, message: EmailMessage, idempotencyKey: string): Promise<string> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ from: this.from, to: [recipient], ...message }),
    });
    if (!response.ok) throw new Error(`EMAIL_PROVIDER_HTTP_${response.status}`);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string") {
      throw new Error("EMAIL_PROVIDER_INVALID_RESPONSE");
    }
    return result.id;
  }
}

function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptEmail(message: EmailMessage, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(message), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function decryptEmail(value: string, secret: string): EmailMessage {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  const message: unknown = JSON.parse(Buffer.concat([
    decipher.update(data.subarray(28)), decipher.final(),
  ]).toString("utf8"));
  if (!message || typeof message !== "object" || !("subject" in message) ||
      !("text" in message) || typeof message.subject !== "string" || typeof message.text !== "string") {
    throw new Error("INVALID_ENCRYPTED_EMAIL");
  }
  return { subject: message.subject, text: message.text };
}

interface PendingEmail {
  id: string;
  recipient: string;
  templateKey: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
}

const subjects: Readonly<Record<string, string>> = {
  "order.created.customer.v1": "Your CartNest order has been placed",
  "order.created.vendor.v1": "You have a new CartNest order",
  "payment.succeeded.customer.v1": "Your CartNest payment was confirmed",
  "payment.succeeded.vendor.v1": "Payment received for your order",
  "shipment.delivered.customer.v1": "Your CartNest shipment was delivered",
  "shipment.delivered.vendor.v1": "Shipment delivery confirmed",
  "refund.succeeded.customer.v1": "Your CartNest refund was completed",
  "refund.succeeded.vendor.v1": "A CartNest refund was completed",
  "return.status.customer.v1": "Your return request has an update",
  "return.status.vendor.v1": "A return request has an update",
};

export class NotificationDelivery {
  constructor(
    private readonly database: DatabaseClient,
    private readonly secret: string,
    private readonly webBaseUrl: string,
    private readonly sender?: EmailSender,
  ) {}

  async queueAuth(input: {
    userId: string; recipient: string; token: string;
    purpose: "verification" | "password-reset";
  }): Promise<void> {
    if (!this.sender) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
    const url = new URL(input.purpose === "verification" ? "/verify" : "/reset-password", this.webBaseUrl);
    // Fragment avoids leaking the credential through server access logs/referrers.
    url.hash = new URLSearchParams({ token: input.token }).toString();
    const message = {
      subject: input.purpose === "verification" ? "Verify your CartNest account" : "Reset your CartNest password",
      text: `Open this link to ${input.purpose === "verification" ? "verify your account" : "reset your password"}:\n${url}\n\nIf you did not request this, ignore this email.`,
    };
    await this.database.notification.create({ data: {
      userId: input.userId,
      channel: "EMAIL",
      recipient: input.recipient,
      templateKey: `auth.${input.purpose}.v1`,
      dedupeKey: `auth:${createHash("sha256").update(input.token).digest("hex")}`,
      status: "QUEUED",
      nextAttemptAt: new Date(),
      payload: { encryptedMessage: encryptEmail(message, this.secret) },
    } });
  }

  private render(row: PendingEmail): EmailMessage {
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload as Record<string, unknown> : {};
    if (typeof payload.encryptedMessage === "string") return decryptEmail(payload.encryptedMessage, this.secret);
    const subject = subjects[row.templateKey];
    if (!subject) throw new Error("EMAIL_TEMPLATE_UNSUPPORTED");
    const orderId = typeof payload.orderId === "string" ? payload.orderId : undefined;
    const url = new URL(orderId ? `/orders/${encodeURIComponent(orderId)}` : "/notifications", this.webBaseUrl);
    return { subject, text: `${subject}.\n\nView the details securely in your account:\n${url}` };
  }

  async deliverPending(limit = 10): Promise<number> {
    if (!this.sender) return 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("INVALID_DELIVERY_LIMIT");
    let sent = 0;
    for (let index = 0; index < limit; index += 1) {
      const result = await this.database.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<PendingEmail[]>(Prisma.sql`
          SELECT "id", "recipient", "templateKey", "payload", "attempts", "createdAt"
          FROM "Notification"
          WHERE "channel" = 'EMAIL' AND "status" IN ('PENDING', 'QUEUED')
            AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
          ORDER BY CASE WHEN "templateKey" LIKE 'auth.%' THEN 0 ELSE 1 END, "createdAt"
          LIMIT 1 FOR UPDATE SKIP LOCKED
        `);
        const row = rows[0];
        if (!row) return "empty";
        // Never automatically replay beyond the provider's 24-hour dedupe window.
        const maxAge = row.templateKey === "auth.password-reset.v1"
          ? 14 * 60 * 1000 : 23 * 60 * 60 * 1000;
        if (row.attempts >= 5 || Date.now() - row.createdAt.getTime() >= maxAge) {
          await tx.notification.update({ where: { id: row.id }, data: {
            status: "FAILED", failedAt: new Date(), nextAttemptAt: null,
            lastError: "DELIVERY_REQUIRES_REVIEW",
          } });
          return "failed";
        }
        try {
          const providerRef = await this.sender!.send(row.recipient, this.render(row), `notification-${row.id}`);
          await tx.notification.update({ where: { id: row.id }, data: {
            status: "SENT", provider: "RESEND", providerRef, sentAt: new Date(),
            nextAttemptAt: null, lastError: null, attempts: { increment: 1 },
          } });
          return "sent";
        } catch {
          const attempts = row.attempts + 1;
          await tx.notification.update({ where: { id: row.id }, data: {
            status: attempts >= 5 ? "FAILED" : "QUEUED", attempts,
            failedAt: attempts >= 5 ? new Date() : null,
            nextAttemptAt: attempts >= 5 ? null : new Date(Date.now() + 60_000 * 2 ** attempts),
            lastError: "EMAIL_DELIVERY_FAILED",
          } });
          return "failed";
        }
      }, { timeout: 15_000 });
      if (result === "empty") break;
      if (result === "sent") sent += 1;
    }
    return sent;
  }
}
