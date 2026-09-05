import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P3 vendor route contracts", () => {
  it("publishes vendor, membership, KYC, store, and admin routes in OpenAPI", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();

    const document = app.swagger();
    expect(document.paths).toHaveProperty("/api/v1/vendors");
    expect(document.paths).toHaveProperty("/api/v1/vendors/me");
    expect(document.paths).toHaveProperty("/api/v1/vendors/{vendorId}/verifications");
    expect(document.paths).toHaveProperty("/api/v1/vendors/{vendorId}/stores");
    expect(document.paths).toHaveProperty("/api/v1/vendors/{vendorId}/members");
    expect(document.paths).toHaveProperty("/api/v1/admin/vendors");
    expect(document.paths).toHaveProperty(
      "/api/v1/admin/vendor-verifications/{verificationId}/review",
    );
  });

  it("uses the shared validation error envelope for invalid vendor applications", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/vendors",
      payload: { displayName: "x", extra: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("fails closed when vendor persistence is unavailable", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/vendors/me" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: "VENDOR_SERVICE_UNAVAILABLE" },
    });
  });
});
