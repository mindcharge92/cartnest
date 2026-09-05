import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorSchema,
  InitializePaymentBodySchema,
  InitializePaymentHeadersSchema,
  PaymentInitializationResponseSchema,
  PaymentIntentDetailSchema,
  PaymentIntentParamsSchema,
  ProviderWebhookAcceptedSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { PaymentError, type PaymentService } from "./payment.service.js";

export interface PaymentRoutesOptions {
  readonly service: PaymentService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof PaymentError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Payment request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Payment request failed."));
}

function paymentServiceOrThrow(service: PaymentService | undefined): PaymentService {
  if (!service) throw new PaymentError("PAYMENT_SERVICE_UNAVAILABLE", "Payment storage is unavailable.", 503);
  return service;
}

function authServiceOrThrow(service: AuthService | undefined): AuthService {
  if (!service) throw new AuthError("AUTH_UNAVAILABLE", "Authentication storage is unavailable.", 503);
  return service;
}

const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  502: ApiErrorSchema,
  503: ApiErrorSchema,
};

function rawBody(request: FastifyRequest): Buffer {
  const value = request.rawBody;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new PaymentError("RAW_WEBHOOK_BODY_UNAVAILABLE", "Webhook raw body is unavailable.", 400);
}

export function registerPaymentRoutes(app: FastifyInstance, options: PaymentRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.post(
    "/api/v1/payment-intents/:paymentIntentId/initialize",
    {
      schema: {
        tags: ["payments"],
        operationId: "initializePayment",
        params: PaymentIntentParamsSchema,
        headers: InitializePaymentHeadersSchema,
        body: InitializePaymentBodySchema,
        response: { 200: PaymentInitializationResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await paymentServiceOrThrow(options.service).initialize(
            principal,
            request.params.paymentIntentId,
            request.body,
            request.headers["idempotency-key"],
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/payment-intents/:paymentIntentId",
    {
      schema: {
        tags: ["payments"],
        operationId: "getPaymentIntent",
        params: PaymentIntentParamsSchema,
        response: { 200: PaymentIntentDetailSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await paymentServiceOrThrow(options.service).getIntent(principal, request.params.paymentIntentId),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/payment-intents/:paymentIntentId/reconcile",
    {
      schema: {
        tags: ["payments"],
        operationId: "reconcilePaymentIntent",
        params: PaymentIntentParamsSchema,
        response: { 200: PaymentIntentDetailSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await paymentServiceOrThrow(options.service).reconcileOwnedIntent(
            principal,
            request.params.paymentIntentId,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/webhooks/paystack",
    {
      config: { rawBody: true },
      schema: {
        tags: ["payments"],
        operationId: "receivePaystackWebhook",
        response: { 200: ProviderWebhookAcceptedSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const signature = request.headers["x-paystack-signature"];
        await paymentServiceOrThrow(options.service).handleWebhook(
          "PAYSTACK",
          rawBody(request),
          typeof signature === "string" ? signature : undefined,
        );
        return reply.send({ received: true as const });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/webhooks/flutterwave",
    {
      config: { rawBody: true },
      schema: {
        tags: ["payments"],
        operationId: "receiveFlutterwaveWebhook",
        response: { 200: ProviderWebhookAcceptedSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const signature = request.headers["flutterwave-signature"];
        await paymentServiceOrThrow(options.service).handleWebhook(
          "FLUTTERWAVE",
          rawBody(request),
          typeof signature === "string" ? signature : undefined,
        );
        return reply.send({ received: true as const });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
