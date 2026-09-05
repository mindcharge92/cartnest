import { Static, Type } from "@sinclair/typebox";

export const HealthResponseSchema = Type.Object(
  {
    status: Type.Literal("ok"),
    service: Type.Literal("cartnest-api"),
    uptimeSeconds: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type HealthResponseDto = Static<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = Type.Object(
  {
    status: Type.Union([Type.Literal("ready"), Type.Literal("degraded")]),
    service: Type.Literal("cartnest-api"),
    dependencies: Type.Object({
      database: Type.Union([Type.Literal("ready"), Type.Literal("not-ready")]),
      redis: Type.Union([Type.Literal("configured"), Type.Literal("not-configured")]),
    }),
  },
  { additionalProperties: false },
);
export type ReadinessResponseDto = Static<typeof ReadinessResponseSchema>;
