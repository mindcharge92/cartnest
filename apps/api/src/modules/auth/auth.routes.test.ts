import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("P2 auth route boundary", () => {
  it("registers the typed auth routes in OpenAPI", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    await app.ready();
    const document = app.swagger();
    expect(document.paths).toHaveProperty("/api/v1/auth/register");
    expect(document.paths).toHaveProperty("/api/v1/auth/session");
    expect(document.paths).toHaveProperty("/api/v1/auth/mfa/challenge");
  });

  it("returns the CartNest error envelope for invalid contract input", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "not-an-email", password: "short" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("does not pretend auth is available when the database service is absent", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      payload: { email: "buyer@example.com", password: "correct horse battery staple" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "AUTH_UNAVAILABLE" } });
  });

  it("rejects current-session access without an access cookie", async () => {
    const app = buildApp({ logger: false });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/auth/session" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
  });
});
