import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AdminListQuerySchema,
  AdminOrderListResponseSchema,
  AdminPaymentListResponseSchema,
  AdminUserListResponseSchema,
  AnalyticsRangeQuerySchema,
  ApiErrorSchema,
  CreatePromotionBodySchema,
  CreateTaxRateBodySchema,
  PlatformAnalyticsSchema,
  PromotionIdParamsSchema,
  PromotionListResponseSchema,
  PromotionSchema,
  StoreAnalyticsParamsSchema,
  StoreAnalyticsSchema,
  TaxRateIdParamsSchema,
  TaxRateListResponseSchema,
  TaxRateSchema,
  UpdatePromotionStatusBodySchema,
  UpdateTaxRateBodySchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { AdminError, type AdminService } from "./admin.service.js";

export interface AdminRoutesOptions {
  readonly service: AdminService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof AdminError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Admin request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Admin request failed."));
}

function adminServiceOrThrow(service: AdminService | undefined): AdminService {
  if (!service) throw new AdminError("ADMIN_SERVICE_UNAVAILABLE", "Admin storage is unavailable.", 503);
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

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get("/api/v1/admin/analytics", {
    schema: { tags: ["admin"], operationId: "getPlatformAnalytics", querystring: AnalyticsRangeQuerySchema, response: { 200: PlatformAnalyticsSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).platformAnalytics(principal, request.query));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/stores/:storeId/analytics", {
    schema: { tags: ["analytics"], operationId: "getStoreAnalytics", params: StoreAnalyticsParamsSchema, querystring: AnalyticsRangeQuerySchema, response: { 200: StoreAnalyticsSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).storeAnalytics(principal, request.params.storeId, request.query));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/admin/users", {
    schema: { tags: ["admin"], operationId: "listAdminUsers", querystring: AdminListQuerySchema, response: { 200: AdminUserListResponseSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).listUsers(principal, request.query));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/admin/orders", {
    schema: { tags: ["admin"], operationId: "listAdminOrders", querystring: AdminListQuerySchema, response: { 200: AdminOrderListResponseSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).listOrders(principal, request.query));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/admin/payment-intents", {
    schema: { tags: ["admin"], operationId: "listAdminPayments", querystring: AdminListQuerySchema, response: { 200: AdminPaymentListResponseSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).listPayments(principal, request.query));
    } catch (error) { return sendError(request, reply, error); }
  });

  // Refund listing and lifecycle administration are registered by the returns/refunds
  // module so the richer status-filtered refund contract has one authoritative route.

  server.get("/api/v1/admin/tax-rates", {
    schema: { tags: ["admin"], operationId: "listTaxRates", response: { 200: TaxRateListResponseSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).listTaxRates(principal));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/admin/tax-rates", {
    schema: { tags: ["admin"], operationId: "createTaxRate", body: CreateTaxRateBodySchema, response: { 201: TaxRateSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.code(201).send(await adminServiceOrThrow(options.service).createTaxRate(principal, request.body));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.patch("/api/v1/admin/tax-rates/:taxRateId", {
    schema: { tags: ["admin"], operationId: "updateTaxRate", params: TaxRateIdParamsSchema, body: UpdateTaxRateBodySchema, response: { 200: TaxRateSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).setTaxRateActive(principal, request.params.taxRateId, request.body.active));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/admin/promotions", {
    schema: { tags: ["admin"], operationId: "listPromotions", response: { 200: PromotionListResponseSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).listPromotions(principal));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/admin/promotions", {
    schema: { tags: ["admin"], operationId: "createPromotion", body: CreatePromotionBodySchema, response: { 201: PromotionSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.code(201).send(await adminServiceOrThrow(options.service).createPromotion(principal, request.body));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.patch("/api/v1/admin/promotions/:promotionId/status", {
    schema: { tags: ["admin"], operationId: "updatePromotionStatus", params: PromotionIdParamsSchema, body: UpdatePromotionStatusBodySchema, response: { 200: PromotionSchema, ...commonErrors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authServiceOrThrow(options.authService));
      return reply.send(await adminServiceOrThrow(options.service).setPromotionStatus(principal, request.params.promotionId, request.body.status));
    } catch (error) { return sendError(request, reply, error); }
  });
}
