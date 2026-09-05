export {
  ApiErrorSchema,
  CurrencyCodeSchema,
  IsoTimestampSchema,
  MoneySchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
  UuidSchema,
  type ApiErrorDto,
  type CurrencyCode,
  type IsoTimestamp,
  type MoneyDto,
  type PaginationMetaDto,
  type PaginationQueryDto,
  type Uuid,
} from "./common.js";

export {
  HealthResponseSchema,
  ReadinessResponseSchema,
  SystemInfoResponseSchema,
  type HealthResponseDto,
  type ReadinessResponseDto,
  type SystemInfoResponseDto,
} from "./health.js";

export * from "./auth.js";
export * from "./vendor.js";
export * from "./catalog.js";
export {
  CatalogProductDetailResponseSchema as CatalogProductDetailSchema,
  CatalogProductDetailResponseSchema,
  type CatalogProductDetailResponseDto,
} from "./catalog-public-detail.js";
export * from "./inventory.js";
export * from "./wishlist.js";
export * from "./cart.js";
export * from "./orders.js";
export * from "./payment.js";
export * from "./logistics.js";
export * from "./returns.js";
export * from "./admin.js";

export const CONTRACT_VERSION = 1 as const;
