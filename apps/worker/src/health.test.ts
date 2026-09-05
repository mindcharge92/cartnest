import { describe, expect, it } from "vitest";
import { getWorkerHealth } from "./health.js";

describe("worker health", () => {
  it("returns a healthy worker status", () => {
    expect(getWorkerHealth()).toMatchObject({ status: "ok", service: "cartnest-worker" });
  });
});
