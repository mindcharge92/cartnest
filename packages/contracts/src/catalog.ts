import { Type, type Static } from "typebox";
import {
  CurrencyCodeSchema,
  IsoTimestampSchema,
  MoneySchema,
  PaginationMetaSchema,
  UuidSchema,
} from "./common.js";

const SlugSchema = Type.String({
  minLength: 2,
  maxLength: 160,
  pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
});

export const CategoryStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("INACTIVE"),
]);
export type CategoryStatusDto = Static<typeof CategoryStatusSchema>;

export const ProductStatusSchema = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("ACTIVE"),
  Type.Literal("ARCHIVED"),
]);
export type ProductStatusDto = Static<typeof ProductStatusSchema>;

export const ModerationStatusSchema = Type.Union([
  Type.Literal("NOT_REQUIRED"),
  Type.Literal("PENDING"),
  Type.Literal("APPROVED"),
  Type.Literal("REJECTED"),
  Type.Literal("FLAGGED"),
]);
export type ModerationStatusDto = Static<typeof ModerationStatusSchema>;

export const VariantStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("INACTIVE"),
]);
export type VariantStatusDto = Static<typeof VariantStatusSchema>;

export const MediaStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("ACTIVE"),
  Type.Literal("REJECTED"),
  Type.Literal("DELETED"),
]);
export type MediaStatusDto = Static<typeof MediaStatusSchema>;

export const CategorySchema = Type.Object(
  {
    id: UuidSchema,
    parentId: Type.Union([UuidSchema, Type.Null()]),
    name: Type.String({ minLength: 2, maxLength: 120 }),
    slug: SlugSchema,
    status: CategoryStatusSchema,
    sortOrder: Type.Integer(),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type CategoryDto = Static<typeof CategorySchema>;

export const CategoryListResponseSchema = Type.Object(
  { items: Type.Array(CategorySchema) },
  { additionalProperties: false },
);
export type CategoryListResponseDto = Static<typeof CategoryListResponseSchema>;

export const CreateCategoryBodySchema = Type.Object(
  {
    parentId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    name: Type.String({ minLength: 2, maxLength: 120 }),
    slug: SlugSchema,
    status: Type.Optional(CategoryStatusSchema),
    sortOrder: Type.Optional(Type.Integer({ minimum: -100000, maximum: 100000 })),
  },
  { additionalProperties: false },
);
export type CreateCategoryBodyDto = Static<typeof CreateCategoryBodySchema>;

export const UpdateCategoryBodySchema = Type.Object(
  {
    parentId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    name: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
    slug: Type.Optional(SlugSchema),
    status: Type.Optional(CategoryStatusSchema),
    sortOrder: Type.Optional(Type.Integer({ minimum: -100000, maximum: 100000 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateCategoryBodyDto = Static<typeof UpdateCategoryBodySchema>;

export const CategoryIdParamsSchema = Type.Object(
  { categoryId: UuidSchema },
  { additionalProperties: false },
);
export type CategoryIdParamsDto = Static<typeof CategoryIdParamsSchema>;

export const ProductOptionValueSchema = Type.Object(
  {
    id: UuidSchema,
    value: Type.String({ minLength: 1, maxLength: 100 }),
    position: Type.Integer(),
  },
  { additionalProperties: false },
);
export type ProductOptionValueDto = Static<typeof ProductOptionValueSchema>;

export const ProductOptionSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 80 }),
    position: Type.Integer(),
    values: Type.Array(ProductOptionValueSchema),
  },
  { additionalProperties: false },
);
export type ProductOptionDto = Static<typeof ProductOptionSchema>;

export const VariantOptionSelectionSchema = Type.Object(
  {
    optionId: UuidSchema,
    optionName: Type.String({ minLength: 1, maxLength: 80 }),
    valueId: UuidSchema,
    value: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);
export type VariantOptionSelectionDto = Static<typeof VariantOptionSelectionSchema>;

export const ProductVariantSchema = Type.Object(
  {
    id: UuidSchema,
    sku: Type.String({ minLength: 1, maxLength: 100 }),
    price: MoneySchema,
    status: VariantStatusSchema,
    optionValues: Type.Array(VariantOptionSelectionSchema),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type ProductVariantDto = Static<typeof ProductVariantSchema>;

export const VendorMediaSchema = Type.Object(
  {
    id: UuidSchema,
    ownerType: Type.Union([Type.Literal("PRODUCT"), Type.Literal("STORE")]),
    ownerId: UuidSchema,
    mimeType: Type.String({ minLength: 3, maxLength: 120 }),
    sizeBytes: Type.String({ pattern: "^(0|[1-9][0-9]*)$" }),
    width: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    height: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    originalFilename: Type.Union([Type.String({ maxLength: 255 }), Type.Null()]),
    altText: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    displayOrder: Type.Integer(),
    status: MediaStatusSchema,
    url: Type.Union([Type.String({ minLength: 1, maxLength: 4096 }), Type.Null()]),
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type VendorMediaDto = Static<typeof VendorMediaSchema>;

export const PublicMediaSchema = Type.Object(
  {
    id: UuidSchema,
    url: Type.String({ minLength: 1, maxLength: 4096 }),
    mimeType: Type.String({ minLength: 3, maxLength: 120 }),
    width: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    height: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    altText: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    displayOrder: Type.Integer(),
  },
  { additionalProperties: false },
);
export type PublicMediaDto = Static<typeof PublicMediaSchema>;

export const VendorProductSchema = Type.Object(
  {
    id: UuidSchema,
    storeId: UuidSchema,
    category: Type.Union([CategorySchema, Type.Null()]),
    name: Type.String({ minLength: 2, maxLength: 200 }),
    slug: SlugSchema,
    description: Type.String({ maxLength: 20000 }),
    status: ProductStatusSchema,
    moderationStatus: ModerationStatusSchema,
    options: Type.Array(ProductOptionSchema),
    variants: Type.Array(ProductVariantSchema),
    media: Type.Array(VendorMediaSchema),
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
    archivedAt: Type.Union([IsoTimestampSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type VendorProductDto = Static<typeof VendorProductSchema>;

export const VendorProductListResponseSchema = Type.Object(
  { items: Type.Array(VendorProductSchema) },
  { additionalProperties: false },
);
export type VendorProductListResponseDto = Static<typeof VendorProductListResponseSchema>;

export const CreateProductOptionBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 80 }),
    values: Type.Array(Type.String({ minLength: 1, maxLength: 100 }), { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: false },
);
export type CreateProductOptionBodyDto = Static<typeof CreateProductOptionBodySchema>;

export const CreateVariantSelectionBodySchema = Type.Object(
  {
    optionName: Type.String({ minLength: 1, maxLength: 80 }),
    value: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);
export type CreateVariantSelectionBodyDto = Static<typeof CreateVariantSelectionBodySchema>;

export const CreateProductVariantBodySchema = Type.Object(
  {
    sku: Type.String({ minLength: 1, maxLength: 100 }),
    price: MoneySchema,
    optionSelections: Type.Array(CreateVariantSelectionBodySchema, { maxItems: 20 }),
  },
  { additionalProperties: false },
);
export type CreateProductVariantBodyDto = Static<typeof CreateProductVariantBodySchema>;

export const CreateProductBodySchema = Type.Object(
  {
    categoryId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    name: Type.String({ minLength: 2, maxLength: 200 }),
    slug: SlugSchema,
    description: Type.String({ minLength: 1, maxLength: 20000 }),
    options: Type.Array(CreateProductOptionBodySchema, { maxItems: 10 }),
    variants: Type.Array(CreateProductVariantBodySchema, { minItems: 1, maxItems: 250 }),
  },
  { additionalProperties: false },
);
export type CreateProductBodyDto = Static<typeof CreateProductBodySchema>;

export const UpdateProductBodySchema = Type.Object(
  {
    categoryId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    name: Type.Optional(Type.String({ minLength: 2, maxLength: 200 })),
    slug: Type.Optional(SlugSchema),
    description: Type.Optional(Type.String({ minLength: 1, maxLength: 20000 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateProductBodyDto = Static<typeof UpdateProductBodySchema>;

export const CreateProductVariantFromIdsBodySchema = Type.Object(
  {
    sku: Type.String({ minLength: 1, maxLength: 100 }),
    price: MoneySchema,
    optionValueIds: Type.Array(UuidSchema, { maxItems: 20, uniqueItems: true }),
  },
  { additionalProperties: false },
);
export type CreateProductVariantFromIdsBodyDto = Static<typeof CreateProductVariantFromIdsBodySchema>;

export const UpdateProductVariantBodySchema = Type.Object(
  {
    sku: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    price: Type.Optional(MoneySchema),
    status: Type.Optional(VariantStatusSchema),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateProductVariantBodyDto = Static<typeof UpdateProductVariantBodySchema>;

export const ProductIdParamsSchema = Type.Object(
  { productId: UuidSchema },
  { additionalProperties: false },
);
export type ProductIdParamsDto = Static<typeof ProductIdParamsSchema>;

export const VariantIdParamsSchema = Type.Object(
  { variantId: UuidSchema },
  { additionalProperties: false },
);
export type VariantIdParamsDto = Static<typeof VariantIdParamsSchema>;

export const StoreIdCatalogParamsSchema = Type.Object(
  { storeId: UuidSchema },
  { additionalProperties: false },
);
export type StoreIdCatalogParamsDto = Static<typeof StoreIdCatalogParamsSchema>;

export const ProductModerationBodySchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("APPROVED"),
      Type.Literal("REJECTED"),
      Type.Literal("FLAGGED"),
    ]),
    reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
  },
  { additionalProperties: false },
);
export type ProductModerationBodyDto = Static<typeof ProductModerationBodySchema>;

export const ProductModerationQuerySchema = Type.Object(
  { status: Type.Optional(ModerationStatusSchema) },
  { additionalProperties: false },
);
export type ProductModerationQueryDto = Static<typeof ProductModerationQuerySchema>;

export const MediaOwnerTypeSchema = Type.Union([Type.Literal("PRODUCT"), Type.Literal("STORE")]);
export type MediaOwnerTypeDto = Static<typeof MediaOwnerTypeSchema>;

export const MediaUploadIntentBodySchema = Type.Object(
  {
    ownerType: MediaOwnerTypeSchema,
    ownerId: UuidSchema,
    mimeType: Type.Union([
      Type.Literal("image/jpeg"),
      Type.Literal("image/png"),
      Type.Literal("image/webp"),
    ]),
    sizeBytes: Type.Integer({ minimum: 1, maximum: 10 * 1024 * 1024 }),
    originalFilename: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
    altText: Type.Optional(Type.String({ maxLength: 300 })),
    displayOrder: Type.Optional(Type.Integer({ minimum: -100000, maximum: 100000 })),
  },
  { additionalProperties: false },
);
export type MediaUploadIntentBodyDto = Static<typeof MediaUploadIntentBodySchema>;

export const MediaUploadIntentResponseSchema = Type.Object(
  {
    media: VendorMediaSchema,
    upload: Type.Object(
      {
        method: Type.Literal("PUT"),
        url: Type.String({ minLength: 1, maxLength: 8192 }),
        headers: Type.Record(Type.String(), Type.String()),
        expiresAt: IsoTimestampSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type MediaUploadIntentResponseDto = Static<typeof MediaUploadIntentResponseSchema>;

export const CompleteMediaUploadBodySchema = Type.Object(
  {
    width: Type.Optional(Type.Integer({ minimum: 1, maximum: 50000 })),
    height: Type.Optional(Type.Integer({ minimum: 1, maximum: 50000 })),
  },
  { additionalProperties: false },
);
export type CompleteMediaUploadBodyDto = Static<typeof CompleteMediaUploadBodySchema>;

export const UpdateMediaBodySchema = Type.Object(
  {
    altText: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
    displayOrder: Type.Optional(Type.Integer({ minimum: -100000, maximum: 100000 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateMediaBodyDto = Static<typeof UpdateMediaBodySchema>;

export const MediaIdParamsSchema = Type.Object(
  { mediaId: UuidSchema },
  { additionalProperties: false },
);
export type MediaIdParamsDto = Static<typeof MediaIdParamsSchema>;

export const CatalogSortSchema = Type.Union([
  Type.Literal("NEWEST"),
  Type.Literal("NAME_ASC"),
  Type.Literal("NAME_DESC"),
]);
export type CatalogSortDto = Static<typeof CatalogSortSchema>;

export const CatalogQuerySchema = Type.Object(
  {
    q: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    categoryId: Type.Optional(UuidSchema),
    storeId: Type.Optional(UuidSchema),
    currency: Type.Optional(CurrencyCodeSchema),
    minPriceMinor: Type.Optional(Type.String({ pattern: "^(0|[1-9][0-9]*)$" })),
    maxPriceMinor: Type.Optional(Type.String({ pattern: "^(0|[1-9][0-9]*)$" })),
    sort: Type.Optional(CatalogSortSchema),
    page: Type.Optional(Type.String({ pattern: "^[1-9][0-9]*$" })),
    pageSize: Type.Optional(Type.String({ pattern: "^[1-9][0-9]*$" })),
  },
  { additionalProperties: false },
);
export type CatalogQueryDto = Static<typeof CatalogQuerySchema>;

export const PublicStoreSummarySchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 200 }),
    slug: SlugSchema,
    vendorDisplayName: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false },
);
export type PublicStoreSummaryDto = Static<typeof PublicStoreSummarySchema>;

export const CatalogProductSummarySchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String({ minLength: 2, maxLength: 200 }),
    slug: SlugSchema,
    description: Type.String({ maxLength: 20000 }),
    store: PublicStoreSummarySchema,
    category: Type.Union([CategorySchema, Type.Null()]),
    priceFrom: MoneySchema,
    media: Type.Array(PublicMediaSchema),
    createdAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type CatalogProductSummaryDto = Static<typeof CatalogProductSummarySchema>;

export const CatalogProductDetailSchema = Type.Intersect([
  CatalogProductSummarySchema,
  Type.Object(
    {
      options: Type.Array(ProductOptionSchema),
      variants: Type.Array(ProductVariantSchema),
    },
    { additionalProperties: false },
  ),
]);
export type CatalogProductDetailDto = Static<typeof CatalogProductDetailSchema>;

export const CatalogProductListResponseSchema = Type.Object(
  {
    items: Type.Array(CatalogProductSummarySchema),
    pagination: PaginationMetaSchema,
  },
  { additionalProperties: false },
);
export type CatalogProductListResponseDto = Static<typeof CatalogProductListResponseSchema>;
