import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadRemoteMedia, validateRemoteMediaUrl } from "@/lib/remote-media.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("validateRemoteMediaUrl", () => {
  it("accepts HTTPS URLs on public DNS hostnames", () => {
    expect(validateRemoteMediaUrl("https://cdn.example.com/video.mp4").hostname).toBe("cdn.example.com");
  });

  it.each([
    "http://cdn.example.com/video.mp4",
    "https://user:password@cdn.example.com/video.mp4",
    "https://localhost/video.mp4",
    "https://app.localhost/video.mp4",
    "https://files.local/video.mp4",
    "https://service.internal/video.mp4",
    "https://metadata.google.internal/latest/meta-data",
    "https://127.0.0.1/video.mp4",
    "https://10.0.0.8/video.mp4",
    "https://172.20.0.1/video.mp4",
    "https://192.168.1.2/video.mp4",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/video.mp4",
  ])("rejects unsafe media URL: %s", (url) => {
    expect(() => validateRemoteMediaUrl(url)).toThrow();
  });

  it("rejects malformed URLs with a stable error", () => {
    expect(() => validateRemoteMediaUrl("not a url")).toThrow("Provider returned an invalid media URL.");
  });
});

describe("downloadRemoteMedia", () => {
  it("downloads a bounded payload and returns its content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "3" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadRemoteMedia("https://cdn.example.com/clip.mp4", {
      allowedContentTypes: ["video/", "application/octet-stream"],
      maxBytes: 3,
    });

    expect([...result.bytes]).toEqual([1, 2, 3]);
    expect(result.contentType).toBe("video/mp4");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.example.com/clip.mp4",
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
  });

  it("rejects a declared payload that is larger than the configured limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "300" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadRemoteMedia("https://cdn.example.com/clip.mp4", {
        allowedContentTypes: ["video/"],
        maxBytes: 20,
      }),
    ).rejects.toThrow("Media download exceeds the configured size limit.");
  });

  it("rejects a payload that exceeds the limit while streaming", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(body, { status: 200, headers: { "content-type": "video/mp4" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadRemoteMedia("https://cdn.example.com/clip.mp4", {
        allowedContentTypes: ["video/"],
        maxBytes: 10,
      }),
    ).rejects.toThrow("Media download exceeds the configured size limit.");
  });

  it("validates every redirect before making the redirected request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/internal" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadRemoteMedia("https://cdn.example.com/redirect")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("strips provider credentials after a cross-origin redirect", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://assets.example.net/clip.mp4" } }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([9]), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "1" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await downloadRemoteMedia("https://api.example.com/clip", {
      headers: { Authorization: "Bearer secret", "Lovable-API-Key": "secret" },
      allowedContentTypes: ["video/"],
    });

    const secondOptions = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const headers = new Headers(secondOptions.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("lovable-api-key")).toBe(false);
  });

  it("rejects an HTML response rather than storing an error page as media", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>error</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadRemoteMedia("https://cdn.example.com/clip.mp4")).rejects.toThrow(
      "Media provider returned an HTML page instead of a media file.",
    );
  });

  it("rejects redirects beyond the configured limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: "https://cdn.example.com/redirect-again" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadRemoteMedia("https://cdn.example.com/redirect", { maxRedirects: 1 }),
    ).rejects.toThrow("Media download exceeded the redirect limit.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
