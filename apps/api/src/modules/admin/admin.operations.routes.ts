import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AdminOrderOperationsDetailSchema,
  AdminOrderOperationsParamsSchema,
  ApiErrorSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  type AuthService,
} from "../auth/auth.public.js";
import { AdminError } from "./admin.service.js";
import type { AdminOperationsService } from "./admin.operations.service.js";

export interface AdminOperationsRoutesOptions {
  readonly service: AdminOperationsService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof AdminError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Admin operations request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Admin operations request failed."));
}

function serviceOrThrow(service: AdminOperationsService | undefined): AdminOperationsService {
  if (!service) throw new AdminError("ADMIN_SERVICE_UNAVAILABLE", "Admin storage is unavailable.", 503);
  return service;
}

function authServiceOrThrow(service: AuthService | undefined): AuthService {
  if (!service) throw new AuthError("AUTH_UNAVAILABLE", "Authentication storage is unavailable.", 503);
  return service;
}

export function registerAdminOperationsRoutes(
  app: FastifyInstance,
  options: AdminOperationsRoutesOptions,
): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();
  server.get(
    "/api/v1/admin/orders/:orderId/operations",
    {
      schema: {
        tags: ["admin"],
        operationId: "getAdminOrderOperations",
        params: AdminOrderOperationsParamsSchema,
        response: {
          200: AdminOrderOperationsDetailSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
          404: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await serviceOrThrow(options.service).getOrderOperations(principal, request.params.orderId),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
