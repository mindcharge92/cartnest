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
    expect(response.json()).toMatchObject({
      status: "ready",
      dependencies: { database: "ready", redis: "ready" },
    });
  });

  it("reports not-ready when dependencies are unavailable", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "not-ready",
      dependencies: { database: "unavailable", redis: "unavailable" },
    });
  });

  it("exposes the versioned system contract", async () => {
    const app = buildApp({ logger: false }, readyProbes);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/v1/system/info" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "cartnest-api",
      apiVersion: "v1",
      dependencies: { database: "ready", redis: "ready" },
    });
  });
});
