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

describe("P10 route surface", () => {
  it("publishes admin, analytics, tax, promotion, notification, and operations routes", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);
    await app.ready();

    const paths = app.swagger().paths;
    expect(paths).toHaveProperty("/api/v1/admin/analytics");
    expect(paths).toHaveProperty("/api/v1/stores/{storeId}/analytics");
    expect(paths).toHaveProperty("/api/v1/admin/users");
    expect(paths).toHaveProperty("/api/v1/admin/orders");
    expect(paths).toHaveProperty("/api/v1/admin/orders/{orderId}/operations");
    expect(paths).toHaveProperty("/api/v1/admin/payment-intents");
    expect(paths).toHaveProperty("/api/v1/admin/refunds");
    expect(paths).toHaveProperty("/api/v1/admin/tax-rates");
    expect(paths).toHaveProperty("/api/v1/admin/promotions");
    expect(paths).toHaveProperty("/api/v1/notifications");
    expect(paths).toHaveProperty("/api/v1/notification-preferences");
    expect(paths).toHaveProperty("/api/v1/admin/notifications");
    expect(paths).toHaveProperty("/api/v1/admin/notifications/{notificationId}/retry");
  });

  it("keeps authentication authoritative when P10 persistence is unavailable", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/orders/123e4567-e89b-12d3-a456-426614174000/operations",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });
});
