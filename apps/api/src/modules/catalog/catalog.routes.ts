import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ApiErrorSchema,
  CatalogProductDetailSchema,
  CatalogProductListResponseSchema,
  CatalogQuerySchema,
  CategoryIdParamsSchema,
  CategoryListResponseSchema,
  CategorySchema,
  CompleteMediaUploadBodySchema,
  CreateCategoryBodySchema,
  CreateProductBodySchema,
  CreateProductVariantFromIdsBodySchema,
  MediaIdParamsSchema,
  MediaUploadIntentBodySchema,
  MediaUploadIntentResponseSchema,
  ProductIdParamsSchema,
  ProductModerationBodySchema,
  ProductModerationQuerySchema,
  ProductVariantSchema,
  StoreIdCatalogParamsSchema,
  UpdateCategoryBodySchema,
  UpdateMediaBodySchema,
  UpdateProductBodySchema,
  UpdateProductVariantBodySchema,
  VariantIdParamsSchema,
  VendorMediaSchema,
  VendorProductListResponseSchema,
  VendorProductSchema,
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
import { CatalogError, type CatalogService } from "./catalog.service.js";

export interface CatalogRoutesOptions {
  readonly service: CatalogService | undefined;
  readonly authService: AuthService | undefined;
}

const commonErrors = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  403: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  503: ApiErrorSchema,
};

function errorBody(request: FastifyRequest, code: string, message: string) {
  return { error: { code, message, requestId: request.id } };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (
    error instanceof CatalogError ||
    error instanceof VendorAuthorizationError ||
    error instanceof AuthError ||
    error instanceof AuthorizationError
  ) {
    return reply.code(error.statusCode).send(errorBody(request, error.code, error.message));
  }
  request.log.warn({ err: error }, "Catalog request failed");
  return reply.code(500).send(errorBody(request, "INTERNAL_ERROR", "Catalog request failed."));
}

function serviceOrThrow(service: CatalogService | undefined): CatalogService {
  if (!service) throw new CatalogError("CATALOG_UNAVAILABLE", "Catalog storage is unavailable.", 503);
  return service;
}

function authServiceOrThrow(service: AuthService | undefined): AuthService {
  if (!service) throw new AuthError("AUTH_UNAVAILABLE", "Authentication storage is unavailable.", 503);
  return service;
}

async function principal(request: FastifyRequest, options: CatalogRoutesOptions) {
  return requireAccessPrincipal(request, authServiceOrThrow(options.authService));
}

export function registerCatalogRoutes(app: FastifyInstance, options: CatalogRoutesOptions): void {
  const server = app.withTypeProvider<TypeBoxTypeProvider>();

  server.get(
    "/api/v1/categories",
    {
      schema: {
        tags: ["catalog"],
        operationId: "listPublicCategories",
        response: { 200: CategoryListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        return reply.send({ items: await serviceOrThrow(options.service).listPublicCategories() });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/catalog/products",
    {
      schema: {
        tags: ["catalog"],
        operationId: "listCatalogProducts",
        querystring: CatalogQuerySchema,
        response: { 200: CatalogProductListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        return reply.send(await serviceOrThrow(options.service).listPublicCatalog(request.query));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/catalog/products/:productId",
    {
      schema: {
        tags: ["catalog"],
        operationId: "getCatalogProduct",
        params: ProductIdParamsSchema,
        response: { 200: CatalogProductDetailSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        return reply.send(await serviceOrThrow(options.service).getPublicProduct(request.params.productId));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.get(
    "/api/v1/stores/:storeId/products",
    {
      schema: {
        tags: ["catalog"],
        operationId: "listVendorStoreProducts",
        params: StoreIdCatalogParamsSchema,
        response: { 200: VendorProductListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = serviceOrThrow(options.service);
        return reply.send({ items: await service.listStoreProducts(await principal(request, options), request.params.storeId) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/stores/:storeId/products",
    {
      schema: {
        tags: ["catalog"],
        operationId: "createVendorProduct",
        params: StoreIdCatalogParamsSchema,
        body: CreateProductBodySchema,
        response: { 201: VendorProductSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply
          .code(201)
          .send(
            await service.createProduct(
              await principal(request, options),
              request.params.storeId,
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
    "/api/v1/products/:productId",
    {
      schema: {
        tags: ["catalog"],
        operationId: "getVendorProduct",
        params: ProductIdParamsSchema,
        response: { 200: VendorProductSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = serviceOrThrow(options.service);
        return reply.send(await service.getVendorProduct(await principal(request, options), request.params.productId));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/products/:productId",
    {
      schema: {
        tags: ["catalog"],
        operationId: "updateVendorProduct",
        params: ProductIdParamsSchema,
        body: UpdateProductBodySchema,
        response: { 200: VendorProductSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply.send(
          await service.updateProduct(
            await principal(request, options),
            request.params.productId,
            request.body,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/products/:productId/variants",
    {
      schema: {
        tags: ["catalog"],
        operationId: "createProductVariant",
        params: ProductIdParamsSchema,
        body: CreateProductVariantFromIdsBodySchema,
        response: { 201: ProductVariantSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply
          .code(201)
          .send(
            await service.addVariant(
              await principal(request, options),
              request.params.productId,
              request.body,
              request.id,
            ),
          );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/variants/:variantId",
    {
      schema: {
        tags: ["catalog"],
        operationId: "updateProductVariant",
        params: VariantIdParamsSchema,
        body: UpdateProductVariantBodySchema,
        response: { 200: ProductVariantSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply.send(
          await service.updateVariant(
            await principal(request, options),
            request.params.variantId,
            request.body,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  for (const action of ["publish", "archive"] as const) {
    server.post(
      `/api/v1/products/:productId/${action}`,
      {
        schema: {
          tags: ["catalog"],
          operationId: action === "publish" ? "publishVendorProduct" : "archiveVendorProduct",
          params: ProductIdParamsSchema,
          response: { 200: VendorProductSchema, ...commonErrors },
        },
      },
      async (request, reply) => {
        try {
          requireCsrfToken(request);
          const service = serviceOrThrow(options.service);
          const actor = await principal(request, options);
          return reply.send(
            action === "publish"
              ? await service.publishProduct(actor, request.params.productId, request.id)
              : await service.archiveProduct(actor, request.params.productId, request.id),
          );
        } catch (error) {
          return sendError(request, reply, error);
        }
      },
    );
  }

  server.post(
    "/api/v1/media/upload-intents",
    {
      config: { rateLimit: { max: 100, timeWindow: "1 hour" } },
      schema: {
        tags: ["media"],
        operationId: "createMediaUploadIntent",
        body: MediaUploadIntentBodySchema,
        response: { 201: MediaUploadIntentResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply
          .code(201)
          .send(
            await service.createMediaUploadIntent(
              await principal(request, options),
              request.body,
              request.id,
            ),
          );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/media/:mediaId/complete",
    {
      schema: {
        tags: ["media"],
        operationId: "completeMediaUpload",
        params: MediaIdParamsSchema,
        body: CompleteMediaUploadBodySchema,
        response: { 200: VendorMediaSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply.send(
          await service.completeMediaUpload(
            await principal(request, options),
            request.params.mediaId,
            request.body,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/media/:mediaId",
    {
      schema: {
        tags: ["media"],
        operationId: "updateMediaMetadata",
        params: MediaIdParamsSchema,
        body: UpdateMediaBodySchema,
        response: { 200: VendorMediaSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply.send(
          await service.updateMedia(
            await principal(request, options),
            request.params.mediaId,
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
    "/api/v1/admin/categories",
    {
      schema: {
        tags: ["admin", "catalog"],
        operationId: "adminListCategories",
        response: { 200: CategoryListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = serviceOrThrow(options.service);
        return reply.send({ items: await service.listAdminCategories(await principal(request, options)) });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/admin/categories",
    {
      schema: {
        tags: ["admin", "catalog"],
        operationId: "adminCreateCategory",
        body: CreateCategoryBodySchema,
        response: { 201: CategorySchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply
          .code(201)
          .send(await service.createCategory(await principal(request, options), request.body, request.id));
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.patch(
    "/api/v1/admin/categories/:categoryId",
    {
      schema: {
        tags: ["admin", "catalog"],
        operationId: "adminUpdateCategory",
        params: CategoryIdParamsSchema,
        body: UpdateCategoryBodySchema,
        response: { 200: CategorySchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply.send(
          await service.updateCategory(
            await principal(request, options),
            request.params.categoryId,
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
    "/api/v1/admin/products/moderation",
    {
      schema: {
        tags: ["admin", "catalog"],
        operationId: "adminListProductModeration",
        querystring: ProductModerationQuerySchema,
        response: { 200: VendorProductListResponseSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        const service = serviceOrThrow(options.service);
        return reply.send({
          items: await service.listModerationProducts(
            await principal(request, options),
            request.query.status,
          ),
        });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );

  server.post(
    "/api/v1/admin/products/:productId/moderation",
    {
      schema: {
        tags: ["admin", "catalog"],
        operationId: "adminModerateProduct",
        params: ProductIdParamsSchema,
        body: ProductModerationBodySchema,
        response: { 200: VendorProductSchema, ...commonErrors },
      },
    },
    async (request, reply) => {
      try {
        requireCsrfToken(request);
        const service = serviceOrThrow(options.service);
        return reply.send(
          await service.moderateProduct(
            await principal(request, options),
            request.params.productId,
            request.body,
            request.id,
          ),
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
