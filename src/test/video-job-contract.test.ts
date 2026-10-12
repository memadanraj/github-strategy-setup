import { describe, expect, it } from "vitest";
import {
  normalizeProviderVideoStatus,
  readProviderJobId,
  readProviderVideoError,
  readProviderVideoUrl,
} from "@/lib/video-job-contract";

describe("video provider response normalization", () => {
  it.each([
    [{ id: " job-123 " }, "job-123"],
    [{ id: "" }, null],
    [{ id: 123 }, null],
    [null, null],
    ["job-123", null],
  ])("accepts only a non-empty string job ID: %j", (payload, expected) => {
    expect(readProviderJobId(payload)).toBe(expected);
  });

  it.each([
    [{ url: " https://cdn.example.com/a.mp4 " }, "https://cdn.example.com/a.mp4"],
    [{ video_url: "https://cdn.example.com/b.mp4" }, "https://cdn.example.com/b.mp4"],
    [{ video: { url: "https://cdn.example.com/c.mp4" } }, "https://cdn.example.com/c.mp4"],
    [{ output: { url: "https://cdn.example.com/d.mp4" } }, "https://cdn.example.com/d.mp4"],
    [{ output: { url: 42 } }, null],
    [{}, null],
    [null, null],
  ])("normalizes supported output URL shapes: %j", (payload, expected) => {
    expect(readProviderVideoUrl(payload)).toBe(expected);
  });

  it.each([
    ["completed", "completed"],
    ["succeeded", "completed"],
    ["failed", "failed"],
    ["error", "failed"],
    ["cancelled", "failed"],
    ["queued", "processing"],
    ["running", "processing"],
    [undefined, "processing"],
  ] as const)("normalizes provider status %s", (status, expected) => {
    expect(normalizeProviderVideoStatus(status)).toBe(expected);
  });

  it("extracts provider errors without leaking arbitrary object values", () => {
    expect(readProviderVideoError({ error: { message: "bad prompt" } })).toBe("bad prompt");
    expect(readProviderVideoError({ error: "provider unavailable" })).toBe("provider unavailable");
    expect(readProviderVideoError({ error: { code: 500 } })).toBeNull();
    expect(readProviderVideoError(null)).toBeNull();
  });
});
