import { Type, type Static } from "typebox";
import { IsoTimestampSchema, UuidSchema } from "./common.js";

export const VendorStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("APPROVED"),
  Type.Literal("REJECTED"),
  Type.Literal("SUSPENDED"),
]);
export type VendorStatusDto = Static<typeof VendorStatusSchema>;

export const VendorMemberRoleSchema = Type.Union([Type.Literal("OWNER"), Type.Literal("STAFF")]);
export type VendorMemberRoleDto = Static<typeof VendorMemberRoleSchema>;

export const VendorMemberStatusSchema = Type.Union([
  Type.Literal("INVITED"),
  Type.Literal("ACTIVE"),
  Type.Literal("SUSPENDED"),
  Type.Literal("REMOVED"),
]);
export type VendorMemberStatusDto = Static<typeof VendorMemberStatusSchema>;

export const VerificationTypeSchema = Type.Union([
  Type.Literal("BUSINESS"),
  Type.Literal("IDENTITY"),
  Type.Literal("BANK_ACCOUNT"),
  Type.Literal("OTHER"),
]);
export type VendorVerificationTypeDto = Static<typeof VerificationTypeSchema>;

export const VerificationStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("VERIFIED"),
  Type.Literal("REJECTED"),
  Type.Literal("EXPIRED"),
]);
export type VendorVerificationStatusDto = Static<typeof VerificationStatusSchema>;

export const StoreStatusSchema = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("ACTIVE"),
  Type.Literal("SUSPENDED"),
  Type.Literal("CLOSED"),
]);
export type StoreStatusDto = Static<typeof StoreStatusSchema>;

export const PaymentProviderSchema = Type.Union([Type.Literal("PAYSTACK"), Type.Literal("FLUTTERWAVE")]);
export type PaymentProviderDto = Static<typeof PaymentProviderSchema>;

export const ProviderAccountStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("ACTIVE"),
  Type.Literal("SUSPENDED"),
  Type.Literal("DISABLED"),
]);
export type ProviderAccountStatusDto = Static<typeof ProviderAccountStatusSchema>;

export const VendorPermissionSchema = Type.Union([
  Type.Literal("store:create"),
  Type.Literal("store:read"),
  Type.Literal("store:update"),
  Type.Literal("product:create"),
  Type.Literal("product:read"),
  Type.Literal("product:update"),
  Type.Literal("product:archive"),
  Type.Literal("inventory:read"),
  Type.Literal("inventory:adjust"),
  Type.Literal("order:read"),
  Type.Literal("order:process"),
  Type.Literal("order:fulfill"),
  Type.Literal("refund:request"),
  Type.Literal("staff:read"),
  Type.Literal("staff:invite"),
  Type.Literal("staff:update"),
  Type.Literal("staff:remove"),
  Type.Literal("analytics:read"),
  Type.Literal("verification:manage"),
  Type.Literal("provider-account:read"),
]);
export type VendorPermissionDto = Static<typeof VendorPermissionSchema>;

const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const NullableTimestampSchema = Type.Union([IsoTimestampSchema, Type.Null()]);

export const VendorSchema = Type.Object(
  {
    id: UuidSchema,
    displayName: Type.String({ minLength: 2, maxLength: 160 }),
    legalName: NullableStringSchema,
    registrationNumber: NullableStringSchema,
    status: VendorStatusSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type VendorDto = Static<typeof VendorSchema>;

export const VendorMembershipSchema = Type.Object(
  {
    id: UuidSchema,
    vendorId: UuidSchema,
    userId: UuidSchema,
    role: VendorMemberRoleSchema,
    status: VendorMemberStatusSchema,
    permissions: Type.Array(VendorPermissionSchema, { uniqueItems: true }),
    joinedAt: NullableTimestampSchema,
  },
  { additionalProperties: false },
);
export type VendorMembershipDto = Static<typeof VendorMembershipSchema>;

export const VendorAccessSchema = Type.Object(
  { vendor: VendorSchema, membership: VendorMembershipSchema },
  { additionalProperties: false },
);
export type VendorAccessDto = Static<typeof VendorAccessSchema>;

export const VendorAccessListResponseSchema = Type.Object(
  { items: Type.Array(VendorAccessSchema) },
  { additionalProperties: false },
);
export type VendorAccessListResponseDto = Static<typeof VendorAccessListResponseSchema>;

export const VendorMemberSchema = Type.Object(
  {
    id: UuidSchema,
    vendorId: UuidSchema,
    user: Type.Object(
      {
        id: UuidSchema,
        email: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
        phone: Type.Union([Type.String({ maxLength: 24 }), Type.Null()]),
      },
      { additionalProperties: false },
    ),
    role: VendorMemberRoleSchema,
    status: VendorMemberStatusSchema,
    permissions: Type.Array(VendorPermissionSchema, { uniqueItems: true }),
    invitedAt: NullableTimestampSchema,
    joinedAt: NullableTimestampSchema,
  },
  { additionalProperties: false },
);
export type VendorMemberDto = Static<typeof VendorMemberSchema>;

export const VendorMemberListResponseSchema = Type.Object(
  { items: Type.Array(VendorMemberSchema) },
  { additionalProperties: false },
);
export type VendorMemberListResponseDto = Static<typeof VendorMemberListResponseSchema>;

export const VendorVerificationSchema = Type.Object(
  {
    id: UuidSchema,
    vendorId: UuidSchema,
    type: VerificationTypeSchema,
    status: VerificationStatusSchema,
    reference: NullableStringSchema,
    reviewedBy: Type.Union([UuidSchema, Type.Null()]),
    reviewedAt: NullableTimestampSchema,
    expiresAt: NullableTimestampSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type VendorVerificationDto = Static<typeof VendorVerificationSchema>;

export const VendorVerificationListResponseSchema = Type.Object(
  { items: Type.Array(VendorVerificationSchema) },
  { additionalProperties: false },
);
export type VendorVerificationListResponseDto = Static<typeof VendorVerificationListResponseSchema>;

export const StoreSchema = Type.Object(
  {
    id: UuidSchema,
    vendorId: UuidSchema,
    name: Type.String({ minLength: 2, maxLength: 160 }),
    slug: Type.String({ minLength: 2, maxLength: 120, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
    description: NullableStringSchema,
    status: StoreStatusSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type StoreDto = Static<typeof StoreSchema>;

export const StoreListResponseSchema = Type.Object(
  { items: Type.Array(StoreSchema) },
  { additionalProperties: false },
);
export type StoreListResponseDto = Static<typeof StoreListResponseSchema>;

export const PaymentProviderAccountSchema = Type.Object(
  {
    id: UuidSchema,
    vendorId: UuidSchema,
    provider: PaymentProviderSchema,
    externalSubaccountId: Type.String({ minLength: 1, maxLength: 200 }),
    status: ProviderAccountStatusSchema,
    createdAt: IsoTimestampSchema,
    updatedAt: IsoTimestampSchema,
  },
  { additionalProperties: false },
);
export type PaymentProviderAccountDto = Static<typeof PaymentProviderAccountSchema>;

export const PaymentProviderAccountListResponseSchema = Type.Object(
  { items: Type.Array(PaymentProviderAccountSchema) },
  { additionalProperties: false },
);
export type PaymentProviderAccountListResponseDto = Static<typeof PaymentProviderAccountListResponseSchema>;

export const VendorListResponseSchema = Type.Object(
  { items: Type.Array(VendorSchema) },
  { additionalProperties: false },
);
export type VendorListResponseDto = Static<typeof VendorListResponseSchema>;

export const CreateVendorBodySchema = Type.Object(
  {
    displayName: Type.String({ minLength: 2, maxLength: 160 }),
    legalName: Type.Optional(Type.String({ minLength: 2, maxLength: 200 })),
    registrationNumber: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
  },
  { additionalProperties: false },
);
export type CreateVendorBodyDto = Static<typeof CreateVendorBodySchema>;

export const SubmitVendorVerificationBodySchema = Type.Object(
  {
    type: VerificationTypeSchema,
    reference: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  },
  { additionalProperties: false },
);
export type SubmitVendorVerificationBodyDto = Static<typeof SubmitVendorVerificationBodySchema>;

export const CreateStoreBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 2, maxLength: 160 }),
    slug: Type.String({ minLength: 2, maxLength: 120, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
    description: Type.Optional(Type.String({ maxLength: 5000 })),
  },
  { additionalProperties: false },
);
export type CreateStoreBodyDto = Static<typeof CreateStoreBodySchema>;

export const UpdateStoreBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 2, maxLength: 160 })),
    slug: Type.Optional(Type.String({ minLength: 2, maxLength: 120, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" })),
    description: Type.Optional(Type.String({ maxLength: 5000 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateStoreBodyDto = Static<typeof UpdateStoreBodySchema>;

export const InviteVendorMemberBodySchema = Type.Object(
  {
    identifier: Type.String({ minLength: 3, maxLength: 320 }),
    permissions: Type.Array(VendorPermissionSchema, { uniqueItems: true, maxItems: 32 }),
  },
  { additionalProperties: false },
);
export type InviteVendorMemberBodyDto = Static<typeof InviteVendorMemberBodySchema>;

const MutableVendorMemberStatusSchema = Type.Union([Type.Literal("ACTIVE"), Type.Literal("SUSPENDED")]);

export const UpdateVendorMemberBodySchema = Type.Object(
  {
    role: Type.Optional(VendorMemberRoleSchema),
    status: Type.Optional(MutableVendorMemberStatusSchema),
    permissions: Type.Optional(Type.Array(VendorPermissionSchema, { uniqueItems: true, maxItems: 32 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export type UpdateVendorMemberBodyDto = Static<typeof UpdateVendorMemberBodySchema>;

export const ReviewVendorBodySchema = Type.Object(
  { reason: Type.Optional(Type.String({ minLength: 2, maxLength: 1000 })) },
  { additionalProperties: false },
);
export type ReviewVendorBodyDto = Static<typeof ReviewVendorBodySchema>;

export const ReviewVendorVerificationBodySchema = Type.Object(
  {
    status: Type.Union([Type.Literal("VERIFIED"), Type.Literal("REJECTED")]),
    reason: Type.Optional(Type.String({ minLength: 2, maxLength: 1000 })),
    expiresAt: Type.Optional(IsoTimestampSchema),
  },
  { additionalProperties: false },
);
export type ReviewVendorVerificationBodyDto = Static<typeof ReviewVendorVerificationBodySchema>;

export const RecordPaymentProviderAccountBodySchema = Type.Object(
  {
    provider: PaymentProviderSchema,
    externalSubaccountId: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false },
);
export type RecordPaymentProviderAccountBodyDto = Static<typeof RecordPaymentProviderAccountBodySchema>;

export const UpdateProviderAccountStatusBodySchema = Type.Object(
  {
    status: Type.Union([Type.Literal("ACTIVE"), Type.Literal("SUSPENDED"), Type.Literal("DISABLED")]),
    reason: Type.Optional(Type.String({ minLength: 2, maxLength: 1000 })),
  },
  { additionalProperties: false },
);
export type UpdateProviderAccountStatusBodyDto = Static<typeof UpdateProviderAccountStatusBodySchema>;

export const VendorIdParamsSchema = Type.Object({ vendorId: UuidSchema }, { additionalProperties: false });
export type VendorIdParamsDto = Static<typeof VendorIdParamsSchema>;

export const StoreIdParamsSchema = Type.Object({ storeId: UuidSchema }, { additionalProperties: false });
export type StoreIdParamsDto = Static<typeof StoreIdParamsSchema>;

export const VendorMemberParamsSchema = Type.Object(
  { vendorId: UuidSchema, memberId: UuidSchema },
  { additionalProperties: false },
);
export type VendorMemberParamsDto = Static<typeof VendorMemberParamsSchema>;

export const VendorVerificationIdParamsSchema = Type.Object(
  { verificationId: UuidSchema },
  { additionalProperties: false },
);
export type VendorVerificationIdParamsDto = Static<typeof VendorVerificationIdParamsSchema>;

export const ProviderAccountParamsSchema = Type.Object(
  { vendorId: UuidSchema, provider: PaymentProviderSchema },
  { additionalProperties: false },
);
export type ProviderAccountParamsDto = Static<typeof ProviderAccountParamsSchema>;

export const AdminVendorListQuerySchema = Type.Object(
  { status: Type.Optional(VendorStatusSchema) },
  { additionalProperties: false },
);
export type AdminVendorListQueryDto = Static<typeof AdminVendorListQuerySchema>;
