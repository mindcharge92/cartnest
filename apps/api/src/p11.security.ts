import type { ApiEnvironment } from "@repo/config/api";
import type { FastifyError, FastifyInstance } from "fastify";

const NO_STORE_PREFIXES = ["/api/v1/auth", "/api/v1/privacy", "/api/v1/admin"] as const;

/**
 * P11 response hardening. The API is JSON-first and is never intended to be
 * framed or execute browser script, so a restrictive API CSP is safe. The web
 * application will maintain its own CSP during the frontend hardening pass.
 */
export function registerP11SecurityHardening(
  app: FastifyInstance,
  environment: ApiEnvironment,
): void {
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("x-frame-options", "DENY");
    reply.header("referrer-policy", "no-referrer");
    reply.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (environment.nodeEnv === "production") {
      reply.header("strict-transport-security", "max-age=31536000; includeSubDomains");
    }
    if (NO_STORE_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
      reply.header("cache-control", "no-store");
      reply.header("pragma", "no-cache");
    }
    return payload;
  });

  // Replace the generic handler installed by the base app so unexpected
  // exceptions are not logged with request bodies, cookies, provider payloads,
  // or other potentially sensitive nested error properties.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request does not match the required contract.",
          requestId: request.id,
          details: error.validation,
        },
      });
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    request.log.error(
      {
        errorName: error.name,
        errorCode: typeof error.code === "string" ? error.code : undefined,
        statusCode,
        requestId: request.id,
      },
      "Unhandled request error",
    );
    return reply.code(statusCode).send({
      error: {
        code: statusCode === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: statusCode === 429 ? "Too many requests." : "An unexpected error occurred.",
        requestId: request.id,
      },
    });
  });
}
