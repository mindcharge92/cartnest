import { afterEach, describe, expect, it } from "vitest";
import { buildHardenedApp } from "./app.hardened.js";

const apps: Array<ReturnType<typeof buildHardenedApp>> = [];
const readyProbes = { database: async () => true, redis: async () => true };

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P11 security hardening", () => {
  it("sets restrictive API security headers", async () => {
    const app = buildHardenedApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  it("marks authentication and privacy responses as no-store", async () => {
    const app = buildHardenedApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/privacy/export" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("does not expose unexpected error details in the HTTP response", async () => {
    const app = buildHardenedApp({ logger: false }, readyProbes);
    apps.push(app);
    app.get("/__p11/error", async () => {
      throw new Error("provider-secret-value-must-not-leak");
    });
    const response = await app.inject({ method: "GET", url: "/__p11/error" });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("provider-secret-value-must-not-leak");
    expect(response.json()).toMatchObject({ error: { code: "INTERNAL_ERROR" } });
  });
});

describe("P11 privacy contract surface", () => {
  it("registers data export and erasure routes in OpenAPI", async () => {
    const app = buildHardenedApp({ logger: false }, readyProbes);
    apps.push(app);
    await app.ready();
    const specification = app.swagger();

    expect(specification.paths).toHaveProperty("/api/v1/privacy/export");
    expect(specification.paths).toHaveProperty("/api/v1/privacy/erasure-requests");
    expect(specification.paths).toHaveProperty("/api/v1/admin/privacy/erasure-requests");
    expect(specification.paths).toHaveProperty(
      "/api/v1/admin/privacy/erasure-requests/{privacyRequestId}/process",
    );
  });

  it("requires authentication before exposing personal-data export", async () => {
    const app = buildHardenedApp({ logger: false }, readyProbes);
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/privacy/export" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });
});
