// Bootstrap snapshot for P1. Regenerate with `pnpm api:generate` once dependencies are installed.
export interface paths {
  "/health": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getHealth"];
    put?: never; post?: never; delete?: never; options?: never; head?: never; patch?: never; trace?: never;
  };
  "/ready": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getReadiness"];
    put?: never; post?: never; delete?: never; options?: never; head?: never; patch?: never; trace?: never;
  };
  "/api/v1/system/info": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: operations["getSystemInfo"];
    put?: never; post?: never; delete?: never; options?: never; head?: never; patch?: never; trace?: never;
  };
}

export interface components {
  schemas: {
    HealthResponse: {
      status: "ok";
      service: "cartnest-api";
      uptimeSeconds: number;
    };
    ReadinessResponse: {
      status: "ready" | "not-ready";
      service: "cartnest-api";
      dependencies: {
        database: "ready" | "unavailable";
        redis: "ready" | "unavailable";
      };
    };
    SystemInfoResponse: {
      service: "cartnest-api";
      apiVersion: "v1";
      timestamp: string;
      dependencies: {
        database: "ready" | "unavailable";
        redis: "ready" | "unavailable";
      };
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

export interface operations {
  getHealth: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: { headers: Record<string, unknown>; content: { "application/json": components["schemas"]["HealthResponse"] } };
    };
  };
  getReadiness: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: { headers: Record<string, unknown>; content: { "application/json": components["schemas"]["ReadinessResponse"] } };
      503: { headers: Record<string, unknown>; content: { "application/json": components["schemas"]["ReadinessResponse"] } };
    };
  };
  getSystemInfo: {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    requestBody?: never;
    responses: {
      200: { headers: Record<string, unknown>; content: { "application/json": components["schemas"]["SystemInfoResponse"] } };
    };
  };
}
