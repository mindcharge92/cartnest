// Bootstrap snapshot for P1. Do not edit by hand after generation is operational.
// Regenerate with: pnpm api:generate
export interface paths {
  "/health": {
    get: {
      responses: {
        200: {
          content: {
            "application/json": {
              status: "ok";
              service: "cartnest-api";
              uptimeSeconds: number;
            };
          };
        };
      };
    };
  };
  "/ready": {
    get: {
      responses: {
        200: { content: { "application/json": Readiness } };
        503: { content: { "application/json": Readiness } };
      };
    };
  };
}

interface Readiness {
  status: "ready" | "degraded";
  service: "cartnest-api";
  dependencies: {
    database: "ready" | "not-ready";
    redis: "configured" | "not-configured";
  };
}
