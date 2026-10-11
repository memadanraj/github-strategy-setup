import { describe, expect, it } from "vitest";
import { verifyPaddleSignature } from "@/lib/paddle-security";

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedHeader(payload: string, timestamp: number, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(timestamp + ":" + payload),
  );
  return "ts=" + timestamp + ";h1=" + toHex(signature);
}

describe("verifyPaddleSignature", () => {
  const now = 1_800_000_000_000;
  const timestamp = Math.floor(now / 1000);
  const payload = JSON.stringify({ event_id: "evt_test", event_type: "transaction.completed" });
  const secret = "webhook-test-secret";

  it("accepts a valid HMAC over timestamp and raw body", async () => {
    const header = await signedHeader(payload, timestamp, secret);
    await expect(verifyPaddleSignature(payload, header, secret, now)).resolves.toBe(true);
  });

  it("rejects body tampering and invalid secrets", async () => {
    const header = await signedHeader(payload, timestamp, secret);
    await expect(verifyPaddleSignature(payload + " ", header, secret, now)).resolves.toBe(false);
    await expect(verifyPaddleSignature(payload, header, "wrong-secret", now)).resolves.toBe(false);
  });

  it("rejects timestamps outside the replay window", async () => {
    const header = await signedHeader(payload, timestamp - 301, secret);
    await expect(verifyPaddleSignature(payload, header, secret, now)).resolves.toBe(false);
  });

  it("rejects malformed or incomplete signature headers without throwing", async () => {
    await expect(verifyPaddleSignature(payload, "ts=abc;h1=not-hex", secret, now)).resolves.toBe(false);
    await expect(verifyPaddleSignature(payload, "ts=" + timestamp + ";h1=abcd", secret, now)).resolves.toBe(false);
    await expect(verifyPaddleSignature(payload, "", secret, now)).resolves.toBe(false);
  });
});
