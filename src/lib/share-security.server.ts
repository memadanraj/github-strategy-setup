import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function createShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function hashSharePassword(password: string): { salt: string; hash: string } {
  const salt = randomBytes(16).toString("base64url");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

export function verifySharePassword(password: string, salt: string, expectedHash: string): boolean {
  if (!salt || !/^[0-9a-f]{128}$/i.test(expectedHash)) return false;
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHash, "hex");
    return expected.length === actual.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
