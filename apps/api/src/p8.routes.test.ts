import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P8 logistics route contracts", () => {
  it("registers shipping quote, station discovery, fulfillment, shipment, and buyer tracking operations", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();

    const specification = app.swagger();
    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/fulfillment-profile");
    expect(specification.paths).toHaveProperty("/api/v1/variants/{variantId}/shipping-profile");
    expect(specification.paths).toHaveProperty("/api/v1/logistics/stations");
    expect(specification.paths).toHaveProperty("/api/v1/logistics/quotes");
    expect(specification.paths).toHaveProperty("/api/v1/vendor-orders/{vendorOrderId}/shipments");
    expect(specification.paths).toHaveProperty("/api/v1/orders/{orderId}/shipments");
    expect(specification.paths).toHaveProperty("/api/v1/shipments/{shipmentId}");
    expect(specification.paths).toHaveProperty("/api/v1/shipments/{shipmentId}/status");
  });

  it("rejects invalid variant shipping weight before authorization", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/variants/123e4567-e89b-12d3-a456-426614174000/shipping-profile",
      payload: { weightGrams: 0 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("rejects an empty shipment item list through the TypeBox contract", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/vendor-orders/123e4567-e89b-12d3-a456-426614174000/shipments",
      payload: { provider: "MANUAL", items: [] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
