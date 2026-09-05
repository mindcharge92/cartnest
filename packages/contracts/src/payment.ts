import { Type, type Static } from "typebox";
import { IsoTimestampSchema, MoneySchema, PaginationMetaSchema, UuidSchema } from "./common.js";
import { PaymentStatusSchema } from "./orders.js";
import { PaymentProviderSchema } from "./vendor.js";

export const PaymentChannelSchema = Type.Union([
  Type.Literal("card"),
  Type.Literal("bank"),
  Type.Literal("ussd"),
  Type.Literal("bank_transfer"),
]);
export type PaymentChannelDto = Static<typeof PaymentChannelSchema>;

export const InitializePaymentHeadersSchema = Type.Object(
  {
    "idempotency-key": Type.String({ minLength: 8, maxLength: 200 }),
  },
  { additionalProperties: true },
);
export type InitializePaymentHeadersDto = Static<typeof InitializePaymentHeadersSchema>;

export const InitializePaymentBodySchema = Type.Object(
  {
    channel: Type.Optional(PaymentChannelSchema),
  },
  { additionalProperties: false },
);
export type InitializePaymentBodyDto = Static<typeof InitializePaymentBodySchema>;

export const PaymentIntentParamsSchema = Type.Object(
  { paymentIntentId: UuidSchema },
  { additionalProperties: false },
);
export type PaymentIntentParamsDto = Static<typeof PaymentIntentParamsSchema>;

export const PaymentAttemptSchema = Type.Object(
  {
    id: UuidSchema,
    provider: PaymentProviderSchema,
    providerReference: Type.Union([Type.String({ minLength: 1, maxLength: 255 }), Type.Null()]),
    providerTransactionId: Type.Union([Type.String({ minLength: 1, maxLength: 255 }), Type.Null()]),
    channel: Type.Union([Type.String({ minLength: 1, maxLength: 80 }), Type.Null()]),
    amount: MoneySchema,
    status: PaymentStatusSchema,
    failureCategory: Type.Union([Type.String({ minLength: 1, maxLength: 120 }), Type.Null()]),
    initializedAt: IsoTimestampSchema,
    confirmedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type PaymentAttemptDto = Static<typeof PaymentAttemptSchema>;

export const PaymentAllocationTypeSchema = Type.Union([
  Type.Literal("VENDOR_NET"),
  Type.Literal("PLATFORM_COMMISSION"),
  Type.Literal("GATEWAY_FEE"),
  Type.Literal("DELIVERY"),
  Type.Literal("TAX"),
  Type.Literal("DISCOUNT"),
]);
export type PaymentAllocationTypeDto = Static<typeof PaymentAllocationTypeSchema>;

export const PaymentAllocationSchema = Type.Object(
  {
    id: UuidSchema,
    vendorOrderId: Type.Union([UuidSchema, Type.Null()]),
    type: PaymentAllocationTypeSchema,
    amount: MoneySchema,
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type PaymentAllocationDto = Static<typeof PaymentAllocationSchema>;

export const PaymentIntentDetailSchema = Type.Object(
  {
    id: UuidSchema,
    orderId: UuidSchema,
    amount: MoneySchema,
    status: PaymentStatusSchema,
    attempts: Type.Array(PaymentAttemptSchema),
    allocations: Type.Array(PaymentAllocationSchema),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type PaymentIntentDetailDto = Static<typeof PaymentIntentDetailSchema>;

export const PaymentInitializationResponseSchema = Type.Object(
  {
    paymentIntent: PaymentIntentDetailSchema,
    attempt: PaymentAttemptSchema,
    authorizationUrl: Type.String({ minLength: 1, maxLength: 4096 }),
    accessCode: Type.Union([Type.String({ minLength: 1, maxLength: 1024 }), Type.Null()]),
    replayed: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type PaymentInitializationResponseDto = Static<typeof PaymentInitializationResponseSchema>;

export const PaymentListQuerySchema = Type.Object(
  {
    status: Type.Optional(PaymentStatusSchema),
    provider: Type.Optional(PaymentProviderSchema),
    page: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type PaymentListQueryDto = Static<typeof PaymentListQuerySchema>;

export const PaymentIntentListResponseSchema = Type.Object(
  {
    items: Type.Array(PaymentIntentDetailSchema),
    pagination: PaginationMetaSchema,
  },
  { additionalProperties: false },
);
export type PaymentIntentListResponseDto = Static<typeof PaymentIntentListResponseSchema>;

export const ProviderWebhookAcceptedSchema = Type.Object(
  {
    received: Type.Literal(true),
  },
  { additionalProperties: false },
);
export type ProviderWebhookAcceptedDto = Static<typeof ProviderWebhookAcceptedSchema>;
