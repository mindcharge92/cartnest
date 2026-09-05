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
  type HealthResponseDto,
  type ReadinessResponseDto,
} from "./health.js";

export const CONTRACT_VERSION = 1 as const;
