import { describe, expect, it, vi } from "vitest";
import { rebuildProjectTimeline, regenerateProjectCaptions } from "@/lib/timeline-operations";

describe("atomic timeline operation client contract", () => {
  it("rebuilds clips with one project-scoped RPC and validates the count", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { clips_created: 4, tracks_created: 2, width: 1920, height: 1080 },
      error: null,
    });
    await expect(rebuildProjectTimeline(rpc, "project-1")).resolves.toEqual({ clipCount: 4 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith({ _project_id: "project-1" });
  });

  it("preserves the previous timeline when the rebuild RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "insert failed" } });
    await expect(rebuildProjectTimeline(rpc, "project-1"))
      .rejects.toThrow("Existing clips were preserved");
  });

  it("rejects a malformed rebuild response instead of reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { clips_created: "4" }, error: null });
    await expect(rebuildProjectTimeline(rpc, "project-1"))
      .rejects.toThrow("Existing clips were preserved");
  });

  it("regenerates captions atomically and reports the returned cue count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { cues_created: 7 }, error: null });
    await expect(regenerateProjectCaptions(rpc, "project-1")).resolves.toEqual({ cueCount: 7 });
    expect(rpc).toHaveBeenCalledWith({ _project_id: "project-1" });
  });

  it("does not report caption success when replacement fails or throws", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("network dropped"));
    await expect(regenerateProjectCaptions(rejected, "project-1"))
      .rejects.toThrow("Existing captions were preserved");

    const errored = vi.fn().mockResolvedValue({ data: null, error: { message: "delete failed" } });
    await expect(regenerateProjectCaptions(errored, "project-1"))
      .rejects.toThrow("Existing captions were preserved");
  });
});
