import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorSchema,
  CreateShipmentBodySchema,
  FulfillmentProfileBodySchema,
  FulfillmentProfileSchema,
  LogisticsStationListResponseSchema,
  OrderIdParamsSchema,
  ShipmentIdParamsSchema,
  ShipmentListResponseSchema,
  ShipmentSchema,
  ShippingQuoteRequestSchema,
  ShippingQuoteResponseSchema,
  StoreFulfillmentParamsSchema,
  UpdateShipmentStatusBodySchema,
  VariantShippingParamsSchema,
  VariantShippingProfileBodySchema,
  VariantShippingProfileSchema,
  VendorOrderShipmentParamsSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import type { BuyerLogisticsQueryService } from "./logistics.query.js";
import { LogisticsError, type LogisticsService } from "./logistics.service.js";

export interface LogisticsRoutesOptions {
  readonly service: LogisticsService | undefined;
  readonly buyerQueryService: BuyerLogisticsQueryService | undefined;
  readonly authService: AuthService | undefined;
}

function body(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof LogisticsError || error instanceof AuthError || error instanceof AuthorizationError) {
    return reply.code(error.statusCode).send(body(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Logistics request failed");
  return reply.code(500).send(body(request, "INTERNAL_ERROR", "Logistics request failed."));
}

function serviceOrThrow(service: LogisticsService | undefined): LogisticsService {
  if (!service) throw new LogisticsError("LOGISTICS_UNAVAILABLE", "Logistics storage is unavailable.", 503);
  return service;
}

function buyerServiceOrThrow(service: BuyerLogisticsQueryService | undefined): BuyerLogisticsQueryService {
  if (!service) throw new LogisticsError("LOGISTICS_UNAVAILABLE", "Logistics storage is unavailable.", 503);
  return service;
}

function authOrThrow(service: AuthService | undefined): AuthService {
  if (!service) throw new AuthError("AUTH_UNAVAILABLE", "Authentication storage is unavailable.", 503);
  return service;
}

const errors = { 400: ApiErrorSchema, 401: ApiErrorSchema, 403: ApiErrorSchema, 404: ApiErrorSchema, 409: ApiErrorSchema, 503: ApiErrorSchema };

export function registerLogisticsRoutes(app: FastifyInstance, options: LogisticsRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get("/api/v1/stores/:storeId/fulfillment-profile", {
    schema: { tags: ["logistics"], operationId: "getStoreFulfillmentProfile", params: StoreFulfillmentParamsSchema, response: { 200: FulfillmentProfileSchema, ...errors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).getStoreProfile(principal, request.params.storeId));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.put("/api/v1/stores/:storeId/fulfillment-profile", {
    schema: { tags: ["logistics"], operationId: "updateStoreFulfillmentProfile", params: StoreFulfillmentParamsSchema, body: FulfillmentProfileBodySchema, response: { 200: FulfillmentProfileSchema, ...errors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).updateStoreProfile(principal, request.params.storeId, request.body));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/variants/:variantId/shipping-profile", {
    schema: { tags: ["logistics"], operationId: "getVariantShippingProfile", params: VariantShippingParamsSchema, response: { 200: VariantShippingProfileSchema, ...errors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).getVariantProfile(principal, request.params.variantId));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.put("/api/v1/variants/:variantId/shipping-profile", {
    schema: { tags: ["logistics"], operationId: "updateVariantShippingProfile", params: VariantShippingParamsSchema, body: VariantShippingProfileBodySchema, response: { 200: VariantShippingProfileSchema, ...errors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).updateVariantProfile(principal, request.params.variantId, request.body));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/logistics/stations", {
    schema: { tags: ["logistics"], operationId: "listLogisticsStations", response: { 200: LogisticsStationListResponseSchema, ...errors } },
  }, async (request, reply) => {
    try {
      await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).listStations());
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/logistics/quotes", {
    schema: { tags: ["logistics"], operationId: "quoteCartShipping", body: ShippingQuoteRequestSchema, response: { 200: ShippingQuoteResponseSchema, ...errors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).quoteCart(principal, request.body));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/vendor-orders/:vendorOrderId/shipments", {
    schema: { tags: ["logistics"], operationId: "createShipment", params: VendorOrderShipmentParamsSchema, body: CreateShipmentBodySchema, response: { 201: ShipmentSchema, ...errors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.code(201).send(await serviceOrThrow(options.service).createShipment(principal, request.params.vendorOrderId, request.body));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/vendor-orders/:vendorOrderId/shipments", {
    schema: { tags: ["logistics"], operationId: "listVendorOrderShipments", params: VendorOrderShipmentParamsSchema, response: { 200: ShipmentListResponseSchema, ...errors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send({ items: await serviceOrThrow(options.service).listShipments(principal, request.params.vendorOrderId) });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/orders/:orderId/shipments", {
    schema: { tags: ["logistics"], operationId: "listBuyerOrderShipments", params: OrderIdParamsSchema, response: { 200: ShipmentListResponseSchema, ...errors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send({ items: await buyerServiceOrThrow(options.buyerQueryService).listOrderShipments(principal, request.params.orderId) });
    } catch (error) { return sendError(request, reply, error); }
  });

  server.get("/api/v1/shipments/:shipmentId", {
    schema: { tags: ["logistics"], operationId: "getBuyerShipment", params: ShipmentIdParamsSchema, response: { 200: ShipmentSchema, ...errors } },
  }, async (request, reply) => {
    try {
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await buyerServiceOrThrow(options.buyerQueryService).getShipment(principal, request.params.shipmentId));
    } catch (error) { return sendError(request, reply, error); }
  });

  server.post("/api/v1/shipments/:shipmentId/status", {
    schema: { tags: ["logistics"], operationId: "updateManualShipmentStatus", params: ShipmentIdParamsSchema, body: UpdateShipmentStatusBodySchema, response: { 200: ShipmentSchema, ...errors } },
  }, async (request, reply) => {
    try {
      requireCsrfToken(request);
      const principal = await requireAccessPrincipal(request, authOrThrow(options.authService));
      return reply.send(await serviceOrThrow(options.service).recordManualStatus(principal, request.params.shipmentId, request.body.status, request.body.message));
    } catch (error) { return sendError(request, reply, error); }
  });
}
