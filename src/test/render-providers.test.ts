import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpRenderProvider,
  ShotstackRenderProvider,
  toShotstackEdit,
  type RenderManifest,
} from "@/lib/render.providers.server";

const baseManifest = (overrides: Partial<RenderManifest> = {}): RenderManifest => ({
  projectId: "project-1",
  width: 1920,
  height: 1080,
  fps: 30,
  format: "long",
  scenes: [],
  tracks: [],
  clips: [],
  captions: [],
  assets: [],
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toShotstackEdit", () => {
  it("maps visible video/image clips and audio clips into separate tracks", () => {
    const manifest = baseManifest({
      tracks: [
        { id: "video-track", track_type: "video", visible: true, muted: false },
        { id: "music-track", track_type: "music", visible: true, muted: false, volume: 0.5 },
        { id: "hidden-track", track_type: "video", visible: false, muted: false },
      ],
      assets: [
        { id: "video", kind: "video", url: "https://cdn.example.com/v.mp4" },
        { id: "music", kind: "audio", url: "https://cdn.example.com/m.mp3" },
        { id: "image", kind: "image", url: "https://cdn.example.com/i.png" },
      ],
      clips: [
        { asset_id: "video", track_id: "video-track", start_seconds: 2, duration_seconds: 4, source_start_seconds: 1 },
        { asset_id: "music", track_id: "music-track", start_seconds: 0, duration_seconds: 6, volume: 0.8 },
        { asset_id: "image", track_id: "hidden-track", start_seconds: 0, duration_seconds: 2 },
      ],
      captions: [
        { text: "  Hello world  ", start_seconds: 1, end_seconds: 3, position: "top" },
        { text: "  ", start_seconds: 3, end_seconds: 4 },
      ],
    });

    const edit = toShotstackEdit(manifest);
    expect(edit.output).toEqual({ format: "mp4", fps: 30, size: { width: 1920, height: 1080 } });
    expect(edit.timeline.tracks).toHaveLength(3);
    expect(edit.timeline.tracks[0]?.clips[0]).toMatchObject({
      asset: { type: "title", text: "  Hello world  ", position: "top" },
      start: 1,
      length: 2,
    });
    expect(edit.timeline.tracks[1]?.clips[0]).toMatchObject({
      asset: { type: "video", src: "https://cdn.example.com/v.mp4", trim: 1 },
      start: 2,
      length: 4,
    });
    expect(edit.timeline.tracks[2]?.clips[0]).toMatchObject({
      asset: { type: "audio", src: "https://cdn.example.com/m.mp3", volume: 0.4 },
      start: 0,
      length: 6,
    });
  });

  it("falls back to ordered scenes when there are no timeline visuals", () => {
    const edit = toShotstackEdit(baseManifest({
      scenes: [
        { id: "s1", duration_seconds: 4, image_url: "https://cdn.example.com/1.png" },
        { id: "s2", duration_seconds: 6, clip_url: "https://cdn.example.com/2.mp4" },
      ],
      width: 1080,
      height: 1920,
      fps: 24,
    }));
    const visualTrack = edit.timeline.tracks.find((track) =>
      track.clips.some((clip) => clip.asset.type === "image" || clip.asset.type === "video"),
    );
    expect(visualTrack?.clips).toHaveLength(2);
    expect(visualTrack?.clips.map((clip) => clip.start)).toEqual([0, 4]);
    expect(edit.output).toEqual({ format: "mp4", fps: 24, size: { width: 1080, height: 1920 } });
  });

  it("does not include media without a signed URL and throws when nothing can be rendered", () => {
    expect(() => toShotstackEdit(baseManifest({
      assets: [{ id: "private", kind: "video", storage_path: "private/v.mp4" }],
      clips: [{ asset_id: "private", track_id: "track", start_seconds: 0, duration_seconds: 3 }],
      tracks: [{ id: "track", track_type: "video" }],
    }))).toThrow("Nothing to render");
  });

  it("clamps caption durations and clip lengths to positive values", () => {
    const edit = toShotstackEdit(baseManifest({
      assets: [{ id: "image", kind: "image", url: "https://cdn.example.com/i.png" }],
      tracks: [{ id: "track", track_type: "video" }],
      clips: [{ asset_id: "image", track_id: "track", start_seconds: 0, duration_seconds: 0 }],
      captions: [{ text: "caption", start_seconds: 4, end_seconds: 3 }],
    }));
    expect(edit.timeline.tracks[0]?.clips[0]?.length).toBe(0.2);
    expect(edit.timeline.tracks[1]?.clips[0]?.length).toBeGreaterThan(0);
  });
});

describe("HttpRenderProvider", () => {
  it("submits manifests with bearer credentials and accepts either job ID field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: "job-123" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new HttpRenderProvider("https://renderer.example.com/", "server-secret");
    const result = await provider.submit(baseManifest());

    expect(result.providerJobId).toBe("job-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://renderer.example.com/jobs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer server-secret" }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toHaveProperty("manifest.projectId", "project-1");
  });

  it("rejects successful but malformed submission responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(new HttpRenderProvider("https://renderer.example.com").submit(baseManifest()))
      .rejects.toThrow("Renderer returned no job id");
  });

  it("normalizes terminal statuses returned by a compatible renderer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "succeeded", progress: 100, output_url: "https://cdn.example.com/out.mp4" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ));
    const result = await new HttpRenderProvider("https://renderer.example.com").status("render/with spaces");
    expect(result).toEqual({
      status: "completed",
      progress: 100,
      outputUrl: "https://cdn.example.com/out.mp4",
      error: undefined,
    });
  });

  it("surfaces non-2xx submission and status responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })));
    const provider = new HttpRenderProvider("https://renderer.example.com");
    await expect(provider.submit(baseManifest())).rejects.toThrow("Renderer submit failed (502)");
    await expect(provider.status("job-123")).rejects.toThrow("Renderer status failed (502)");
  });
});

describe("ShotstackRenderProvider", () => {
  it("maps a completed Shotstack render to a completed job", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ response: { status: "done", url: "https://cdn.example.com/out.mp4" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ShotstackRenderProvider("shotstack-key", "stage").status("render-123");
    expect(result).toEqual({ status: "completed", progress: 100, outputUrl: "https://cdn.example.com/out.mp4" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.shotstack.io/edit/stage/render/render-123",
      expect.objectContaining({ headers: { "x-api-key": "shotstack-key" } }),
    );
  });

  it("returns readable errors when Shotstack rejects credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    )));
    await expect(new ShotstackRenderProvider("invalid", "stage").submit(
      baseManifest({ scenes: [{ duration_seconds: 3, image_url: "https://cdn.example.com/img.png" }] }),
    )).rejects.toThrow("Shotstack rejected the API key.");
  });
});
