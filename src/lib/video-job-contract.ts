export type ProviderVideoPayload = {
  id?: unknown;
  status?: unknown;
  url?: unknown;
  video_url?: unknown;
  video?: { url?: unknown } | null;
  output?: { url?: unknown } | null;
  error?: { message?: unknown } | string | null;
};

/** Read a provider job identifier without trusting the decoded JSON shape. */
export function readProviderJobId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as ProviderVideoPayload).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Normalize the output URL variants used by supported video gateway responses. */
export function readProviderVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const result = payload as ProviderVideoPayload;
  const candidates = [
    result.url,
    result.video_url,
    result.video?.url,
    result.output?.url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

export function normalizeProviderVideoStatus(status: unknown):
  | "completed"
  | "failed"
  | "processing" {
  if (status === "completed" || status === "succeeded") return "completed";
  if (status === "failed" || status === "error" || status === "cancelled") return "failed";
  return "processing";
}

export function readProviderVideoError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as ProviderVideoPayload).error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return null;
}
