import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AddCartItemBodySchema,
  ApiErrorSchema,
  CartItemParamsSchema,
  CartResponseSchema,
  CheckoutPreviewResponseSchema,
  UpdateCartItemBodySchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { CartError, type CartService } from "./cart.service.js";

export interface CartRoutesOptions {
  readonly service: CartService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof CartError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Cart request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Cart request failed."));
}

function cartServiceOrThrow(service: CartService | undefined): CartService {
  if (!service) throw new CartError("CART_SERVICE_UNAVAILABLE", "Cart storage is unavailable.", 503);
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

export function registerCartRoutes(app: FastifyInstance, options: CartRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    "/api/v1/cart",
    {
      schema: {
        tags: ["cart"],
        operationId: "getCart",
        response: { 200: CartResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await cartServiceOrThrow(options.service).getCart(principal));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/cart/items",
    {
      schema: {
        tags: ["cart"],
        operationId: "addCartItem",
        body: AddCartItemBodySchema,
        response: { 200: CartResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await cartServiceOrThrow(options.service).addItem(principal, request.body));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/cart/items/:cartItemId",
    {
      schema: {
        tags: ["cart"],
        operationId: "updateCartItem",
        params: CartItemParamsSchema,
        body: UpdateCartItemBodySchema,
        response: { 200: CartResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await cartServiceOrThrow(options.service).updateItem(
            principal,
            request.params.cartItemId,
            request.body,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.delete(
    "/api/v1/cart/items/:cartItemId",
    {
      schema: {
        tags: ["cart"],
        operationId: "removeCartItem",
        params: CartItemParamsSchema,
        response: { 200: CartResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await cartServiceOrThrow(options.service).removeItem(principal, request.params.cartItemId),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/checkout/preview",
    {
      schema: {
        tags: ["cart"],
        operationId: "previewCheckout",
        response: { 200: CheckoutPreviewResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await cartServiceOrThrow(options.service).previewCheckout(principal));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
