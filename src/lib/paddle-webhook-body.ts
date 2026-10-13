export const MAX_PADDLE_WEBHOOK_BODY_BYTES = 1024 * 1024;

export type BoundedRequestTextResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Read raw request bytes with a hard cap before signature verification or JSON
 * parsing. Content-Length is an early-rejection hint; streamed bytes are still
 * counted so a missing or incorrect header cannot bypass the limit.
 */
export async function readBoundedRequestText(
  request: Request,
  maxBytes = MAX_PADDLE_WEBHOOK_BODY_BYTES,
): Promise<BoundedRequestTextResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Invalid request-body byte limit.");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    try {
      await request.body?.cancel();
    } catch {
      // Cancellation is best-effort; the request is rejected either way.
    }
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Keep the deterministic size-limit result.
        }
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The cancelled/errored stream may already have released its lock.
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, text: new TextDecoder().decode(bytes) };
}
