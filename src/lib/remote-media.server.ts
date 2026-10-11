/**
 * Defensive downloader for media URLs returned by external providers.
 *
 * This prevents protocol downgrade, obvious SSRF targets, unsafe redirects,
 * oversized responses, and indefinitely stalled downloads. Provider URLs are
 * still treated as untrusted input.
 */
export type RemoteMediaOptions = {
  headers?: HeadersInit;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  allowedContentTypes?: readonly string[];
};

export type RemoteMediaResult = {
  bytes: Uint8Array;
  contentType: string;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  const c = octets[2] ?? -1;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Validate an untrusted provider URL before issuing any network request. */
export function validateRemoteMediaUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Provider returned an invalid media URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Media downloads must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Media URLs must not contain embedded credentials.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal" || hostname === "metadata") {
    throw new Error("Provider returned a non-public media host.");
  }

  // IPv6 literals are rejected conservatively. IPv4 literals are accepted only
  // when they are not private, loopback, link-local, reserved, or documentation ranges.
  if (hostname.includes(":") || hostname.startsWith("[")) {
    throw new Error("IP-literal media hosts are not allowed.");
  }
  if (isBlockedIpv4(hostname)) {
    throw new Error("Provider returned a non-public media host.");
  }

  return url;
}

function checkContentType(contentType: string, allowed?: readonly string[]) {
  if (/^text\/html(?:;|$)/i.test(contentType)) {
    throw new Error("Media provider returned an HTML page instead of a media file.");
  }
  if (!allowed?.length) return;
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!normalized || !allowed.some((item) => {
    const expected = item.toLowerCase();
    return expected.endsWith("/") ? normalized.startsWith(expected) : normalized === expected;
  })) {
    throw new Error("Media provider returned an unsupported content type.");
  }
}

/**
 * Download remote bytes with a timeout, byte cap, redirect validation, and
 * cross-origin credential stripping. Each redirect is independently checked.
 */
export async function downloadRemoteMedia(
  rawUrl: string,
  options: RemoteMediaOptions = {},
): Promise<RemoteMediaResult> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const maxRedirects = Math.max(0, options.maxRedirects ?? DEFAULT_MAX_REDIRECTS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let current: URL;
  const headers = new Headers(options.headers);

  try {
    current = validateRemoteMediaUrl(rawUrl);

    for (let redirectCount = 0; ; redirectCount++) {
      const response = await fetch(current.toString(), {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new Error("Media provider returned a redirect without a location.");
        if (redirectCount >= maxRedirects) throw new Error("Media download exceeded the redirect limit.");

        const next = validateRemoteMediaUrl(new URL(location, current).toString());
        if (next.origin !== current.origin) {
          for (const key of ["authorization", "cookie", "proxy-authorization", "lovable-api-key", "x-lovable-aig-sdk"]) {
            headers.delete(key);
          }
        }
        current = next;
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`Media download failed with HTTP ${response.status}.`);
      }

      const contentType = (response.headers.get("content-type") ?? "").trim().toLowerCase();
      checkContentType(contentType, options.allowedContentTypes);

      const lengthHeader = response.headers.get("content-length");
      if (lengthHeader !== null) {
        const declaredLength = Number(lengthHeader);
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          await response.body?.cancel().catch(() => undefined);
          throw new Error("Media download exceeds the configured size limit.");
        }
      }

      if (!response.body) throw new Error("Media provider returned an empty response.");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new Error("Media download exceeds the configured size limit.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      if (totalBytes === 0) throw new Error("Media provider returned an empty file.");
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { bytes, contentType };
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Media download timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
