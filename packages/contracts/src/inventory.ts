import { Type, type Static } from "typebox";
import { IsoTimestampSchema, UuidSchema } from "./common.js";
import { VariantOptionSelectionSchema } from "./catalog.js";

export const InventoryItemSchema = Type.Object(
  {
    variantId: UuidSchema,
    productId: UuidSchema,
    storeId: UuidSchema,
    productName: Type.String({ minLength: 1, maxLength: 200 }),
    sku: Type.String({ minLength: 1, maxLength: 100 }),
    optionValues: Type.Array(VariantOptionSelectionSchema),
    onHand: Type.Integer({ minimum: 0 }),
    reserved: Type.Integer({ minimum: 0 }),
    available: Type.Integer({ minimum: 0 }),
    version: Type.Integer({ minimum: 0 }),
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type InventoryItemDto = Static<typeof InventoryItemSchema>;

export const InventoryListResponseSchema = Type.Object(
  { items: Type.Array(InventoryItemSchema) },
  { additionalProperties: false },
);
export type InventoryListResponseDto = Static<typeof InventoryListResponseSchema>;

export const InventoryAdjustmentSchema = Type.Object(
  {
    id: UuidSchema,
    variantId: UuidSchema,
    delta: Type.Integer(),
    reason: Type.String({ minLength: 1, maxLength: 300 }),
    referenceType: Type.Union([Type.String({ maxLength: 100 }), Type.Null()]),
    referenceId: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    actorUserId: Type.Union([UuidSchema, Type.Null()]),
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type InventoryAdjustmentDto = Static<typeof InventoryAdjustmentSchema>;

export const InventoryAdjustmentListResponseSchema = Type.Object(
  { items: Type.Array(InventoryAdjustmentSchema) },
  { additionalProperties: false },
);
export type InventoryAdjustmentListResponseDto = Static<typeof InventoryAdjustmentListResponseSchema>;

export const AdjustInventoryBodySchema = Type.Object(
  {
    delta: Type.Integer({ minimum: -1000000000, maximum: 1000000000 }),
    reason: Type.String({ minLength: 2, maxLength: 300 }),
    expectedVersion: Type.Integer({ minimum: 0 }),
    referenceType: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    referenceId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  },
  { additionalProperties: false },
);
export type AdjustInventoryBodyDto = Static<typeof AdjustInventoryBodySchema>;

export const VariantInventoryParamsSchema = Type.Object(
  { variantId: UuidSchema },
  { additionalProperties: false },
);
export type VariantInventoryParamsDto = Static<typeof VariantInventoryParamsSchema>;

export const StoreInventoryParamsSchema = Type.Object(
  { storeId: UuidSchema },
  { additionalProperties: false },
);
export type StoreInventoryParamsDto = Static<typeof StoreInventoryParamsSchema>;
