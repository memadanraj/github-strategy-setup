function hexBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Validate Paddle's timestamped HMAC signature using the raw request body. */
export async function verifyPaddleSignature(
  payload: string,
  header: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const parts = Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index <= 0) return ["", ""];
    return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
  }));

  const timestamp = Number(parts["ts"]);
  const signature = parts["h1"];
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || !signature ||
      !/^[0-9a-f]{64}$/i.test(signature)) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > 300) return false;
  if (!secret) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      hexBytes(signature),
      new TextEncoder().encode(timestamp + ":" + payload),
    );
  } catch {
    return false;
  }
}
