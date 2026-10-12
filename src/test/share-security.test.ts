import { describe, expect, it } from "vitest";
import { createShareToken, hashSharePassword, hashShareToken, verifySharePassword } from "@/lib/share-security.server";

describe("project share security", () => {
  it("creates URL-safe random tokens and stores a one-way hash", () => {
    const token = createShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).not.toBe(token);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
  });

  it("uses random salts and verifies only the correct password", () => {
    const first = hashSharePassword("a-strong-password");
    const second = hashSharePassword("a-strong-password");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
    expect(verifySharePassword("a-strong-password", first.salt, first.hash)).toBe(true);
    expect(verifySharePassword("wrong-password", first.salt, first.hash)).toBe(false);
  });

  it("rejects malformed stored hashes", () => {
    expect(verifySharePassword("anything", "salt", "invalid")).toBe(false);
    expect(verifySharePassword("anything", "", "0".repeat(128))).toBe(false);
  });
});
