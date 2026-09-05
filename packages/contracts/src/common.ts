import { Type, type Static } from "typebox";

export const UuidSchema = Type.String({
  description: "Opaque UUID identifier",
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
});
export type Uuid = Static<typeof UuidSchema>;

export const IsoTimestampSchema = Type.String({
  description: "ISO 8601 UTC timestamp",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?Z$",
});
export type IsoTimestamp = Static<typeof IsoTimestampSchema>;

export const CurrencyCodeSchema = Type.String({
  pattern: "^[A-Z]{3}$",
  minLength: 3,
  maxLength: 3,
});
export type CurrencyCode = Static<typeof CurrencyCodeSchema>;

export const MoneySchema = Type.Object(
  {
    amountMinor: Type.String({
      description: "Non-negative integer minor-unit amount serialized as a decimal string.",
      pattern: "^(0|[1-9][0-9]*)$",
    }),
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

export const PaginationMetaSchema = Type.Object(
  {
    page: Type.Integer({ minimum: 1 }),
    pageSize: Type.Integer({ minimum: 1, maximum: 100 }),
    totalItems: Type.Integer({ minimum: 0 }),
    totalPages: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type PaginationMetaDto = Static<typeof PaginationMetaSchema>;

export const ApiErrorSchema = Type.Object(
  {
    error: Type.Object(
      {
        code: Type.String({ minLength: 1, maxLength: 120 }),
        message: Type.String({ minLength: 1, maxLength: 500 }),
        requestId: Type.String({ minLength: 1, maxLength: 200 }),
        details: Type.Optional(Type.Unknown()),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ApiErrorDto = Static<typeof ApiErrorSchema>;
