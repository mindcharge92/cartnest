import { Type, type Static } from "typebox";
import { IsoTimestampSchema } from "./common.js";

export const DependencyStateSchema = Type.Union([
  Type.Literal("ready"),
  Type.Literal("unavailable"),
]);

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
    status: Type.Union([Type.Literal("ready"), Type.Literal("not-ready")]),
    service: Type.Literal("cartnest-api"),
    dependencies: Type.Object(
      {
        database: DependencyStateSchema,
        redis: DependencyStateSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ReadinessResponseDto = Static<typeof ReadinessResponseSchema>;

export const SystemInfoResponseSchema = Type.Object(
  {
    service: Type.Literal("cartnest-api"),
    apiVersion: Type.Literal("v1"),
    timestamp: IsoTimestampSchema,
    dependencies: Type.Object(
      {
        database: DependencyStateSchema,
        redis: DependencyStateSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type SystemInfoResponseDto = Static<typeof SystemInfoResponseSchema>;
