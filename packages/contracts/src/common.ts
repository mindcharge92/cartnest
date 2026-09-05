import { Static, Type } from "@sinclair/typebox";

export const UuidSchema = Type.String({ format: "uuid", description: "Opaque UUID identifier" });
export type Uuid = Static<typeof UuidSchema>;

export const IsoTimestampSchema = Type.String({ format: "date-time" });
export type IsoTimestamp = Static<typeof IsoTimestampSchema>;

export const CurrencyCodeSchema = Type.String({ pattern: "^[A-Z]{3}$", default: "NGN" });
export type CurrencyCode = Static<typeof CurrencyCodeSchema>;

// Minor units cross JSON as a decimal string so bigint-backed values remain lossless.
export const MoneySchema = Type.Object(
  {
    amountMinor: Type.String({ pattern: "^-?[0-9]+$" }),
    currency: CurrencyCodeSchema,
  },
  { additionalProperties: false },
);
export type MoneyDto = Static<typeof MoneySchema>;

export const PaginationQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  },
  { additionalProperties: false },
);
export type PaginationQueryDto = Static<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = Type.Object({
  page: Type.Integer({ minimum: 1 }),
  pageSize: Type.Integer({ minimum: 1 }),
  totalItems: Type.Integer({ minimum: 0 }),
  totalPages: Type.Integer({ minimum: 0 }),
});
export type PaginationMetaDto = Static<typeof PaginationMetaSchema>;

export const ApiErrorSchema = Type.Object(
  {
    error: Type.Object({
      code: Type.String({ minLength: 1 }),
      message: Type.String({ minLength: 1 }),
      requestId: Type.String({ minLength: 1 }),
      details: Type.Optional(Type.Unknown()),
    }),
  },
  { additionalProperties: false },
);
export type ApiErrorDto = Static<typeof ApiErrorSchema>;
