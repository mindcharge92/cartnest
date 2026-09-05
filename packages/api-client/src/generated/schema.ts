// Bootstrap snapshot through P2. Regenerate with `pnpm api:generate` once CI/dependency execution is available.
// This file remains generated-output shaped so frontend code never duplicates endpoint contracts.

type EmptyParameters = { query?: never; header?: never; path?: never; cookie?: never };
type JsonResponse<T> = { headers: Record<string, unknown>; content: { "application/json": T } };
type JsonRequest<T> = { content: { "application/json": T } };

export interface paths {
  "/health": { parameters: EmptyParameters; get: operations["getHealth"] };
  "/ready": { parameters: EmptyParameters; get: operations["getReadiness"] };
  "/api/v1/system/info": { parameters: EmptyParameters; get: operations["getSystemInfo"] };
  "/api/v1/auth/register": { parameters: EmptyParameters; post: operations["register"] };
  "/api/v1/auth/login": { parameters: EmptyParameters; post: operations["login"] };
  "/api/v1/auth/refresh": { parameters: EmptyParameters; post: operations["refreshSession"] };
  "/api/v1/auth/session": { parameters: EmptyParameters; get: operations["getCurrentSession"] };
  "/api/v1/auth/logout": { parameters: EmptyParameters; post: operations["logout"] };
  "/api/v1/auth/logout-all": { parameters: EmptyParameters; post: operations["logoutAll"] };
  "/api/v1/auth/password-reset/request": { parameters: EmptyParameters; post: operations["requestPasswordReset"] };
  "/api/v1/auth/password-reset/confirm": { parameters: EmptyParameters; post: operations["confirmPasswordReset"] };
  "/api/v1/auth/verification/request": { parameters: EmptyParameters; post: operations["requestIdentifierVerification"] };
  "/api/v1/auth/verification/confirm": { parameters: EmptyParameters; post: operations["confirmIdentifierVerification"] };
  "/api/v1/auth/mfa/totp/enroll": { parameters: EmptyParameters; post: operations["beginTotpEnrollment"] };
  "/api/v1/auth/mfa/totp/confirm": { parameters: EmptyParameters; post: operations["confirmTotpEnrollment"] };
  "/api/v1/auth/mfa/challenge": { parameters: EmptyParameters; post: operations["challengeTotp"] };
}

export interface components {
  schemas: {
    ApiError: {
      error: { code: string; message: string; requestId: string; details?: unknown };
    };
    AuthUser: {
      id: string;
      email: string | null;
      phone: string | null;
      emailVerified: boolean;
      phoneVerified: boolean;
      status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED";
      platformRole: "USER" | "ADMIN" | "SUPER_ADMIN";
    };
    AuthSession: {
      user: components["schemas"]["AuthUser"];
      accessExpiresAt: string;
      refreshExpiresAt: string;
      csrfToken: string;
      mfa: { required: boolean; enrolled: boolean; satisfied: boolean };
    };
    Accepted: { accepted: true };
    MfaEnrollment: { otpauthUri: string; secret: string };
    HealthResponse: { status: "ok"; service: "cartnest-api"; uptimeSeconds: number };
    ReadinessResponse: {
      status: "ready" | "not-ready";
      service: "cartnest-api";
      dependencies: { database: "ready" | "unavailable"; redis: "ready" | "unavailable" };
    };
    SystemInfoResponse: {
      service: "cartnest-api";
      apiVersion: "v1";
      timestamp: string;
      dependencies: { database: "ready" | "unavailable"; redis: "ready" | "unavailable" };
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}

type ErrorResponse = JsonResponse<components["schemas"]["ApiError"]>;
type SessionResponse = JsonResponse<components["schemas"]["AuthSession"]>;
type AcceptedResponse = JsonResponse<components["schemas"]["Accepted"]>;

export interface operations {
  getHealth: { parameters: EmptyParameters; requestBody?: never; responses: { 200: JsonResponse<components["schemas"]["HealthResponse"]> } };
  getReadiness: { parameters: EmptyParameters; requestBody?: never; responses: { 200: JsonResponse<components["schemas"]["ReadinessResponse"]>; 503: JsonResponse<components["schemas"]["ReadinessResponse"]> } };
  getSystemInfo: { parameters: EmptyParameters; requestBody?: never; responses: { 200: JsonResponse<components["schemas"]["SystemInfoResponse"]> } };
  register: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ email?: string; phone?: string; password: string }>;
    responses: { 201: SessionResponse; 400: ErrorResponse; 409: ErrorResponse; 503: ErrorResponse };
  };
  login: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ identifier: string; password: string }>;
    responses: { 200: SessionResponse; 401: ErrorResponse; 403: ErrorResponse; 503: ErrorResponse };
  };
  refreshSession: { parameters: EmptyParameters; requestBody?: never; responses: { 200: SessionResponse; 401: ErrorResponse; 403: ErrorResponse; 503: ErrorResponse } };
  getCurrentSession: { parameters: EmptyParameters; requestBody?: never; responses: { 200: SessionResponse; 401: ErrorResponse; 503: ErrorResponse } };
  logout: { parameters: EmptyParameters; requestBody?: never; responses: { 200: AcceptedResponse; 403: ErrorResponse } };
  logoutAll: { parameters: EmptyParameters; requestBody?: never; responses: { 200: AcceptedResponse; 401: ErrorResponse; 403: ErrorResponse } };
  requestPasswordReset: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ identifier: string }>;
    responses: { 202: AcceptedResponse; 503: ErrorResponse };
  };
  confirmPasswordReset: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ token: string; newPassword: string }>;
    responses: { 200: AcceptedResponse; 400: ErrorResponse; 503: ErrorResponse };
  };
  requestIdentifierVerification: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ channel: "email" | "phone" }>;
    responses: { 202: AcceptedResponse; 400: ErrorResponse; 401: ErrorResponse; 403: ErrorResponse };
  };
  confirmIdentifierVerification: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ token: string }>;
    responses: { 200: AcceptedResponse; 400: ErrorResponse };
  };
  beginTotpEnrollment: {
    parameters: EmptyParameters;
    requestBody?: never;
    responses: { 200: JsonResponse<components["schemas"]["MfaEnrollment"]>; 401: ErrorResponse; 403: ErrorResponse };
  };
  confirmTotpEnrollment: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ code: string }>;
    responses: { 200: AcceptedResponse; 400: ErrorResponse; 401: ErrorResponse };
  };
  challengeTotp: {
    parameters: EmptyParameters;
    requestBody: JsonRequest<{ code: string }>;
    responses: { 200: SessionResponse; 400: ErrorResponse; 401: ErrorResponse };
  };
}
