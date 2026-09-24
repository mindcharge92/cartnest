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
import rawBodyPlugin from "fastify-raw-body";
import { registerBackgroundTasks } from "./background.js";
import { NotificationDelivery, ResendEmailSender } from "./modules/notifications/notification.delivery.js";
import { registerAdminOperationsRoutes } from "./modules/admin/admin.operations.routes.js";
import { AdminOperationsService } from "./modules/admin/admin.operations.service.js";
import { registerAdminRoutes } from "./modules/admin/admin.routes.js";
import { AdminService } from "./modules/admin/admin.service.js";
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
import { DevelopmentAssetStorage, R2MediaStorage } from "./modules/catalog/catalog.storage.js";
import { asInventoryAvailabilityBoundary } from "./modules/inventory/inventory.public.js";
import { PrismaInventoryRepository } from "./modules/inventory/inventory.repository.js";
import { registerInventoryRoutes } from "./modules/inventory/inventory.routes.js";
import { InventoryService } from "./modules/inventory/inventory.service.js";
import { ShipmentAllocationStore } from "./modules/logistics/logistics.allocation.js";
import { GiglAdapter } from "./modules/logistics/logistics.provider.js";
import { BuyerLogisticsQueryService } from "./modules/logistics/logistics.query.js";
import { PrismaLogisticsRepository } from "./modules/logistics/logistics.repository.js";
import { registerLogisticsRoutes } from "./modules/logistics/logistics.routes.js";
import {
  LogisticsAwareCheckoutFinancialPolicy,
  LogisticsService,
} from "./modules/logistics/logistics.service.js";
import { registerNotificationRoutes } from "./modules/notifications/notification.routes.js";
import { NotificationService } from "./modules/notifications/notification.service.js";
import { DatabaseOrderFulfillmentBoundary } from "./modules/orders/order.fulfillment.js";
import { P6PrePaymentVendorAcceptancePolicy } from "./modules/orders/order.policy.js";
import { PrismaOrderRepository } from "./modules/orders/order.repository.js";
import { registerOrderRoutes } from "./modules/orders/order.routes.js";
import { OrderService } from "./modules/orders/order.service.js";
import { FlutterwaveAdapter } from "./modules/payments/flutterwave.adapter.js";
import { DatabaseCheckoutFinancialPolicy } from "./modules/payments/payment.policy.js";
import { PrismaPaymentRepository } from "./modules/payments/payment.repository.js";
import { registerPaymentRoutes } from "./modules/payments/payment.routes.js";
import { PaymentService } from "./modules/payments/payment.service.js";
import { PaystackAdapter } from "./modules/payments/paystack.adapter.js";
import { PrismaReturnsRepository } from "./modules/returns/returns.repository.js";
import { registerReturnsRoutes } from "./modules/returns/returns.routes.js";
import { ReturnsService } from "./modules/returns/returns.service.js";
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
  installDefaultErrorHandler = true,
) {
  const environment = getApiEnvironment();
  const app = Fastify({ logger: environment.nodeEnv !== "test", ...options })
    .setValidatorCompiler(TypeBoxValidatorCompiler)
    .withTypeProvider<TypeBoxTypeProvider>();

  if (installDefaultErrorHandler) {
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
  }

  registerSecurityPlugins(app, environment);
  void app.register(rawBodyPlugin, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
  });

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
        { name: "payments", description: "Provider-neutral payment initialization, verification, and webhooks" },
        { name: "logistics", description: "Shipping quotes, fulfillment profiles, shipments, and tracking" },
        { name: "returns", description: "RMA requests, return state, and returned-stock policy" },
        { name: "refunds", description: "Partial/full refund requests, provider execution, and reconciliation" },
        { name: "reviews", description: "Verified-purchase product/store reviews and moderation" },
        { name: "analytics", description: "Vendor and platform operational analytics" },
        { name: "notifications", description: "In-app notifications, preferences, and provider-neutral delivery queue" },
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

  const emailSender = environment.resendApiKey && environment.emailFrom
    ? new ResendEmailSender(environment.resendApiKey, environment.emailFrom) : undefined;
  const notificationDelivery = database
    ? new NotificationDelivery(database, environment.mfaEncryptionKey, environment.webBaseUrl, emailSender)
    : undefined;
  const authService = database
    ? new AuthService(new PrismaAuthRepository(database), environment, emailSender ? notificationDelivery : undefined)
    : undefined;
  const vendorService = database
    ? new VendorService(new PrismaVendorRepository(database), {
        requireVerifiedIdentifier: environment.vendorRequireVerifiedIdentifier,
      })
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
      : environment.nodeEnv === "development"
        ? new DevelopmentAssetStorage(environment.webBaseUrl)
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

  const orderRepository = database ? new PrismaOrderRepository(database) : undefined;
  const orderFulfillmentBoundary = database ? new DatabaseOrderFulfillmentBoundary(database) : undefined;
  const logisticsRepository = database ? new PrismaLogisticsRepository(database) : undefined;
  const logisticsAdapters = [];
  if (environment.giglAccessToken && environment.giglCustomerCode) {
    logisticsAdapters.push(
      new GiglAdapter(environment.giglAccessToken, environment.giglCustomerCode, environment.giglBaseUrl),
    );
  }
  const logisticsService =
    database &&
    logisticsRepository &&
    vendorBoundary &&
    orderFulfillmentBoundary &&
    cartService &&
    catalogBoundary
      ? new LogisticsService(
          logisticsRepository,
          new ShipmentAllocationStore(database),
          vendorBoundary,
          orderFulfillmentBoundary,
          cartService,
          catalogBoundary,
          logisticsAdapters,
        )
      : undefined;
  const buyerLogisticsQueryService =
    logisticsRepository && orderFulfillmentBoundary
      ? new BuyerLogisticsQueryService(logisticsRepository, orderFulfillmentBoundary)
      : undefined;

  // P10 closes the prior tax/promotion placeholders. Production checkout now
  // exists, but fails closed when no active platform commission default or tax
  // rate can be resolved. Development/test may use zero-value fallbacks.
  const baseFinancialPolicy = database
    ? new DatabaseCheckoutFinancialPolicy(
        database,
        environment.nodeEnv !== "production",
        environment.nodeEnv === "production",
      )
    : undefined;
  const checkoutFinancialPolicy =
    baseFinancialPolicy && logisticsService
      ? new LogisticsAwareCheckoutFinancialPolicy(baseFinancialPolicy, logisticsService)
      : undefined;
  const orderService =
    orderRepository && vendorBoundary && checkoutFinancialPolicy
      ? new OrderService(
          orderRepository,
          vendorBoundary,
          checkoutFinancialPolicy,
          new P6PrePaymentVendorAcceptancePolicy(),
        )
      : undefined;

  const paymentAdapters = [];
  if (environment.paystackSecretKey) {
    paymentAdapters.push(new PaystackAdapter(environment.paystackSecretKey, environment.paystackBaseUrl));
  }
  if (environment.flutterwaveSecretKey && environment.flutterwaveSecretHash) {
    paymentAdapters.push(
      new FlutterwaveAdapter(
        environment.flutterwaveSecretKey,
        environment.flutterwaveSecretHash,
        environment.flutterwaveBaseUrl,
      ),
    );
  }
  const paymentService = database
    ? new PaymentService(
        new PrismaPaymentRepository(database),
        paymentAdapters,
        environment.paymentCallbackUrl,
      )
    : undefined;
  const returnsService =
    database && vendorBoundary
      ? new ReturnsService(
          database,
          new PrismaReturnsRepository(database),
          vendorBoundary,
          paymentAdapters,
        )
      : undefined;
  const adminService = database && vendorBoundary ? new AdminService(database, vendorBoundary) : undefined;
  const adminOperationsService = database ? new AdminOperationsService(database) : undefined;
  const notificationService = database ? new NotificationService(database) : undefined;
  if (environment.backgroundTasksEnabled && paymentService && returnsService && logisticsService && notificationDelivery) {
    registerBackgroundTasks(app, [
      { name: "payments.reconcile", run: () => paymentService.reconcilePending(10) },
      { name: "refunds.reconcile", run: () => returnsService.reconcilePendingRefunds(10) },
      { name: "logistics.track", run: () => logisticsService.syncGiglTracking(10) },
      { name: "notifications.deliver", run: () => notificationDelivery.deliverPending(10) },
    ]);
  }

  async function dependencyStates() {
    const [databaseReady, redisReady] = await Promise.all([probes.database(), probes.redis()]);
    return {
      database: databaseReady ? ("ready" as const) : ("unavailable" as const),
      redis: redisReady ? ("ready" as const) : ("unavailable" as const),
    };
  }

  // @fastify/swagger discovers routes through an onRoute hook. Fastify route
  // registration is synchronous, so application routes must be registered in
  // a plugin that boots after Swagger rather than directly on the root instance.
  void app.register(async (routes) => {
    registerAuthRoutes(routes, { service: authService, environment });
    registerVendorRoutes(routes, { service: vendorService, authService });
    registerCatalogRoutes(routes, { service: catalogService, authService });
    registerInventoryRoutes(routes, { service: inventoryService, authService });
    registerWishlistRoutes(routes, { service: wishlistService, authService });
    registerCartRoutes(routes, { service: cartService, authService });
    registerOrderRoutes(routes, { service: orderService, authService });
    registerPaymentRoutes(routes, { service: paymentService, authService });
    registerLogisticsRoutes(routes, {
      service: logisticsService,
      buyerQueryService: buyerLogisticsQueryService,
      authService,
    });
    registerReturnsRoutes(routes, { service: returnsService, authService });
    registerAdminRoutes(routes, { service: adminService, authService });
    registerAdminOperationsRoutes(routes, { service: adminOperationsService, authService });
    registerNotificationRoutes(routes, { service: notificationService, authService });

    routes.get(
      "/",
      {
        schema: { hide: true },
      },
      async () => ({
        status: "ok" as const,
        service: "cartnest-api" as const,
        health: "/health" as const,
        readiness: "/ready" as const,
      }),
    );

    routes.get(
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

    // Compatibility liveness path for existing Render services created before
    // the direct-Fastify deployment switched the canonical health path to /health.
    routes.get(
      "/api/health",
      {
        schema: { hide: true },
      },
      async () => ({
        status: "ok" as const,
        service: "cartnest-api" as const,
        uptimeSeconds: Math.floor(process.uptime()),
      }),
    );

    routes.get(
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

    routes.get(
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
  });

  return app;
}
