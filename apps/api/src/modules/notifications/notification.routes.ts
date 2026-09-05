import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AcceptedResponseSchema,
  ApiErrorSchema,
  NotificationIdParamsSchema,
  NotificationListQuerySchema,
  NotificationListResponseSchema,
  NotificationPreferenceListResponseSchema,
  NotificationPreferenceSchema,
  NotificationSchema,
  OperationalNotificationListResponseSchema,
  OperationalNotificationQuerySchema,
  UpdateNotificationPreferenceBodySchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { NotificationError, type NotificationService } from "./notification.service.js";

export interface NotificationRoutesOptions {
  readonly service: NotificationService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof NotificationError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Notification request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Notification request failed."));
}

function notificationServiceOrThrow(service: NotificationService | undefined): NotificationService {
  if (!service) throw new NotificationError("NOTIFICATION_SERVICE_UNAVAILABLE", "Notification storage is unavailable.", 503);
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

export function registerNotificationRoutes(
  app: FastifyInstance,
  options: NotificationRoutesOptions,
): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    "/api/v1/notifications",
    {
      schema: {
        tags: ["notifications"],
        operationId: "listMyNotifications",
        querystring: NotificationListQuerySchema,
        response: { 200: NotificationListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await notificationServiceOrThrow(options.service).listUserNotifications(principal, request.query),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/notifications/:notificationId/read",
    {
      schema: {
        tags: ["notifications"],
        operationId: "markNotificationRead",
        params: NotificationIdParamsSchema,
        response: { 200: NotificationSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await notificationServiceOrThrow(options.service).markRead(
            principal,
            request.params.notificationId,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/notification-preferences",
    {
      schema: {
        tags: ["notifications"],
        operationId: "listNotificationPreferences",
        response: { 200: NotificationPreferenceListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(await notificationServiceOrThrow(options.service).listPreferences(principal));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.put(
    "/api/v1/notification-preferences",
    {
      schema: {
        tags: ["notifications"],
        operationId: "updateNotificationPreference",
        body: UpdateNotificationPreferenceBodySchema,
        response: { 200: NotificationPreferenceSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await notificationServiceOrThrow(options.service).updatePreference(principal, request.body),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/admin/notifications",
    {
      schema: {
        tags: ["admin", "notifications"],
        operationId: "listOperationalNotifications",
        querystring: OperationalNotificationQuerySchema,
        response: { 200: OperationalNotificationListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        return reply.send(
          await notificationServiceOrThrow(options.service).listOperational(principal, request.query),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/admin/notifications/:notificationId/retry",
    {
      schema: {
        tags: ["admin", "notifications"],
        operationId: "retryOperationalNotification",
        params: NotificationIdParamsSchema,
        response: { 202: AcceptedResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
        await notificationServiceOrThrow(options.service).retryOperational(
          principal,
          request.params.notificationId,
        );
        return reply.code(202).send({ accepted: true as const });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
