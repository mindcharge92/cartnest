import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import {
  TypeBoxTypeProvider,
  TypeBoxValidatorCompiler,
} from "@fastify/type-provider-typebox";
import { getApiEnvironment } from "@repo/config/api";
import {
  HealthResponseSchema,
  ReadinessResponseSchema,
  SystemInfoResponseSchema,
} from "@repo/contracts";
import type { DatabaseClient } from "@repo/database";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import { PrismaAuthRepository } from "./modules/auth/auth.repository.js";
import { registerAuthRoutes, registerSecurityPlugins } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { PrismaCartRepository } from "./modules/cart/cart.repository.js";
import { registerCartRoutes } from "./modules/cart/cart.routes.js";
import { CartService } from "./modules/cart/cart.service.js";
import { DefaultCatalogCommerceBoundary } from "./modules/catalog/catalog.public.js";
import { PrismaCatalogRepository } from "./modules/catalog/catalog.repository.js";
import { registerCatalogRoutes } from "./modules/catalog/catalog.routes.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { R2MediaStorage } from "./modules/catalog/catalog.storage.js";
import { asInventoryAvailabilityBoundary } from "./modules/inventory/inventory.public.js";
import { PrismaInventoryRepository } from "./modules/inventory/inventory.repository.js";
import { registerInventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { InventoryService } from "./modules/inventory/inventory.service.js";
import {
  DefaultVendorAcceptancePolicy,
  P6BaselineCheckoutFinancialPolicy,
} from "./modules/orders/order.policy.js";
import { PrismaOrderRepository } from "./modules/orders/order.repository.js";
import { registerOrderRoutes } from "./modules/orders/order.routes.js";
import { OrderService } from "./modules/orders/order.service.js";
import { asVendorOwnershipBoundary } from "./modules/vendors/vendor.public.js";
import { PrismaVendorRepository } from "./modules/vendors/vendor.repository.js";
import { registerVendorRoutes } from "./modules/vendors/vendor.routes.js";
import { VendorService } from "./modules/vendors/vendor.service.js";
import { PrismaWishlistRepository } from "./modules/wishlist/wishlist.repository.js";
import { registerWishlistRoutes } from "./modules/wishlist/wishlist.routes.js";
import { WishlistService } from "./modules/wishlist/wishlist.service.js";

export interface ReadinessProbes {
  readonly database: () => Promise<boolean>;
  readonly redis: () => Promise<boolean>;
}

const unavailableProbe = async () => false;
const defaultProbes: ReadinessProbes = { database: unavailableProbe, redis: unavailableProbe };

export function buildApp(
  options: FastifyServerOptions = {},
  probes: ReadinessProbes = defaultProbes,
  database?: DatabaseClient,
) {
  const environment = getApiEnvironment();
  const app = Fastify({ logger: environment.nodeEnv !== "test", ...options })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>();

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request does not match the required contract.",
          requestId: request.id,
          details: error.validation,
        },
      });
    }
    request.log.error({ err: error }, "Unhandled request error");
    return reply.code(error.statusCode && error.statusCode >= 400 ? error.statusCode : 500).send({
      error: {
        code: error.statusCode === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: error.statusCode === 429 ? "Too many requests." : "An unexpected error occurred.",
        requestId: request.id,
      },
    });
  });

  registerSecurityPlugins(app, environment);

  void app.register(swagger, {
    openapi: {
      info: {
        title: "CartNest API",
        description: "Contract-first REST API for the CartNest multi-vendor marketplace.",
        version: "1.0.0",
      },
      tags: [
        { name: "system", description: "Platform health, readiness, and API metadata" },
        { name: "auth", description: "Identity, sessions, verification, OAuth, and MFA" },
        { name: "vendors", description: "Vendor applications, stores, staff, KYC, and settlement account visibility" },
        { name: "catalog", description: "Categories, products, variants, search, and buyer catalog" },
        { name: "media", description: "Direct object-storage upload intents and media metadata" },
        { name: "inventory", description: "Vendor-scoped stock, availability, and adjustment history" },
        { name: "wishlist", description: "Authenticated buyer wishlist" },
        { name: "cart", description: "Authenticated multi-store cart and checkout preview" },
        { name: "checkout", description: "Idempotent checkout and inventory reservation" },
        { name: "orders", description: "Buyer order history, detail, and cancellation" },
        { name: "vendor-orders", description: "Vendor-scoped order queue and processing boundary" },
        { name: "admin", description: "Privileged marketplace administration and moderation" },
      ],
    },
  });

  if (environment.nodeEnv !== "production") {
    void app.register(swaggerUi, {
      routePrefix: "/documentation",
      uiConfig: { docExpansion: "list", deepLinking: true },
    });
  }

  const authService = database
    ? new AuthService(new PrismaAuthRepository(database), environment)
    : undefined;
  const vendorService = database
    ? new VendorService(new PrismaVendorRepository(database))
    : undefined;
  const vendorBoundary = vendorService ? asVendorOwnershipBoundary(vendorService) : undefined;

  const mediaStorage =
    environment.r2AccountId &&
    environment.r2AccessKeyId &&
    environment.r2SecretAccessKey &&
    environment.r2Bucket &&
    environment.r2PublicBaseUrl
      ? new R2MediaStorage({
          accountId: environment.r2AccountId,
          accessKeyId: environment.r2AccessKeyId,
          secretAccessKey: environment.r2SecretAccessKey,
          bucket: environment.r2Bucket,
          publicBaseUrl: environment.r2PublicBaseUrl,
        })
      : undefined;

  const catalogRepository = database ? new PrismaCatalogRepository(database) : undefined;
  const catalogService =
    catalogRepository && vendorBoundary
      ? new CatalogService(catalogRepository, vendorBoundary, mediaStorage)
      : undefined;
  const catalogBoundary =
    catalogRepository && catalogService
      ? new DefaultCatalogCommerceBoundary(catalogRepository, catalogService)
      : undefined;

  const inventoryService =
    database && vendorBoundary && catalogBoundary
      ? new InventoryService(new PrismaInventoryRepository(database), vendorBoundary, catalogBoundary)
      : undefined;
  const inventoryBoundary = inventoryService
    ? asInventoryAvailabilityBoundary(inventoryService)
    : undefined;
  const wishlistService =
    database && catalogBoundary
      ? new WishlistService(new PrismaWishlistRepository(database), catalogBoundary)
      : undefined;
  const cartService =
    database && catalogBoundary && inventoryBoundary
      ? new CartService(new PrismaCartRepository(database), catalogBoundary, inventoryBoundary)
      : undefined;
  const orderService =
    database && vendorBoundary
      ? new OrderService(
          new PrismaOrderRepository(database),
          vendorBoundary,
          new P6BaselineCheckoutFinancialPolicy(),
          new DefaultVendorAcceptancePolicy(),
        )
      : undefined;

  registerAuthRoutes(app, { service: authService, environment });
  registerVendorRoutes(app, { service: vendorService, authService });
  registerCatalogRoutes(app, { service: catalogService, authService });
  registerInventoryRoutes(app, { service: inventoryService, authService });
  registerWishlistRoutes(app, { service: wishlistService, authService });
  registerCartRoutes(app, { service: cartService, authService });
  registerOrderRoutes(app, { service: orderService, authService });

  async function dependencyStates() {
    const [databaseReady, redisReady] = await Promise.all([probes.database(), probes.redis()]);
    return {
      database: databaseReady ? ("ready" as const) : ("unavailable" as const),
      redis: redisReady ? ("ready" as const) : ("unavailable" as const),
    };
  }

  app.get(
    "/health",
    {
      schema: {
        tags: ["system"],
        operationId: "getHealth",
        response: { 200: HealthResponseSchema },
      },
    },
    async () => ({
      status: "ok" as const,
      service: "cartnest-api" as const,
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  );

  app.get(
    "/ready",
    {
      schema: {
        tags: ["system"],
        operationId: "getReadiness",
        response: { 200: ReadinessResponseSchema, 503: ReadinessResponseSchema },
      },
    },
    async (_request, reply) => {
      const dependencies = await dependencyStates();
      const ready = dependencies.database === "ready" && dependencies.redis === "ready";
      return reply.code(ready ? 200 : 503).send({
        status: ready ? ("ready" as const) : ("not-ready" as const),
        service: "cartnest-api" as const,
        dependencies,
      });
    },
  );

  app.get(
    "/api/v1/system/info",
    {
      schema: {
        tags: ["system"],
        operationId: "getSystemInfo",
        response: { 200: SystemInfoResponseSchema },
      },
    },
    async () => ({
      service: "cartnest-api" as const,
      apiVersion: "v1" as const,
      timestamp: new Date().toISOString(),
      dependencies: await dependencyStates(),
    }),
  );

  return app;
}
