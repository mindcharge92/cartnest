import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type ReadinessProbes } from "./app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];
const readyProbes: ReadinessProbes = {
  database: async () => true,
  redis: async () => true,
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("system endpoints", () => {
  it("reports the API as healthy", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "cartnest-api" });
  });

  it("reports ready only when database and Redis probes succeed", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ready", dependencies: { database: "ready", redis: "ready" } });
  });

  it("reports not-ready when dependencies are unavailable", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "not-ready", dependencies: { database: "unavailable", redis: "unavailable" } });
  });

  it("exposes the versioned system contract", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/system/info" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: "cartnest-api", apiVersion: "v1", dependencies: { database: "ready", redis: "ready" } });
  });
});

describe("P4 catalog contract surface", () => {
  it("registers public, vendor, media, and admin catalog routes in OpenAPI", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    await app.ready();
    const specification = app.swagger();
    expect(specification.paths).toHaveProperty("/api/v1/categories");
    expect(specification.paths).toHaveProperty("/api/v1/catalog/products");
    expect(specification.paths).toHaveProperty("/api/v1/catalog/products/{productId}");
    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/products");
    expect(specification.paths).toHaveProperty("/api/v1/products/{productId}/variants");
    expect(specification.paths).toHaveProperty("/api/v1/media/upload-intents");
    expect(specification.paths).toHaveProperty("/api/v1/media/{mediaId}/complete");
    expect(specification.paths).toHaveProperty("/api/v1/admin/categories");
    expect(specification.paths).toHaveProperty("/api/v1/admin/products/{productId}/moderation");
  });

  it("uses the standard unavailable envelope when catalog persistence is absent", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/catalog/products" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "CATALOG_UNAVAILABLE", message: "Catalog storage is unavailable." } });
  });

  it("rejects a product payload that does not satisfy the shared request contract", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/api/v1/stores/11111111-1111-4111-8111-111111111111/products", headers: { "content-type": "application/json" }, payload: {} });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("P9 returns/refunds/reviews contract surface", () => {
  it("registers the P9 routes in OpenAPI", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    await app.ready();
    const specification = app.swagger();
    expect(specification.paths).toHaveProperty("/api/v1/returns");
    expect(specification.paths).toHaveProperty("/api/v1/returns/{returnRequestId}");
    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/returns");
    expect(specification.paths).toHaveProperty("/api/v1/vendor-orders/{vendorOrderId}/refunds");
    expect(specification.paths).toHaveProperty("/api/v1/admin/refunds/{refundId}/approve");
    expect(specification.paths).toHaveProperty("/api/v1/reviews/products");
    expect(specification.paths).toHaveProperty("/api/v1/reviews/stores");
    expect(specification.paths).toHaveProperty("/api/v1/products/{productId}/reviews");
    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/reviews");
    expect(specification.paths).toHaveProperty("/api/v1/admin/reviews/{reviewId}/moderate");
  });

  it("rejects an invalid return payload at the contract boundary", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "POST", url: "/api/v1/returns", headers: { "content-type": "application/json" }, payload: { reason: "x", items: [] } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("P10 admin, analytics, promotion, tax, and notification contract surface", () => {
  it("registers P10 routes in OpenAPI", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    await app.ready();
    const specification = app.swagger();
    expect(specification.paths).toHaveProperty("/api/v1/admin/analytics");
    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/analytics");
    expect(specification.paths).toHaveProperty("/api/v1/admin/users");
    expect(specification.paths).toHaveProperty("/api/v1/admin/orders");
    expect(specification.paths).toHaveProperty("/api/v1/admin/payment-intents");
    expect(specification.paths).toHaveProperty("/api/v1/admin/refunds");
    expect(specification.paths).toHaveProperty("/api/v1/admin/tax-rates");
    expect(specification.paths).toHaveProperty("/api/v1/admin/promotions");
    expect(specification.paths).toHaveProperty("/api/v1/notifications");
    expect(specification.paths).toHaveProperty("/api/v1/notification-preferences");
    expect(specification.paths).toHaveProperty("/api/v1/admin/notifications");
  });

  it("rejects malformed promotion payloads at the shared contract boundary", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/admin/promotions",
      headers: { "content-type": "application/json" },
      payload: { code: "bad code", name: "Bad", type: "PERCENTAGE", value: "0" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("exposes the standard unavailable envelope when notification persistence is absent", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/notifications" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "NOTIFICATION_SERVICE_UNAVAILABLE" } });
  });
});
