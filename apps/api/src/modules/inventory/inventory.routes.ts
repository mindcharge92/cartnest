import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AdjustInventoryBodySchema,
  ApiErrorSchema,
  InventoryAdjustmentListResponseSchema,
  InventoryItemSchema,
  InventoryListResponseSchema,
  StoreInventoryParamsSchema,
  VariantInventoryParamsSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { VendorAuthorizationError } from "../vendors/vendor.authorization.js";
import { InventoryError, type InventoryService } from "./inventory.service.js";

export interface InventoryRoutesOptions {
  readonly service: InventoryService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (
    error instanceof InventoryError ||
    error instanceof VendorAuthorizationError ||
    error instanceof AuthError ||
    error instanceof AuthorizationError
  ) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Inventory request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Inventory request failed."));
}

function inventoryServiceOrThrow(service: InventoryService | undefined): InventoryService {
  if (!service) throw new InventoryError("INVENTORY_SERVICE_UNAVAILABLE", "Inventory storage is unavailable.", 503);
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

export function registerInventoryRoutes(app: FastifyInstance, options: InventoryRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    "/api/v1/stores/:storeId/inventory",
    {
      schema: {
        tags: ["inventory"],
        operationId: "listStoreInventory",
        params: StoreInventoryParamsSchema,
        response: { 200: InventoryListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const auth = authServiceOrThrow(options.authService);
        const principal = await requireAccessPrincipal(request, auth);
        const service = inventoryServiceOrThrow(options.service);
        return reply.send({ items: await service.listStoreInventory(principal, request.params.storeId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/inventory/:variantId",
    {
      schema: {
        tags: ["inventory"],
        operationId: "getVariantInventory",
        params: VariantInventoryParamsSchema,
        response: { 200: InventoryItemSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const auth = authServiceOrThrow(options.authService);
        const principal = await requireAccessPrincipal(request, auth);
        const service = inventoryServiceOrThrow(options.service);
        return reply.send(await service.getVariantInventory(principal, request.params.variantId));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/inventory/:variantId/adjust",
    {
      config: { rateLimit: { max: 120, timeWindow: "1 hour" } },
      schema: {
        tags: ["inventory"],
        operationId: "adjustVariantInventory",
        params: VariantInventoryParamsSchema,
        body: AdjustInventoryBodySchema,
        response: { 200: InventoryItemSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const auth = authServiceOrThrow(options.authService);
        const principal = await requireAccessPrincipal(request, auth);
        const service = inventoryServiceOrThrow(options.service);
        return reply.send(
          await service.adjustInventory(principal, request.params.variantId, request.body, request.id),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/inventory/:variantId/adjustments",
    {
      schema: {
        tags: ["inventory"],
        operationId: "listVariantInventoryAdjustments",
        params: VariantInventoryParamsSchema,
        response: { 200: InventoryAdjustmentListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const auth = authServiceOrThrow(options.authService);
        const principal = await requireAccessPrincipal(request, auth);
        const service = inventoryServiceOrThrow(options.service);
        return reply.send({ items: await service.listAdjustments(principal, request.params.variantId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
