import { Type, type Static } from "typebox";
import { IsoTimestampSchema, MoneySchema, PaginationMetaSchema, UuidSchema } from "./common.js";
import { PublicStoreSummarySchema, VariantOptionSelectionSchema } from "./catalog.js";

export const OrderStatusSchema = Type.Union([
  Type.Literal("PENDING_PAYMENT"),
  Type.Literal("PAID"),
  Type.Literal("PARTIALLY_FULFILLED"),
  Type.Literal("FULFILLED"),
  Type.Literal("PARTIALLY_CANCELLED"),
  Type.Literal("CANCELLED"),
  Type.Literal("PARTIALLY_REFUNDED"),
  Type.Literal("REFUNDED"),
]);
export type OrderStatusDto = Static<typeof OrderStatusSchema>;

export const VendorOrderStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("ACCEPTED"),
  Type.Literal("PROCESSING"),
  Type.Literal("PARTIALLY_SHIPPED"),
  Type.Literal("SHIPPED"),
  Type.Literal("DELIVERED"),
  Type.Literal("CANCELLED"),
  Type.Literal("PARTIALLY_REFUNDED"),
  Type.Literal("REFUNDED"),
]);
export type VendorOrderStatusDto = Static<typeof VendorOrderStatusSchema>;

export const PaymentStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("REQUIRES_ACTION"),
  Type.Literal("PROCESSING"),
  Type.Literal("SUCCEEDED"),
  Type.Literal("FAILED"),
  Type.Literal("CANCELLED"),
  Type.Literal("PARTIALLY_REFUNDED"),
  Type.Literal("REFUNDED"),
]);
export type PaymentStatusDto = Static<typeof PaymentStatusSchema>;

export const DeliveryAddressSnapshotSchema = Type.Object(
  {
    recipientName: Type.String({ minLength: 2, maxLength: 160 }),
    phone: Type.String({ minLength: 7, maxLength: 32 }),
    line1: Type.String({ minLength: 2, maxLength: 240 }),
    line2: Type.Optional(Type.String({ maxLength: 240 })),
    city: Type.String({ minLength: 2, maxLength: 120 }),
    state: Type.String({ minLength: 2, maxLength: 120 }),
    postalCode: Type.Optional(Type.String({ maxLength: 32 })),
    countryCode: Type.String({ minLength: 2, maxLength: 2, pattern: "^[A-Z]{2}$", default: "NG" }),
  },
  { additionalProperties: false },
);
export type DeliveryAddressSnapshotDto = Static<typeof DeliveryAddressSnapshotSchema>;

export const CheckoutBodySchema = Type.Object(
  {
    deliveryAddress: DeliveryAddressSnapshotSchema,
    promotionCode: Type.Optional(Type.String({ minLength: 2, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" })),
  },
  { additionalProperties: false },
);
export type CheckoutBodyDto = Static<typeof CheckoutBodySchema>;

export const CheckoutHeadersSchema = Type.Object(
  {
    "idempotency-key": Type.String({ minLength: 8, maxLength: 200 }),
  },
  { additionalProperties: true },
);
export type CheckoutHeadersDto = Static<typeof CheckoutHeadersSchema>;

export const OrderItemSnapshotSchema = Type.Object(
  {
    id: UuidSchema,
    productId: UuidSchema,
    variantId: UuidSchema,
    productName: Type.String({ minLength: 1, maxLength: 200 }),
    sku: Type.String({ minLength: 1, maxLength: 100 }),
    variantAttributes: Type.Array(VariantOptionSelectionSchema),
    unitPrice: MoneySchema,
    quantity: Type.Integer({ minimum: 1 }),
    subtotal: MoneySchema,
    discount: MoneySchema,
    tax: MoneySchema,
    lineTotal: MoneySchema,
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type OrderItemSnapshotDto = Static<typeof OrderItemSnapshotSchema>;

export const VendorOrderSchema = Type.Object(
  {
    id: UuidSchema,
    orderId: UuidSchema,
    vendorId: UuidSchema,
    store: PublicStoreSummarySchema,
    status: VendorOrderStatusSchema,
    orderStatus: OrderStatusSchema,
    paymentStatus: PaymentStatusSchema,
    itemSubtotal: MoneySchema,
    discount: MoneySchema,
    delivery: MoneySchema,
    tax: MoneySchema,
    commissionRateBps: Type.Integer({ minimum: 0, maximum: 10000 }),
    commission: MoneySchema,
    gatewayFee: MoneySchema,
    total: MoneySchema,
    items: Type.Array(OrderItemSnapshotSchema),
    acceptedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
    deliveredAt: Type.Union([IsoTimestampSchema, Type.Null()]),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type VendorOrderDto = Static<typeof VendorOrderSchema>;

export const PaymentIntentSummarySchema = Type.Object(
  {
    id: UuidSchema,
    status: PaymentStatusSchema,
    amount: MoneySchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type PaymentIntentSummaryDto = Static<typeof PaymentIntentSummarySchema>;

export const OrderSchema = Type.Object(
  {
    id: UuidSchema,
    orderNumber: Type.String({ minLength: 8, maxLength: 64 }),
    status: OrderStatusSchema,
    paymentStatus: PaymentStatusSchema,
    currency: Type.String({ pattern: "^[A-Z]{3}$" }),
    itemSubtotal: MoneySchema,
    discount: MoneySchema,
    delivery: MoneySchema,
    tax: MoneySchema,
    grandTotal: MoneySchema,
    deliveryAddress: DeliveryAddressSnapshotSchema,
    vendorOrders: Type.Array(VendorOrderSchema),
    paymentIntent: PaymentIntentSummarySchema,
    reservationExpiresAt: Type.Union([IsoTimestampSchema, Type.Null()]),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
    cancelledAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type OrderDto = Static<typeof OrderSchema>;

export const OrderSummarySchema = Type.Object(
  {
    id: UuidSchema,
    orderNumber: Type.String({ minLength: 8, maxLength: 64 }),
    status: OrderStatusSchema,
    paymentStatus: PaymentStatusSchema,
    grandTotal: MoneySchema,
    vendorOrderCount: Type.Integer({ minimum: 1 }),
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type OrderSummaryDto = Static<typeof OrderSummarySchema>;

export const OrderListQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    status: Type.Optional(OrderStatusSchema),
  },
  { additionalProperties: false },
);
export type OrderListQueryDto = Static<typeof OrderListQuerySchema>;

export const OrderListResponseSchema = Type.Object(
  { items: Type.Array(OrderSummarySchema), pagination: PaginationMetaSchema },
  { additionalProperties: false },
);
export type OrderListResponseDto = Static<typeof OrderListResponseSchema>;

export const OrderIdParamsSchema = Type.Object({ orderId: UuidSchema }, { additionalProperties: false });
export type OrderIdParamsDto = Static<typeof OrderIdParamsSchema>;

export const VendorOrderIdParamsSchema = Type.Object(
  { vendorOrderId: UuidSchema },
  { additionalProperties: false },
);
export type VendorOrderIdParamsDto = Static<typeof VendorOrderIdParamsSchema>;

export const StoreVendorOrderParamsSchema = Type.Object(
  { storeId: UuidSchema },
  { additionalProperties: false },
);
export type StoreVendorOrderParamsDto = Static<typeof StoreVendorOrderParamsSchema>;

export const VendorOrderListQuerySchema = Type.Object(
  {
    status: Type.Optional(VendorOrderStatusSchema),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  },
  { additionalProperties: false },
);
export type VendorOrderListQueryDto = Static<typeof VendorOrderListQuerySchema>;

export const VendorOrderListResponseSchema = Type.Object(
  { items: Type.Array(VendorOrderSchema), pagination: PaginationMetaSchema },
  { additionalProperties: false },
);
export type VendorOrderListResponseDto = Static<typeof VendorOrderListResponseSchema>;

export const CancelOrderBodySchema = Type.Object(
  { reason: Type.Optional(Type.String({ minLength: 2, maxLength: 500 })) },
  { additionalProperties: false },
);
export type CancelOrderBodyDto = Static<typeof CancelOrderBodySchema>;
