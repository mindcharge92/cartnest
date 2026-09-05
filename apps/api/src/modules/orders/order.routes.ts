import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorSchema,
  CancelOrderBodySchema,
  CheckoutBodySchema,
  CheckoutHeadersSchema,
  OrderIdParamsSchema,
  OrderListQuerySchema,
  OrderListResponseSchema,
  OrderSchema,
  StoreVendorOrderParamsSchema,
  VendorOrderIdParamsSchema,
  VendorOrderListQuerySchema,
  VendorOrderListResponseSchema,
  VendorOrderSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { OrderError, type OrderService } from "./order.service.js";

export interface OrderRoutesOptions {
  readonly service: OrderService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof OrderError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Order request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Order request failed."));
}

function orderServiceOrThrow(service: OrderService | undefined): OrderService {
  if (!service) throw new OrderError("ORDER_SERVICE_UNAVAILABLE", "Order storage is unavailable.", 503);
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
  503: ApiErrorSchema,
};

export function registerOrderRoutes(app: FastifyInstance, options: OrderRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.post(
    "/api/v1/checkout",
    {
      schema: {
        tags: ["checkout"],
        operationId: "createCheckoutOrder",
        headers: CheckoutHeadersSchema,
        body: CheckoutBodySchema,
        response: { 200: OrderSchema, 201: OrderSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        const result = await orderServiceOrThrow(options.service).checkout(
          principal,
          request.body,
          request.headers["idempotency-key"],
        );
        return reply.code(result.statusCode).send(result.order);
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/orders",
    {
      schema: {
        tags: ["orders"],
        operationId: "listOrders",
        querystring: OrderListQuerySchema,
        response: { 200: OrderListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await orderServiceOrThrow(options.service).listOrders(principal, request.query));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/orders/:orderId",
    {
      schema: {
        tags: ["orders"],
        operationId: "getOrder",
        params: OrderIdParamsSchema,
        response: { 200: OrderSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await orderServiceOrThrow(options.service).getOrder(principal, request.params.orderId));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/orders/:orderId/cancel",
    {
      schema: {
        tags: ["orders"],
        operationId: "cancelOrder",
        params: OrderIdParamsSchema,
        body: CancelOrderBodySchema,
        response: { 200: OrderSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await orderServiceOrThrow(options.service).cancelOrder(principal, request.params.orderId, request.body),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/stores/:storeId/vendor-orders",
    {
      schema: {
        tags: ["vendor-orders"],
        operationId: "listStoreVendorOrders",
        params: StoreVendorOrderParamsSchema,
        querystring: VendorOrderListQuerySchema,
        response: { 200: VendorOrderListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await orderServiceOrThrow(options.service).listStoreVendorOrders(
            principal,
            request.params.storeId,
            request.query,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendor-orders/:vendorOrderId",
    {
      schema: {
        tags: ["vendor-orders"],
        operationId: "getVendorOrder",
        params: VendorOrderIdParamsSchema,
        response: { 200: VendorOrderSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await orderServiceOrThrow(options.service).getVendorOrder(principal, request.params.vendorOrderId),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/vendor-orders/:vendorOrderId/cancel",
    {
      schema: {
        tags: ["vendor-orders"],
        operationId: "cancelVendorOrder",
        params: VendorOrderIdParamsSchema,
        body: CancelOrderBodySchema,
        response: { 200: VendorOrderSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await orderServiceOrThrow(options.service).cancelVendorOrder(
            principal,
            request.params.vendorOrderId,
            request.body,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
