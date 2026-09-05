import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AcceptedResponseSchema,
  AdminVendorListQuerySchema,
  ApiErrorSchema,
  CreateStoreBodySchema,
  CreateVendorBodySchema,
  InviteVendorMemberBodySchema,
  PaymentProviderAccountListResponseSchema,
  PaymentProviderAccountSchema,
  ProviderAccountParamsSchema,
  RecordPaymentProviderAccountBodySchema,
  ReviewVendorBodySchema,
  ReviewVendorVerificationBodySchema,
  StoreIdParamsSchema,
  StoreListResponseSchema,
  StoreSchema,
  SubmitVendorVerificationBodySchema,
  UpdateProviderAccountStatusBodySchema,
  UpdateStoreBodySchema,
  UpdateVendorMemberBodySchema,
  VendorAccessListResponseSchema,
  VendorAccessSchema,
  VendorIdParamsSchema,
  VendorListResponseSchema,
  VendorMemberListResponseSchema,
  VendorMemberParamsSchema,
  VendorMemberSchema,
  VendorMembershipSchema,
  VendorSchema,
  VendorVerificationIdParamsSchema,
  VendorVerificationListResponseSchema,
  VendorVerificationSchema,
} from "@repo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AuthError,
  AuthorizationError,
  requireAccessPrincipal,
  requireCsrfToken,
  type AuthService,
} from "../auth/auth.public.js";
import { VendorAuthorizationError } from "./vendor.authorization.js";
import { VendorError, type VendorService } from "./vendor.service.js";

export interface VendorRoutesOptions {
  readonly service: VendorService | undefined;
  readonly authService: AuthService | undefined;
}

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (
    error instanceof VendorError ||
    error instanceof VendorAuthorizationError ||
    error instanceof AuthError ||
    error instanceof AuthorizationError
  ) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Vendor request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Vendor request failed."));
}

function vendorServiceOrThrow(service: VendorService | undefined): VendorService {
  if (!service) throw new VendorError("VENDOR_SERVICE_UNAVAILABLE", "Vendor storage is unavailable.", 503);
  return service;
}

function authServiceOrThrow(service: AuthService | undefined): AuthService {
  if (!service) throw new AuthError("AUTH_UNAVAILABLE", "Authentication storage is unavailable.", 503);
  return service;
}

async function authenticatedPrincipal(request: FastifyRequest, options: VendorRoutesOptions) {
  return requireAccessPrincipal(request, authServiceOrThrow(options.authService));
}

const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  503: ApiErrorSchema,
};

export function registerVendorRoutes(app: FastifyInstance, options: VendorRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.post(
    "/api/v1/vendors",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 day" } },
      schema: {
        tags: ["vendors"],
        operationId: "createVendorApplication",
        body: CreateVendorBodySchema,
        response: { 201: VendorAccessSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.code(201).send(await service.createVendor(principal, request.body, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendors/me",
    {
      schema: {
        tags: ["vendors"],
        operationId: "listMyVendorAccess",
        response: { 200: VendorAccessListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send({ items: await service.listMyVendors(principal) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendors/:vendorId",
    {
      schema: {
        tags: ["vendors"],
        operationId: "getVendorAccess",
        params: VendorIdParamsSchema,
        response: { 200: VendorAccessSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(await service.getVendor(principal, request.params.vendorId));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendors/:vendorId/verifications",
    {
      schema: {
        tags: ["vendors"],
        operationId: "listVendorVerifications",
        params: VendorIdParamsSchema,
        response: { 200: VendorVerificationListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send({ items: await service.listVerifications(principal, request.params.vendorId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/vendors/:vendorId/verifications",
    {
      schema: {
        tags: ["vendors"],
        operationId: "submitVendorVerification",
        params: VendorIdParamsSchema,
        body: SubmitVendorVerificationBodySchema,
        response: { 201: VendorVerificationSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply
          .code(201)
          .send(
            await service.submitVerification(
              principal,
              request.params.vendorId,
              request.body,
              request.id,
            ),
          );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendors/:vendorId/stores",
    {
      schema: {
        tags: ["vendors"],
        operationId: "listVendorStores",
        params: VendorIdParamsSchema,
        response: { 200: StoreListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send({ items: await service.listStores(principal, request.params.vendorId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/vendors/:vendorId/stores",
    {
      schema: {
        tags: ["vendors"],
        operationId: "createVendorStore",
        params: VendorIdParamsSchema,
        body: CreateStoreBodySchema,
        response: { 201: StoreSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply
          .code(201)
          .send(await service.createStore(principal, request.params.vendorId, request.body, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/stores/:storeId",
    {
      schema: {
        tags: ["vendors"],
        operationId: "updateVendorStore",
        params: StoreIdParamsSchema,
        body: UpdateStoreBodySchema,
        response: { 200: StoreSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(await service.updateStore(principal, request.params.storeId, request.body, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/stores/:storeId/activate",
    {
      schema: {
        tags: ["vendors"],
        operationId: "activateVendorStore",
        params: StoreIdParamsSchema,
        response: { 200: StoreSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(await service.activateStore(principal, request.params.storeId, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/stores/:storeId/close",
    {
      schema: {
        tags: ["vendors"],
        operationId: "closeVendorStore",
        params: StoreIdParamsSchema,
        response: { 200: StoreSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(await service.closeStore(principal, request.params.storeId, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendors/:vendorId/members",
    {
      schema: {
        tags: ["vendors"],
        operationId: "listVendorMembers",
        params: VendorIdParamsSchema,
        response: { 200: VendorMemberListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send({ items: await service.listMembers(principal, request.params.vendorId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/vendors/:vendorId/members/invite",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
      schema: {
        tags: ["vendors"],
        operationId: "inviteVendorMember",
        params: VendorIdParamsSchema,
        body: InviteVendorMemberBodySchema,
        response: { 201: VendorMemberSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply
          .code(201)
          .send(await service.inviteMember(principal, request.params.vendorId, request.body, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/vendors/:vendorId/memberships/accept",
    {
      schema: {
        tags: ["vendors"],
        operationId: "acceptVendorMembership",
        params: VendorIdParamsSchema,
        response: { 200: VendorMembershipSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(await service.acceptInvitation(principal, request.params.vendorId, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/vendors/:vendorId/members/:memberId",
    {
      schema: {
        tags: ["vendors"],
        operationId: "updateVendorMember",
        params: VendorMemberParamsSchema,
        body: UpdateVendorMemberBodySchema,
        response: { 200: VendorMemberSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(
          await service.updateMember(
            principal,
            request.params.vendorId,
            request.params.memberId,
            request.body,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.delete(
    "/api/v1/vendors/:vendorId/members/:memberId",
    {
      schema: {
        tags: ["vendors"],
        operationId: "removeVendorMember",
        params: VendorMemberParamsSchema,
        response: { 200: AcceptedResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        await service.removeMember(
          principal,
          request.params.vendorId,
          request.params.memberId,
          request.id,
        );
        return reply.send({ accepted: true as const });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/vendors/:vendorId/provider-accounts",
    {
      schema: {
        tags: ["vendors"],
        operationId: "listVendorProviderAccounts",
        params: VendorIdParamsSchema,
        response: { 200: PaymentProviderAccountListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send({ items: await service.listProviderAccounts(principal, request.params.vendorId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/admin/vendors",
    {
      schema: {
        tags: ["admin"],
        operationId: "adminListVendors",
        querystring: AdminVendorListQuerySchema,
        response: { 200: VendorListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send({ items: await service.listAdminVendors(principal, request.query.status) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  for (const transition of ["approve", "reject", "suspend"] as const) {
    server.post(
      `/api/v1/admin/vendors/:vendorId/${transition}`,
      {
        schema: {
          tags: ["admin"],
          operationId: `admin${transition[0]?.toUpperCase()}${transition.slice(1)}Vendor`,
          params: VendorIdParamsSchema,
          body: ReviewVendorBodySchema,
          response: { 200: VendorSchema, ...commonErrors },
        },
      },
      async (request, reply) => {
        try {
          requireCsrfToken(request);
          const service = vendorServiceOrThrow(options.service);
          const principal = await authenticatedPrincipal(request, options);
          if (transition === "approve") {
            return reply.send(await service.approveVendor(principal, request.params.vendorId, request.id));
          }
          if (transition === "reject") {
            return reply.send(
              await service.rejectVendor(
                principal,
                request.params.vendorId,
                request.body.reason,
                request.id,
              ),
            );
          }
          return reply.send(
            await service.suspendVendor(
              principal,
              request.params.vendorId,
              request.body.reason,
              request.id,
            ),
          );
        } catch (error) {
          return sendError(request, reply, error);
        }
      },
    );
  }

  server.post(
    "/api/v1/admin/vendor-verifications/:verificationId/review",
    {
      schema: {
        tags: ["admin"],
        operationId: "adminReviewVendorVerification",
        params: VendorVerificationIdParamsSchema,
        body: ReviewVendorVerificationBodySchema,
        response: { 200: VendorVerificationSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(
          await service.reviewVerification(
            principal,
            request.params.verificationId,
            request.body,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.put(
    "/api/v1/admin/vendors/:vendorId/provider-accounts",
    {
      schema: {
        tags: ["admin"],
        operationId: "adminRecordVendorProviderAccount",
        params: VendorIdParamsSchema,
        body: RecordPaymentProviderAccountBodySchema,
        response: { 200: PaymentProviderAccountSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(
          await service.recordProviderAccount(principal, request.params.vendorId, request.body, request.id),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/admin/vendors/:vendorId/provider-accounts/:provider/status",
    {
      schema: {
        tags: ["admin"],
        operationId: "adminUpdateVendorProviderAccountStatus",
        params: ProviderAccountParamsSchema,
        body: UpdateProviderAccountStatusBodySchema,
        response: { 200: PaymentProviderAccountSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = vendorServiceOrThrow(options.service);
        const principal = await authenticatedPrincipal(request, options);
        return reply.send(
          await service.updateProviderAccountStatus(
            principal,
            request.params.vendorId,
            request.params.provider,
            request.body.status,
            request.body.reason,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
