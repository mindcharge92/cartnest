import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "@repo/database";
import type { OrderDto } from "@repo/contracts";
import type { FastifyInstance, InjectOptions } from "fastify";
import { buildHardenedApp } from "./app.hardened.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("multi-store commerce against PostgreSQL", () => {
  let database: DatabaseClient;
  let app: FastifyInstance;
  let buyerHeaders: Record<string, string>;
  let strangerHeaders: Record<string, string>;
  const variants: string[] = [];
  const deliveryAddress = {
    recipientName: "Integration Buyer", phone: "+2348000000000", line1: "1 Test Street",
    city: "Lagos", state: "Lagos", countryCode: "NG",
  };
  let providerReference = "";
  let amount = "0";

  async function request(options: InjectOptions, status = 200) {
    const response = await app.inject(options);
    expect(response.statusCode, response.body).toBe(status);
    return response;
  }

  async function register() {
    const response = await request({ method: "POST", url: "/api/v1/auth/register", payload: {
      email: `commerce-${randomUUID()}@example.test`, password: "Commerce-password-123!",
    } }, 201);
    const csrf = response.cookies.find((cookie) => cookie.name === "cartnest_csrf")!.value;
    return {
      cookie: response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "),
      "x-csrf-token": csrf,
    };
  }

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.startsWith("/cartnest_test")) throw new Error("Disposable database required.");
    database = createDatabaseClient({ connectionString: databaseUrl! });
    vi.stubEnv("PAYSTACK_SECRET_KEY", "integration-only-key");
    vi.stubEnv("BACKGROUND_TASKS_ENABLED", "false");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/transaction/initialize")) {
        const payload = JSON.parse(String(init?.body)) as { reference: string; amount: string };
        providerReference = payload.reference;
        amount = payload.amount;
        return Response.json({ status: true, data: {
          reference: providerReference, authorization_url: "https://checkout.paystack.com/integration",
        } });
      }
      if (url.includes("/transaction/verify/")) {
        return Response.json({ status: true, data: {
          status: "success", reference: providerReference, amount, currency: "NGN", id: 123, fees: 0,
        } });
      }
      throw new Error("Unexpected provider request in isolated test");
    }));
    app = buildHardenedApp({ logger: false }, undefined, database);
    buyerHeaders = await register();
    strangerHeaders = await register();
    for (let index = 0; index < 2; index += 1) {
      const suffix = randomUUID();
      const vendor = await database.vendor.create({ data: { displayName: "Test vendor", status: "APPROVED" } });
      const store = await database.store.create({ data: { vendorId: vendor.id, name: "Test store", slug: suffix, status: "ACTIVE" } });
      await database.storeFulfillmentProfile.create({ data: {
        storeId: store.id, originAddress: deliveryAddress, manualDeliveryFeeAmountMinor: 500n,
      } });
      const product = await database.product.create({ data: {
        storeId: store.id, name: "Test product", slug: suffix, description: "Integration fixture", status: "ACTIVE",
      } });
      const variant = await database.productVariant.create({ data: {
        productId: product.id, storeId: store.id, sku: suffix, priceAmountMinor: 10000n,
        inventory: { create: { onHand: 10 } },
      } });
      variants.push(variant.id);
    }
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.$disconnect();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    // Keep the disposable database's order/financial ledger for recovery assertions.
  });

  it("creates one multi-store order, isolates ownership and applies verified payment only once", async () => {
    for (const variantId of variants) {
      await request({ method: "POST", url: "/api/v1/cart/items", headers: buyerHeaders, payload: { variantId, quantity: 2 } });
    }
    await request({ method: "POST", url: "/api/v1/logistics/quotes", headers: buyerHeaders, payload: { deliveryAddress } });
    const checkout = {
      method: "POST" as const, url: "/api/v1/checkout",
      headers: { ...buyerHeaders, "idempotency-key": randomUUID() }, payload: { deliveryAddress },
    };
    const created = await request(checkout, 201);
    const order = created.json<OrderDto>();
    const replay = await request(checkout);
    expect(replay.json<OrderDto>().id).toBe(order.id);
    const conflict = await request({ ...checkout, payload: {
      deliveryAddress: { ...deliveryAddress, line1: "2 Changed Street" },
    } }, 409);
    expect(conflict.json().error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(order.vendorOrders).toHaveLength(2);
    expect(order.grandTotal.amountMinor).toBe("41000");
    await request({ url: `/api/v1/orders/${order.id}`, headers: strangerHeaders }, 404);
    for (const variantId of variants) {
      expect(await database.inventoryItem.findUniqueOrThrow({ where: { variantId } })).toMatchObject({ onHand: 10, reserved: 2 });
    }
    const intent = await database.paymentIntent.findFirstOrThrow({ where: { orderId: order.id } });
    await request({ method: "POST", url: `/api/v1/payment-intents/${intent.id}/initialize`,
      headers: { ...buyerHeaders, "idempotency-key": randomUUID() }, payload: {} });
    await request({ method: "POST", url: `/api/v1/payment-intents/${intent.id}/reconcile`, headers: buyerHeaders });
    await request({ method: "POST", url: `/api/v1/payment-intents/${intent.id}/reconcile`, headers: buyerHeaders });
    expect(await database.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ paymentStatus: "SUCCEEDED", status: "PAID" });
    for (const variantId of variants) {
      expect(await database.inventoryItem.findUniqueOrThrow({ where: { variantId } })).toMatchObject({ onHand: 8, reserved: 0 });
    }
    expect(await database.outboxEvent.count({ where: { aggregateId: intent.id, eventType: "payment.succeeded" } })).toBe(1);
  }, 60_000);
});
