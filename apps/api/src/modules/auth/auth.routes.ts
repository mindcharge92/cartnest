import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { ApiEnvironment } from "@repo/config/api";
import {
  AcceptedResponseSchema,
  ApiErrorSchema,
  AuthSessionResponseSchema,
  GoogleOAuthStartQuerySchema,
  LoginBodySchema,
  MfaCodeBodySchema,
  MfaEnrollmentResponseSchema,
  PasswordResetConfirmBodySchema,
  PasswordResetRequestBodySchema,
  RegisterBodySchema,
  VerificationConfirmBodySchema,
  VerificationRequestBodySchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as oidc from "openid-client";
import { Type } from "typebox";
import {
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from "openid-client";
import {
  randomOpaqueToken,
  safeEqual,
  signOAuthState,
  verifyOAuthState,
} from "./auth.crypto.js";
import {
  ACCESS_COOKIE,
  AuthError,
  CSRF_COOKIE,
  GOOGLE_STATE_COOKIE,
  MFA_GRANT_COOKIE,
  REFRESH_COOKIE,
  type AuthService,
  type SessionArtifacts,
} from "./auth.service.js";

const ACCESS_MAX_AGE = 15 * 60;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;
const MFA_MAX_AGE = 8 * 60 * 60;
const OAUTH_STATE_MAX_AGE = 10 * 60;

export interface AuthRoutesOptions {
  readonly service: AuthService | undefined;
  readonly environment: ApiEnvironment;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  request.log.warn({ err: error }, "Authentication request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Authentication request failed."));
}

function serviceOrThrow(service: AuthService | undefined): AuthService {
  if (!service) throw new AuthError("AUTH_UNAVAILABLE", "Authentication storage is unavailable.", 503);
  return service;
}

function cookieOptions(environment: ApiEnvironment, httpOnly = true) {
  return { httpOnly, secure: environment.cookieSecure, sameSite: "lax" as const, path: "/" };
}

function writeSessionCookies(reply: FastifyReply, artifacts: SessionArtifacts, environment: ApiEnvironment): void {
  reply.setCookie(ACCESS_COOKIE, artifacts.accessToken, { ...cookieOptions(environment), maxAge: ACCESS_MAX_AGE });
  reply.setCookie(REFRESH_COOKIE, artifacts.refreshToken, {
    ...cookieOptions(environment),
    path: "/api/v1/auth",
    maxAge: REFRESH_MAX_AGE,
  });
  reply.setCookie(CSRF_COOKIE, artifacts.response.csrfToken, {
    ...cookieOptions(environment, false),
    maxAge: REFRESH_MAX_AGE,
  });
  if (artifacts.mfaGrantToken) {
    reply.setCookie(MFA_GRANT_COOKIE, artifacts.mfaGrantToken, { ...cookieOptions(environment), maxAge: MFA_MAX_AGE });
  } else {
    reply.clearCookie(MFA_GRANT_COOKIE, cookieOptions(environment));
  }
}

function clearSessionCookies(reply: FastifyReply, environment: ApiEnvironment): void {
  reply.clearCookie(ACCESS_COOKIE, cookieOptions(environment));
  reply.clearCookie(REFRESH_COOKIE, { ...cookieOptions(environment), path: "/api/v1/auth" });
  reply.clearCookie(CSRF_COOKIE, cookieOptions(environment, false));
  reply.clearCookie(MFA_GRANT_COOKIE, cookieOptions(environment));
}

function requireCsrf(request: FastifyRequest): void {
  const cookieToken = request.cookies[CSRF_COOKIE];
  const header = request.headers["x-csrf-token"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new AuthError("CSRF_REJECTED", "CSRF validation failed.", 403);
  }
}

async function requirePrincipal(request: FastifyRequest, service: AuthService | undefined) {
  const token = request.cookies[ACCESS_COOKIE];
  if (!token) throw new AuthError("UNAUTHENTICATED", "Authentication is required.", 401);
  return serviceOrThrow(service).verifyAccess(token);
}

export function registerSecurityPlugins(app: FastifyInstance, environment: ApiEnvironment): void {
  void app.register(cookie);
  void app.register(cors, {
    origin: [...environment.corsOrigins],
    credentials: true,
    allowedHeaders: ["content-type", "x-csrf-token", "idempotency-key"],
    methods: ["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"],
  });
  void app.register(rateLimit, { global: false });
  app.addHook("onRequest", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
    const origin = request.headers.origin;
    if (!origin) return;
    let normalized: string;
    try {
      normalized = new URL(origin).origin;
    } catch {
      return reply.code(403).send(errorBody(request, "ORIGIN_REJECTED", "Request origin is not allowed."));
    }
    if (!environment.corsOrigins.includes(normalized)) {
      return reply.code(403).send(errorBody(request, "ORIGIN_REJECTED", "Request origin is not allowed."));
    }
  });
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();
  const { environment } = options;
  let googleConfiguration: Promise<oidc.Configuration> | undefined;
  const getGoogleConfiguration = () => {
    if (!environment.googleClientId || !environment.googleClientSecret) {
      throw new AuthError("GOOGLE_OAUTH_UNAVAILABLE", "Google sign-in is not configured.", 503);
    }
    googleConfiguration ??= oidc.discovery(
      new URL("https://accounts.google.com"),
      environment.googleClientId,
      environment.googleClientSecret,
    );
    return googleConfiguration;
  };

  server.post("/api/v1/auth/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: { tags: ["auth"], operationId: "register", body: RegisterBodySchema, response: { 201: AuthSessionResponseSchema, 400: ApiErrorSchema, 409: ApiErrorSchema, 503: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      const artifacts = await serviceOrThrow(options.service).register(request.body, request.id);
      writeSessionCookies(reply, artifacts, environment);
      return reply.code(201).send(artifacts.response);
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    schema: { tags: ["auth"], operationId: "login", body: LoginBodySchema, response: { 200: AuthSessionResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 503: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      const artifacts = await serviceOrThrow(options.service).login(request.body.identifier, request.body.password, request.id);
      writeSessionCookies(reply, artifacts, environment);
      return reply.send(artifacts.response);
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/refresh", {
    config: { rateLimit: { max: 30, timeWindow: "10 minutes" } },
    schema: { tags: ["auth"], operationId: "refreshSession", response: { 200: AuthSessionResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 503: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      const refreshToken = request.cookies[REFRESH_COOKIE];
      if (!refreshToken) throw new AuthError("INVALID_SESSION", "Session has expired or is invalid.", 401);
      const artifacts = await serviceOrThrow(options.service).refresh(refreshToken, request.cookies[MFA_GRANT_COOKIE], request.id);
      writeSessionCookies(reply, artifacts, environment);
      return reply.send(artifacts.response);
    } catch (error) {
      clearSessionCookies(reply, environment);
      return sendError(request, reply, error);
    }
  });

  server.get("/api/v1/auth/session", {
    schema: { tags: ["auth"], operationId: "getCurrentSession", response: { 200: AuthSessionResponseSchema, 401: ApiErrorSchema, 503: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      const principal = await requirePrincipal(request, options.service);
      const service = serviceOrThrow(options.service);
      let csrfToken = request.cookies[CSRF_COOKIE];
      if (!csrfToken) {
        csrfToken = randomOpaqueToken();
        reply.setCookie(CSRF_COOKIE, csrfToken, { ...cookieOptions(environment, false), maxAge: REFRESH_MAX_AGE });
      }
      return reply.send(await service.currentSession(principal, csrfToken));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/logout", {
    schema: { tags: ["auth"], operationId: "logout", response: { 200: AcceptedResponseSchema, 403: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      await options.service?.logout(request.cookies[REFRESH_COOKIE], request.id);
      clearSessionCookies(reply, environment);
      return reply.send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/logout-all", {
    schema: { tags: ["auth"], operationId: "logoutAll", response: { 200: AcceptedResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      const service = serviceOrThrow(options.service);
      const principal = await requirePrincipal(request, service);
      await service.logoutAll(principal, request.id);
      clearSessionCookies(reply, environment);
      return reply.send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/password-reset/request", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    schema: { tags: ["auth"], operationId: "requestPasswordReset", body: PasswordResetRequestBodySchema, response: { 202: AcceptedResponseSchema, 503: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      const token = await serviceOrThrow(options.service).requestPasswordReset(request.body.identifier, request.id);
      if (token && environment.nodeEnv !== "production" && environment.exposeDevelopmentAuthTokens) reply.header("x-cartnest-development-token", token);
      return reply.code(202).send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/password-reset/confirm", {
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    schema: { tags: ["auth"], operationId: "confirmPasswordReset", body: PasswordResetConfirmBodySchema, response: { 200: AcceptedResponseSchema, 400: ApiErrorSchema, 503: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      await serviceOrThrow(options.service).confirmPasswordReset(request.body.token, request.body.newPassword, request.id);
      clearSessionCookies(reply, environment);
      return reply.send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/verification/request", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    schema: { tags: ["auth"], operationId: "requestIdentifierVerification", body: VerificationRequestBodySchema, response: { 202: AcceptedResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      const service = serviceOrThrow(options.service);
      const principal = await requirePrincipal(request, service);
      const token = await service.requestVerification(principal, request.body.channel, request.id);
      if (environment.nodeEnv !== "production" && environment.exposeDevelopmentAuthTokens) reply.header("x-cartnest-development-token", token);
      return reply.code(202).send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/verification/confirm", {
    schema: { tags: ["auth"], operationId: "confirmIdentifierVerification", body: VerificationConfirmBodySchema, response: { 200: AcceptedResponseSchema, 400: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      await serviceOrThrow(options.service).confirmVerification(request.body.token, request.id);
      return reply.send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/mfa/totp/enroll", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: { tags: ["auth"], operationId: "beginTotpEnrollment", response: { 200: MfaEnrollmentResponseSchema, 401: ApiErrorSchema, 403: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      const service = serviceOrThrow(options.service);
      return reply.send(await service.beginTotpEnrollment(await requirePrincipal(request, service)));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/mfa/totp/confirm", {
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    schema: { tags: ["auth"], operationId: "confirmTotpEnrollment", body: MfaCodeBodySchema, response: { 200: AcceptedResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      const service = serviceOrThrow(options.service);
      await service.confirmTotpEnrollment(await requirePrincipal(request, service), request.body.code, request.id);
      return reply.send({ accepted: true as const });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/auth/mfa/challenge", {
    config: { rateLimit: { max: 10, timeWindow: "10 minutes" } },
    schema: { tags: ["auth"], operationId: "challengeTotp", body: MfaCodeBodySchema, response: { 200: AuthSessionResponseSchema, 400: ApiErrorSchema, 401: ApiErrorSchema } },
  }, async (request, reply) => {
    try {
      requireCsrf(request);
      const service = serviceOrThrow(options.service);
      const principal = await requirePrincipal(request, service);
      const grant = await service.challengeTotp(principal, request.body.code, request.id);
      const access = await service.issueMfaSatisfiedAccess(principal);
      reply.setCookie(MFA_GRANT_COOKIE, grant, { ...cookieOptions(environment), maxAge: MFA_MAX_AGE });
      reply.setCookie(ACCESS_COOKIE, access, { ...cookieOptions(environment), maxAge: ACCESS_MAX_AGE });
      return reply.send(await service.currentSession({ ...principal, mfaSatisfied: true }, request.cookies[CSRF_COOKIE] ?? randomOpaqueToken()));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/auth/google/start", {
    config: { rateLimit: { max: 20, timeWindow: "10 minutes" } },
    schema: { hide: true, querystring: GoogleOAuthStartQuerySchema },
  }, async (request, reply) => {
    try {
      const service = serviceOrThrow(options.service);
      const intent = request.query.intent ?? "login";
      let linkUserId: string | undefined;
      if (intent === "link") linkUserId = (await requirePrincipal(request, service)).userId;
      const configuration = await getGoogleConfiguration();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const state = randomState();
      const nonce = randomNonce();
      const stateToken = await signOAuthState(environment.authJwtSecret, { state, nonce, codeVerifier, intent, linkUserId });
      reply.setCookie(GOOGLE_STATE_COOKIE, stateToken, { ...cookieOptions(environment), maxAge: OAUTH_STATE_MAX_AGE });
      const redirectTo = oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: environment.googleRedirectUri,
        scope: "openid email profile",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state,
        nonce,
        prompt: "select_account",
      });
      return reply.redirect(redirectTo.href);
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/auth/google/callback", {
    schema: { hide: true, querystring: Type.Record(Type.String(), Type.String()) },
  }, async (request, reply) => {
    try {
      const service = serviceOrThrow(options.service);
      const stateToken = request.cookies[GOOGLE_STATE_COOKIE];
      if (!stateToken) throw new AuthError("OAUTH_STATE_MISSING", "OAuth state is missing.", 400);
      const oauthState = await verifyOAuthState(environment.authJwtSecret, stateToken);
      const configuration = await getGoogleConfiguration();
      const tokens = await oidc.authorizationCodeGrant(
        configuration,
        new URL(request.url, environment.apiPublicBaseUrl),
        {
          pkceCodeVerifier: oauthState.codeVerifier,
          expectedState: oauthState.state,
          expectedNonce: oauthState.nonce,
          idTokenExpected: true,
        },
      );
      const claims = tokens.claims();
      if (!claims || typeof claims.sub !== "string" || typeof claims.email !== "string") {
        throw new AuthError("GOOGLE_IDENTITY_INVALID", "Google identity response is incomplete.", 400);
      }
      const artifacts = await service.completeGoogleLogin({
        subject: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified === true,
        ...(oauthState.linkUserId ? { linkUserId: oauthState.linkUserId } : {}),
        requestId: request.id,
      });
      writeSessionCookies(reply, artifacts, environment);
      reply.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions(environment));
      return reply.redirect(new URL("/account?oauth=success", environment.webBaseUrl).toString());
    } catch (error) {
      request.log.warn({ err: error }, "Google OAuth callback failed");
      reply.clearCookie(GOOGLE_STATE_COOKIE, cookieOptions(environment));
      return reply.redirect(new URL("/login?oauth_error=google", environment.webBaseUrl).toString());
    }
  });
}
