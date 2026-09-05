import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("system endpoints", () => {
  it("reports the API as healthy using the shared response contract", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "cartnest-api" });
  });

  it("reports degraded readiness when the database is unavailable", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "degraded",
      dependencies: { database: "not-ready" },
    });
  });

  it("publishes an OpenAPI operation for the health endpoint", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();

    const spec = app.swagger();
    expect(spec.paths?.["/health"]?.get?.operationId).toBe("getHealth");
  });
});
