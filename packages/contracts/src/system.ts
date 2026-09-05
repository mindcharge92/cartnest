import { Type, type Static } from "typebox";
import { IsoTimestampSchema } from "./common.js";
import { DependencyStateSchema } from "./health.js";

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
