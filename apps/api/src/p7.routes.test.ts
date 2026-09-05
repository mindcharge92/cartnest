import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { FlutterwaveAdapter } from "./modules/payments/flutterwave.adapter.js";
import { majorToMinor, minorToMajorDecimal } from "./modules/payments/payment.provider.js";
import { PaystackAdapter } from "./modules/payments/paystack.adapter.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P7 route contracts", () => {
  it("registers payment initialization, status, reconciliation, and webhook operations", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();

    const specification = app.swagger();
    expect(specification.paths).toHaveProperty("/api/v1/payment-intents/{paymentIntentId}/initialize");
    expect(specification.paths).toHaveProperty("/api/v1/payment-intents/{paymentIntentId}");
    expect(specification.paths).toHaveProperty("/api/v1/payment-intents/{paymentIntentId}/reconcile");
    expect(specification.paths).toHaveProperty("/api/v1/webhooks/paystack");
    expect(specification.paths).toHaveProperty("/api/v1/webhooks/flutterwave");
  });

  it("rejects an unsupported channel through runtime validation", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/payment-intents/123e4567-e89b-12d3-a456-426614174000/initialize",
      headers: { "idempotency-key": "payment-test-key" },
      payload: { channel: "crypto" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("P7 provider security primitives", () => {
  it("verifies Paystack HMAC-SHA512 against the raw body", () => {
    const secret = "paystack-test-secret";
    const raw = Buffer.from(JSON.stringify({ event: "charge.success", data: { reference: "ref" } }));
    const signature = createHmac("sha512", secret).update(raw).digest("hex");
    const adapter = new PaystackAdapter(secret);
    expect(adapter.verifyWebhook(raw, signature)).toBe(true);
    expect(adapter.verifyWebhook(raw, `${signature.slice(0, -1)}0`)).toBe(false);
  });

  it("verifies Flutterwave HMAC-SHA256 Base64 against the raw body", () => {
    const secretHash = "flutterwave-webhook-secret";
    const raw = Buffer.from(JSON.stringify({ type: "charge.completed", data: { tx_ref: "ref" } }));
    const signature = createHmac("sha256", secretHash).update(raw).digest("base64");
    const adapter = new FlutterwaveAdapter("flutterwave-api-secret", secretHash);
    expect(adapter.verifyWebhook(raw, signature)).toBe(true);
    expect(adapter.verifyWebhook(raw, "invalid")).toBe(false);
  });

  it("converts Flutterwave major-unit amounts without binary floating-point math", () => {
    expect(minorToMajorDecimal(5_000_000n)).toBe("50000.00");
    expect(majorToMinor("50000.25")).toBe(5_000_025n);
  });
});
