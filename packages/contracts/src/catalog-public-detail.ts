import { Type, type Static } from "typebox";
import { IsoTimestampSchema, MoneySchema, UuidSchema } from "./common.js";
import {
  CategorySchema,
  ProductOptionSchema,
  ProductVariantSchema,
  PublicMediaSchema,
  PublicStoreSummarySchema,
} from "./catalog.js";

const PublicProductSlugSchema = Type.String({
  minLength: 2,
  maxLength: 160,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
});

/**
 * Buyer product-detail response as one closed object. This intentionally avoids
 * composing two additionalProperties:false objects with JSON Schema allOf,
 * which can reject properties contributed by the other branch.
 */
export const CatalogProductDetailResponseSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String({ minLength: 2, maxLength: 200 }),
    slug: PublicProductSlugSchema,
    description: Type.String({ maxLength: 20000 }),
    store: PublicStoreSummarySchema,
    category: Type.Union([CategorySchema, Type.Null()]),
    priceFrom: MoneySchema,
    media: Type.Array(PublicMediaSchema),
    createdAt: IsoTimestampSchema,
    options: Type.Array(ProductOptionSchema),
    variants: Type.Array(ProductVariantSchema),
  },
  { additionalProperties: false },
);

export type CatalogProductDetailResponseDto = Static<typeof CatalogProductDetailResponseSchema>;
