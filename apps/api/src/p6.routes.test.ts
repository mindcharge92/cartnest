import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P6 route contracts", () => {
  it("registers checkout, buyer-order, and vendor-order operations in OpenAPI", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();

    const specification = app.swagger();

    expect(specification.paths).toHaveProperty("/api/v1/checkout");
    expect(specification.paths).toHaveProperty("/api/v1/orders");
    expect(specification.paths).toHaveProperty("/api/v1/orders/{orderId}");
    expect(specification.paths).toHaveProperty("/api/v1/orders/{orderId}/cancel");
    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/vendor-orders");
    expect(specification.paths).toHaveProperty("/api/v1/vendor-orders/{vendorOrderId}");
  });

  it("rejects checkout without an idempotency key before business execution", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/checkout",
      payload: {
        deliveryAddress: {
          recipientName: "Ada Okafor",
          phone: "+2348012345678",
          line1: "10 Market Road",
          city: "Lagos",
          state: "Lagos",
          countryCode: "NG",
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
