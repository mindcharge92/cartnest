import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./navigation";

describe("safeReturnTo", () => {
  it("keeps internal paths", () => {
    expect(safeReturnTo("/orders?status=paid")).toBe("/orders?status=paid");
  });

  it("rejects protocol-relative and absolute redirects", () => {
    expect(safeReturnTo("//evil.example", "/")).toBe("/");
    expect(safeReturnTo("https://evil.example", "/")).toBe("/");
  });

  it("uses the fallback for an empty value", () => {
    expect(safeReturnTo(null)).toBe("/account");
  });
});
