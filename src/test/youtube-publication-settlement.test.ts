import { describe, expect, it, vi } from "vitest";
import { settleYouTubePublicationFailure } from "@/lib/youtube-publication-settlement";

const video = {
  id: "yt-video-123",
  url: "https://www.youtube.com/watch?v=yt-video-123",
  providerResponse: { id: "yt-video-123" },
  uploadedAt: "2026-10-13T13:00:00.000Z",
};

describe("YouTube publication partial-failure settlement", () => {
  it("records a confirmed uploaded video as published when a follow-up step fails", async () => {
    const persist = vi.fn(async (_patch: Record<string, unknown>) => ({ data: { id: "publication-1" }, error: null }));
    const result = await settleYouTubePublicationFailure({
      cause: new Error("thumbnail upload failed"),
      uploadAttempted: true,
      uploadedVideo: video,
      thumbnailUploaded: false,
      persist,
    });
    expect(result).toMatchObject({ kind: "published", videoId: video.id, url: video.url });
    if (result.kind === "published") expect(result.warning).toContain("thumbnail upload failed");
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      status: "published",
      youtube_video_id: video.id,
      youtube_url: video.url,
      published_at: video.uploadedAt,
      error: expect.stringContaining("follow-up processing failed"),
    }));
    expect(persist).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("does not rewrite a possibly completed upload as failed when the upload response is lost", async () => {
    const persist = vi.fn(async (_patch: Record<string, unknown>) => ({ data: { id: "publication-1" }, error: null }));
    const result = await settleYouTubePublicationFailure({
      cause: new Error("socket closed"),
      uploadAttempted: true,
      uploadedVideo: null,
      thumbnailUploaded: false,
      persist,
    });
    if (result.kind !== "reconciliation") throw new Error("Expected reconciliation outcome.");
    expect(result.message).toContain("check your YouTube channel before retrying");
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: "uploading" }));
    expect(persist).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("marks a failure before upload attempt as failed", async () => {
    const persist = vi.fn(async (_patch: Record<string, unknown>) => ({ data: { id: "publication-1" }, error: null }));
    await expect(settleYouTubePublicationFailure({
      cause: new Error("could not download export"),
      uploadAttempted: false,
      uploadedVideo: null,
      thumbnailUploaded: false,
      persist,
    })).resolves.toEqual({ kind: "failed", message: "could not download export" });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("warns against retry when confirmed external success cannot be reconciled locally", async () => {
    const persist = vi.fn(async (_patch: Record<string, unknown>) => ({ data: null, error: { message: "database unavailable" } }));
    const result = await settleYouTubePublicationFailure({
      cause: new Error("thumbnail failed"),
      uploadAttempted: true,
      uploadedVideo: video,
      thumbnailUploaded: false,
      persist,
    });
    if (result.kind !== "reconciliation") throw new Error("Expected reconciliation outcome.");
    expect(result.message).toContain("Do not upload it again yet");
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: "published", youtube_video_id: video.id }));
  });

  it("handles persistence exceptions without losing the confirmed video ID", async () => {
    const result = await settleYouTubePublicationFailure({
      cause: new Error("local write failed"),
      uploadAttempted: true,
      uploadedVideo: video,
      thumbnailUploaded: true,
      persist: async () => { throw new Error("network failure"); },
    });
    if (result.kind !== "reconciliation") throw new Error("Expected reconciliation outcome.");
    expect(result).toMatchObject({ videoId: video.id, url: video.url });
    expect(result.message).toContain(video.id);
  });
});
