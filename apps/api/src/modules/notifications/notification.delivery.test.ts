import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptEmail, encryptEmail, ResendEmailSender } from "./notification.delivery.js";

afterEach(() => vi.unstubAllGlobals());

describe("notification delivery security", () => {
  it("encrypts tokens at rest and authenticates the ciphertext", () => {
    const message = { subject: "Verify", text: "https://example.test/verify#token=private-token" };
    const encrypted = encryptEmail(message, "a-secret-key");
    expect(encrypted).not.toContain("private-token");
    expect(decryptEmail(encrypted, "a-secret-key")).toEqual(message);
    expect(() => decryptEmail(encrypted, "wrong-key")).toThrow();
    const tampered = Buffer.from(encrypted, "base64url");
    tampered[30] = tampered[30]! ^ 1;
    expect(() => decryptEmail(tampered.toString("base64url"), "a-secret-key")).toThrow();
  });

  it("reuses a stable provider key and sends only the approved email fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-id" })));
    vi.stubGlobal("fetch", fetchMock);
    const sender = new ResendEmailSender("private-key", "CartNest <mail@example.test>");
    await expect(sender.send("buyer@example.test", { subject: "Order", text: "Order placed" }, "notification-1"))
      .resolves.toBe("provider-id");
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.redirect).toBe("error");
    expect(request.headers["idempotency-key"]).toBe("notification-1");
    expect(JSON.parse(request.body)).toEqual({
      from: "CartNest <mail@example.test>", to: ["buyer@example.test"], subject: "Order", text: "Order placed",
    });
  });

  it("does not expose provider response bodies on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private recipient and credentials", { status: 429 })));
    await expect(new ResendEmailSender("key", "sender").send("recipient", { subject: "s", text: "t" }, "id"))
      .rejects.toThrow("EMAIL_PROVIDER_HTTP_429");
  });
});
