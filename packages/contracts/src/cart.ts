import { Type, type Static } from "typebox";
import { IsoTimestampSchema, MoneySchema, UuidSchema } from "./common.js";
import { PublicMediaSchema, ProductVariantSchema, PublicStoreSummarySchema } from "./catalog.js";

export const CartStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("CONVERTED"),
  Type.Literal("ABANDONED"),
]);
export type CartStatusDto = Static<typeof CartStatusSchema>;

export const CartProductSummarySchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 200 }),
    slug: Type.String({ minLength: 1, maxLength: 200 }),
    store: PublicStoreSummarySchema,
    media: Type.Array(PublicMediaSchema),
  },
  { additionalProperties: false },
);
export type CartProductSummaryDto = Static<typeof CartProductSummarySchema>;

export const CartItemSchema = Type.Object(
  {
    id: UuidSchema,
    quantity: Type.Integer({ minimum: 1 }),
    product: CartProductSummarySchema,
    variant: ProductVariantSchema,
    availableQuantity: Type.Integer({ minimum: 0 }),
    lineSubtotal: MoneySchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type CartItemDto = Static<typeof CartItemSchema>;

export const CartResponseSchema = Type.Object(
  {
    id: UuidSchema,
    status: CartStatusSchema,
    items: Type.Array(CartItemSchema),
    itemCount: Type.Integer({ minimum: 0 }),
    distinctStoreCount: Type.Integer({ minimum: 0 }),
    subtotal: MoneySchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type CartResponseDto = Static<typeof CartResponseSchema>;

export const AddCartItemBodySchema = Type.Object(
  {
    variantId: UuidSchema,
    quantity: Type.Integer({ minimum: 1, maximum: 1000 }),
  },
  { additionalProperties: false },
);
export type AddCartItemBodyDto = Static<typeof AddCartItemBodySchema>;

export const UpdateCartItemBodySchema = Type.Object(
  { quantity: Type.Integer({ minimum: 1, maximum: 1000 }) },
  { additionalProperties: false },
);
export type UpdateCartItemBodyDto = Static<typeof UpdateCartItemBodySchema>;

export const CartItemParamsSchema = Type.Object(
  { cartItemId: UuidSchema },
  { additionalProperties: false },
);
export type CartItemParamsDto = Static<typeof CartItemParamsSchema>;

export const CheckoutPreviewIssueCodeSchema = Type.Union([
  Type.Literal("PRODUCT_UNAVAILABLE"),
  Type.Literal("VARIANT_UNAVAILABLE"),
  Type.Literal("STORE_UNAVAILABLE"),
  Type.Literal("VENDOR_UNAVAILABLE"),
  Type.Literal("INSUFFICIENT_STOCK"),
  Type.Literal("PRICE_CHANGED"),
]);
export type CheckoutPreviewIssueCodeDto = Static<typeof CheckoutPreviewIssueCodeSchema>;

export const CheckoutPreviewIssueSchema = Type.Object(
  {
    cartItemId: UuidSchema,
    code: CheckoutPreviewIssueCodeSchema,
    message: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export type CheckoutPreviewIssueDto = Static<typeof CheckoutPreviewIssueSchema>;

export const CheckoutPreviewStoreGroupSchema = Type.Object(
  {
    store: PublicStoreSummarySchema,
    itemCount: Type.Integer({ minimum: 1 }),
    subtotal: MoneySchema,
  },
  { additionalProperties: false },
);
export type CheckoutPreviewStoreGroupDto = Static<typeof CheckoutPreviewStoreGroupSchema>;

export const CheckoutPreviewResponseSchema = Type.Object(
  {
    cartId: UuidSchema,
    ready: Type.Boolean(),
    currency: Type.String({ pattern: "^[A-Z]{3}$" }),
    subtotal: MoneySchema,
    itemCount: Type.Integer({ minimum: 0 }),
    storeGroups: Type.Array(CheckoutPreviewStoreGroupSchema),
    issues: Type.Array(CheckoutPreviewIssueSchema),
    generatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type CheckoutPreviewResponseDto = Static<typeof CheckoutPreviewResponseSchema>;
