import { Type, type Static } from "typebox";
import { IsoTimestampSchema, UuidSchema } from "./common.js";
import { CatalogProductSummarySchema, ProductVariantSchema } from "./catalog.js";

export const WishlistItemSchema = Type.Object(
  {
    id: UuidSchema,
    product: CatalogProductSummarySchema,
    variant: Type.Union([ProductVariantSchema, Type.Null()]),
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type WishlistItemDto = Static<typeof WishlistItemSchema>;

export const WishlistUnavailableItemSchema = Type.Object(
  {
    id: UuidSchema,
    productId: UuidSchema,
    variantId: Type.Union([UuidSchema, Type.Null()]),
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type WishlistUnavailableItemDto = Static<typeof WishlistUnavailableItemSchema>;

export const WishlistResponseSchema = Type.Object(
  {
    id: UuidSchema,
    items: Type.Array(WishlistItemSchema),
    unavailableItems: Type.Array(WishlistUnavailableItemSchema),
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type WishlistResponseDto = Static<typeof WishlistResponseSchema>;

export const AddWishlistItemBodySchema = Type.Object(
  {
    productId: UuidSchema,
    variantId: Type.Optional(UuidSchema),
  },
  { additionalProperties: false },
);
export type AddWishlistItemBodyDto = Static<typeof AddWishlistItemBodySchema>;

export const WishlistItemParamsSchema = Type.Object(
  { wishlistItemId: UuidSchema },
  { additionalProperties: false },
);
export type WishlistItemParamsDto = Static<typeof WishlistItemParamsSchema>;
