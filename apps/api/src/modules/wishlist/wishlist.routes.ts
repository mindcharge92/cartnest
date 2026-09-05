import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AddWishlistItemBodySchema,
  ApiErrorSchema,
  WishlistItemParamsSchema,
  WishlistResponseSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { WishlistError, type WishlistService } from "./wishlist.service.js";

export interface WishlistRoutesOptions {
  readonly service: WishlistService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof WishlistError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Wishlist request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Wishlist request failed."));
}

function wishlistServiceOrThrow(service: WishlistService | undefined): WishlistService {
  if (!service) throw new WishlistError("WISHLIST_SERVICE_UNAVAILABLE", "Wishlist storage is unavailable.", 503);
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

export function registerWishlistRoutes(app: FastifyInstance, options: WishlistRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    "/api/v1/wishlist",
    {
      schema: {
        tags: ["wishlist"],
        operationId: "getWishlist",
        response: { 200: WishlistResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await wishlistServiceOrThrow(options.service).getWishlist(principal));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/wishlist/items",
    {
      schema: {
        tags: ["wishlist"],
        operationId: "addWishlistItem",
        body: AddWishlistItemBodySchema,
        response: { 200: WishlistResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await wishlistServiceOrThrow(options.service).addItem(principal, request.body));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.delete(
    "/api/v1/wishlist/items/:wishlistItemId",
    {
      schema: {
        tags: ["wishlist"],
        operationId: "removeWishlistItem",
        params: WishlistItemParamsSchema,
        response: { 200: WishlistResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await wishlistServiceOrThrow(options.service).removeItem(principal, request.params.wishlistItemId),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
