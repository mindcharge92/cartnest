import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P5 route contracts", () => {
  it("registers inventory, wishlist, cart, and checkout-preview operations in OpenAPI", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();

    const specification = app.swagger();

    expect(specification.paths).toHaveProperty("/api/v1/stores/{storeId}/inventory");
    expect(specification.paths).toHaveProperty("/api/v1/inventory/{variantId}");
    expect(specification.paths).toHaveProperty("/api/v1/wishlist");
    expect(specification.paths).toHaveProperty("/api/v1/wishlist/items");
    expect(specification.paths).toHaveProperty("/api/v1/cart");
    expect(specification.paths).toHaveProperty("/api/v1/cart/items");
    expect(specification.paths).toHaveProperty("/api/v1/checkout/preview");
  });

  it("rejects an invalid cart quantity through runtime contract validation", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cart/items",
      payload: {
        variantId: "123e4567-e89b-12d3-a456-426614174000",
        quantity: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
