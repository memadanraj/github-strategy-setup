import "@tanstack/react-start/server-only";

export const DEFAULT_VISUAL_PROVIDER_TIMEOUT_MS = 45_000;
export const MAX_PROVIDER_METADATA_BYTES = 512 * 1024;

export class VisualProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "network",
  ) {
    super(message);
    this.name = "VisualProviderRequestError";
  }

  get transient(): boolean {
    return this.kind === "timeout" || this.kind === "network";
  }
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) return null;
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

export async function fetchVisualProvider(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_VISUAL_PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw new Error("Visual provider timeout configuration is invalid.");
  }

  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = errorName(error);
    if (name === "TimeoutError" || name === "AbortError") {
      throw new VisualProviderRequestError("AI provider request timed out. Please retry.", "timeout");
    }
    throw new VisualProviderRequestError("Could not reach the AI provider. Please retry.", "network");
  }
}

export async function readResponseTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Response size limit configuration is invalid.");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    try { await response.body?.cancel(); } catch { /* best-effort cancellation */ }
    throw new Error("AI provider response exceeded the configured size limit.");
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch { /* best-effort cancellation */ }
        throw new Error("AI provider response exceeded the configured size limit.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try { reader.releaseLock(); } catch { /* no-op */ }
  }
}

export async function readProviderJson<T>(
  response: Response,
  maxBytes = MAX_PROVIDER_METADATA_BYTES,
): Promise<T> {
  const text = await readResponseTextLimited(response, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("AI provider returned malformed JSON.");
  }
}
