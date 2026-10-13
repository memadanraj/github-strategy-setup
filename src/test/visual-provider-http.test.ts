import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VISUAL_PROVIDER_TIMEOUT_MS,
  VisualProviderRequestError,
  fetchVisualProvider,
  readProviderJson,
  readResponseTextLimited,
} from "@/lib/visual-provider-http.server";

function streamResponse(chunks: string[], headers: HeadersInit = {}): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index++] ?? ""));
    },
  });
  return new Response(body, { status: 200, headers });
}

describe("visual provider HTTP safety", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("attaches a bounded abort signal to the provider request", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await fetchVisualProvider("https://provider.example.test/start", { method: "POST" }, 30_000);
    const init = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(DEFAULT_VISUAL_PROVIDER_TIMEOUT_MS).toBe(45_000);
  });

  it("maps timeout and connection errors into retryable safe failures", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(fetchVisualProvider("https://provider.example.test/poll"))
      .rejects.toMatchObject({ name: "VisualProviderRequestError", kind: "timeout", transient: true });

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("socket failed"));
    await expect(fetchVisualProvider("https://provider.example.test/poll"))
      .rejects.toMatchObject({ name: "VisualProviderRequestError", kind: "network", transient: true });
  });

  it("rejects invalid timeout values before calling fetch", async () => {
    await expect(fetchVisualProvider("https://provider.example.test", {}, 999))
      .rejects.toThrow("timeout configuration is invalid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads chunked response bodies while enforcing actual bytes read", async () => {
    const response = streamResponse(["{\"answer\":", "\"ok\"}"]);
    await expect(readProviderJson<{ answer: string }>(response, 128))
      .resolves.toEqual({ answer: "ok" });

    const large = streamResponse(["1234", "5678"]);
    await expect(readResponseTextLimited(large, 6))
      .rejects.toThrow("response exceeded the configured size limit");
  });

  it("rejects responses whose advertised content length already exceeds the limit", async () => {
    const response = new Response("{}", { headers: { "content-length": "1000" } });
    await expect(readResponseTextLimited(response, 20))
      .rejects.toThrow("response exceeded the configured size limit");
  });

  it("returns a safe parse error for malformed JSON and supports empty responses", async () => {
    await expect(readProviderJson(streamResponse(["{bad"]), 128))
      .rejects.toThrow("AI provider returned malformed JSON");
    await expect(readResponseTextLimited(new Response(null), 128)).resolves.toBe("");
  });
});
