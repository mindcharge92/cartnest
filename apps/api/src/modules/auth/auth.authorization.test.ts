import { describe, expect, it } from "vitest";
import { requirePlatformRole, requirePrivilegedMfa } from "./auth.authorization.js";
import type { AccessPrincipal } from "./auth.crypto.js";

const customer: AccessPrincipal = {
  userId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  platformRole: "USER",
  mfaSatisfied: false,
};

describe("authorization primitives", () => {
  it("blocks a customer from admin-only authorization", () => {
    expect(() => requirePlatformRole(customer, ["ADMIN", "SUPER_ADMIN"])).toThrow();
  });

  it("requires MFA for privileged roles", () => {
    expect(() =>
      requirePrivilegedMfa({ ...customer, platformRole: "ADMIN", mfaSatisfied: false }),
    ).toThrow();
    expect(() =>
      requirePrivilegedMfa({ ...customer, platformRole: "ADMIN", mfaSatisfied: true }),
    ).not.toThrow();
  });
});
