import { describe, expect, it } from "vitest";
import {
  buildTotpUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hashOpaqueToken,
  hashPassword,
  normalizePhone,
  randomOpaqueToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./auth.crypto.js";

const secret = "test-auth-secret-that-is-at-least-thirty-two-characters";

describe("authentication cryptography", () => {
  it("hashes and verifies passwords without storing plaintext", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hashPassword(password);
    expect(passwordHash).not.toContain(password);
    expect(await verifyPassword(passwordHash, password)).toBe(true);
    expect(await verifyPassword(passwordHash, "wrong password")).toBe(false);
  });

  it("signs and verifies access credentials", async () => {
    const token = await signAccessToken(secret, {
      userId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      platformRole: "ADMIN",
      mfaSatisfied: true,
    });
    await expect(verifyAccessToken(secret, token)).resolves.toMatchObject({
      platformRole: "ADMIN",
      mfaSatisfied: true,
    });
  });

  it("normalizes common Nigerian phone input", () => {
    expect(normalizePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalizePhone("2348031234567")).toBe("+2348031234567");
  });

  it("encrypts MFA secrets at rest", () => {
    const mfaSecret = generateTotpSecret();
    const encrypted = encryptSecret(mfaSecret, secret);
    expect(encrypted).not.toContain(mfaSecret);
    expect(decryptSecret(encrypted, secret)).toBe(mfaSecret);
    expect(buildTotpUri(mfaSecret, "admin@example.com")).toContain("otpauth://totp/");
  });

  it("creates high-entropy opaque refresh material", () => {
    const token = randomOpaqueToken();
    expect(token.length).toBeGreaterThan(32);
    expect(hashOpaqueToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
