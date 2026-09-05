import { Type, type Static } from "typebox";
import { IsoTimestampSchema, MoneySchema, UuidSchema } from "./common.js";
import { DeliveryAddressSnapshotSchema } from "./orders.js";

export const ShipmentProviderSchema = Type.Union([Type.Literal("GIGL"), Type.Literal("MANUAL")]);
export type ShipmentProviderDto = Static<typeof ShipmentProviderSchema>;

export const ShipmentStatusSchema = Type.Union([
  Type.Literal("PENDING"), Type.Literal("BOOKED"), Type.Literal("PICKED_UP"),
  Type.Literal("IN_TRANSIT"), Type.Literal("OUT_FOR_DELIVERY"), Type.Literal("DELIVERED"),
  Type.Literal("FAILED"), Type.Literal("RETURNING"), Type.Literal("RETURNED"), Type.Literal("CANCELLED"),
]);
export type ShipmentStatusDto = Static<typeof ShipmentStatusSchema>;

export const FulfillmentProfileBodySchema = Type.Object({
  defaultProvider: ShipmentProviderSchema,
  manualDeliveryEnabled: Type.Boolean(),
  manualDeliveryFeeAmountMinor: Type.Optional(Type.String({ pattern: "^(0|[1-9][0-9]*)$" })),
  currency: Type.String({ pattern: "^[A-Z]{3}$", default: "NGN" }),
  originAddress: DeliveryAddressSnapshotSchema,
  giglStationId: Type.Optional(Type.Integer({ minimum: 1 })),
  active: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
export type FulfillmentProfileBodyDto = Static<typeof FulfillmentProfileBodySchema>;

export const VariantShippingProfileBodySchema = Type.Object({
  weightGrams: Type.Integer({ minimum: 1, maximum: 1_000_000 }),
  lengthMm: Type.Optional(Type.Integer({ minimum: 1 })),
  widthMm: Type.Optional(Type.Integer({ minimum: 1 })),
  heightMm: Type.Optional(Type.Integer({ minimum: 1 })),
  pieces: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
}, { additionalProperties: false });
export type VariantShippingProfileBodyDto = Static<typeof VariantShippingProfileBodySchema>;

export const ShippingQuoteRequestSchema = Type.Object({
  deliveryAddress: DeliveryAddressSnapshotSchema,
  receiverStationId: Type.Optional(Type.Integer({ minimum: 1 })),
}, { additionalProperties: false });
export type ShippingQuoteRequestDto = Static<typeof ShippingQuoteRequestSchema>;

export const ShippingQuoteSchema = Type.Object({
  id: UuidSchema,
  storeId: UuidSchema,
  provider: ShipmentProviderSchema,
  amount: MoneySchema,
  serviceCode: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
  expiresAt: IsoTimestampSchema,
}, { additionalProperties: false });
export type ShippingQuoteDto = Static<typeof ShippingQuoteSchema>;

export const ShippingQuoteGroupSchema = Type.Object({
  storeId: UuidSchema,
  quotes: Type.Array(ShippingQuoteSchema, { minItems: 1 }),
}, { additionalProperties: false });
export const ShippingQuoteResponseSchema = Type.Object({ groups: Type.Array(ShippingQuoteGroupSchema) }, { additionalProperties: false });
export type ShippingQuoteResponseDto = Static<typeof ShippingQuoteResponseSchema>;

export const CreateShipmentBodySchema = Type.Object({
  provider: ShipmentProviderSchema,
  items: Type.Array(Type.Object({ orderItemId: UuidSchema, quantity: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }), { minItems: 1 }),
  trackingNumber: Type.Optional(Type.String({ minLength: 2, maxLength: 160 })),
  note: Type.Optional(Type.String({ maxLength: 500 })),
}, { additionalProperties: false });
export type CreateShipmentBodyDto = Static<typeof CreateShipmentBodySchema>;

export const UpdateShipmentStatusBodySchema = Type.Object({
  status: ShipmentStatusSchema,
  message: Type.Optional(Type.String({ maxLength: 500 })),
}, { additionalProperties: false });
export type UpdateShipmentStatusBodyDto = Static<typeof UpdateShipmentStatusBodySchema>;

export const ShipmentEventSchema = Type.Object({
  id: UuidSchema,
  status: ShipmentStatusSchema,
  message: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
  location: Type.Union([Type.String({ maxLength: 240 }), Type.Null()]),
  eventTime: IsoTimestampSchema,
}, { additionalProperties: false });

export const ShipmentSchema = Type.Object({
  id: UuidSchema,
  vendorOrderId: UuidSchema,
  provider: ShipmentProviderSchema,
  providerShipmentReference: Type.Union([Type.String({ maxLength: 255 }), Type.Null()]),
  trackingNumber: Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
  status: ShipmentStatusSchema,
  fee: Type.Union([MoneySchema, Type.Null()]),
  deliveredAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  events: Type.Array(ShipmentEventSchema),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
}, { additionalProperties: false });
export type ShipmentDto = Static<typeof ShipmentSchema>;

export const ShipmentListResponseSchema = Type.Object({ items: Type.Array(ShipmentSchema) }, { additionalProperties: false });
export type ShipmentListResponseDto = Static<typeof ShipmentListResponseSchema>;

export const ShipmentIdParamsSchema = Type.Object({ shipmentId: UuidSchema }, { additionalProperties: false });
export const VendorOrderShipmentParamsSchema = Type.Object({ vendorOrderId: UuidSchema }, { additionalProperties: false });
export const StoreFulfillmentParamsSchema = Type.Object({ storeId: UuidSchema }, { additionalProperties: false });
export const VariantShippingParamsSchema = Type.Object({ variantId: UuidSchema }, { additionalProperties: false });
