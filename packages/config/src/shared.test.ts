import { describe, expect, it } from "vitest";
import { readPort, readRuntimeEnvironment, readUrl } from "./shared.js";

describe("environment validation", () => {
  it("uses development as the default environment", () => {
    expect(readRuntimeEnvironment({})).toBe("development");
  });

  it("rejects invalid ports", () => {
    expect(() => readPort({ PORT: "70000" }, "PORT", 4000)).toThrow();
  });

  it("normalizes valid URLs", () => {
    expect(readUrl({ API_URL: "https://example.com" }, "API_URL")).toBe("https://example.com/");
  });
});
