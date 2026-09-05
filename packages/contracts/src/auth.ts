import { Type, type Static } from "typebox";
import { IsoTimestampSchema, UuidSchema } from "./common.js";

const EmailSchema = Type.String({
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
  maxLength: 320,
});

export const PlatformRoleSchema = Type.Union([
  Type.Literal("USER"),
  Type.Literal("ADMIN"),
  Type.Literal("SUPER_ADMIN"),
]);
export type PlatformRoleDto = Static<typeof PlatformRoleSchema>;

export const UserStatusSchema = Type.Union([
  Type.Literal("PENDING_VERIFICATION"),
  Type.Literal("ACTIVE"),
  Type.Literal("SUSPENDED"),
  Type.Literal("DISABLED"),
]);
export type UserStatusDto = Static<typeof UserStatusSchema>;

export const AuthUserSchema = Type.Object(
  {
    id: UuidSchema,
    email: Type.Union([EmailSchema, Type.Null()]),
    phone: Type.Union([Type.String({ minLength: 7, maxLength: 24 }), Type.Null()]),
    emailVerified: Type.Boolean(),
    phoneVerified: Type.Boolean(),
    status: UserStatusSchema,
    platformRole: PlatformRoleSchema,
  },
  { additionalProperties: false },
);
export type AuthUserDto = Static<typeof AuthUserSchema>;

export const MfaStateSchema = Type.Object(
  {
    required: Type.Boolean(),
    enrolled: Type.Boolean(),
    satisfied: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type MfaStateDto = Static<typeof MfaStateSchema>;

export const AuthSessionResponseSchema = Type.Object(
  {
    user: AuthUserSchema,
    accessExpiresAt: IsoTimestampSchema,
    refreshExpiresAt: IsoTimestampSchema,
    csrfToken: Type.String({ minLength: 32, maxLength: 256 }),
    mfa: MfaStateSchema,
  },
  { additionalProperties: false },
);
export type AuthSessionResponseDto = Static<typeof AuthSessionResponseSchema>;

export const RegisterBodySchema = Type.Object(
  {
    email: Type.Optional(EmailSchema),
    phone: Type.Optional(Type.String({ minLength: 7, maxLength: 24 })),
    password: Type.String({ minLength: 12, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type RegisterBodyDto = Static<typeof RegisterBodySchema>;

export const LoginBodySchema = Type.Object(
  {
    identifier: Type.String({ minLength: 3, maxLength: 320 }),
    password: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type LoginBodyDto = Static<typeof LoginBodySchema>;

export const AcceptedResponseSchema = Type.Object(
  { accepted: Type.Literal(true) },
  { additionalProperties: false },
);
export type AcceptedResponseDto = Static<typeof AcceptedResponseSchema>;

export const PasswordResetRequestBodySchema = Type.Object(
  { identifier: Type.String({ minLength: 3, maxLength: 320 }) },
  { additionalProperties: false },
);
export type PasswordResetRequestBodyDto = Static<typeof PasswordResetRequestBodySchema>;

export const PasswordResetConfirmBodySchema = Type.Object(
  {
    token: Type.String({ minLength: 32, maxLength: 4096 }),
    newPassword: Type.String({ minLength: 12, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type PasswordResetConfirmBodyDto = Static<typeof PasswordResetConfirmBodySchema>;

export const VerificationChannelSchema = Type.Union([Type.Literal("email"), Type.Literal("phone")]);
export type VerificationChannelDto = Static<typeof VerificationChannelSchema>;

export const VerificationRequestBodySchema = Type.Object(
  { channel: VerificationChannelSchema },
  { additionalProperties: false },
);
export type VerificationRequestBodyDto = Static<typeof VerificationRequestBodySchema>;

export const VerificationConfirmBodySchema = Type.Object(
  { token: Type.String({ minLength: 32, maxLength: 4096 }) },
  { additionalProperties: false },
);
export type VerificationConfirmBodyDto = Static<typeof VerificationConfirmBodySchema>;

export const MfaCodeBodySchema = Type.Object(
  { code: Type.String({ pattern: "^[0-9]{6}$" }) },
  { additionalProperties: false },
);
export type MfaCodeBodyDto = Static<typeof MfaCodeBodySchema>;

export const MfaEnrollmentResponseSchema = Type.Object(
  {
    otpauthUri: Type.String({ minLength: 16, maxLength: 4096 }),
    secret: Type.String({ minLength: 16, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export type MfaEnrollmentResponseDto = Static<typeof MfaEnrollmentResponseSchema>;

export const GoogleOAuthStartQuerySchema = Type.Object(
  {
    intent: Type.Optional(Type.Union([Type.Literal("login"), Type.Literal("link")])),
  },
  { additionalProperties: false },
);
export type GoogleOAuthStartQueryDto = Static<typeof GoogleOAuthStartQuerySchema>;
