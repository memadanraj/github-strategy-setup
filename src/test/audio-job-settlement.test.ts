import { describe, expect, it, vi } from "vitest";
import {
  completeAudioJob,
  failAudioJob,
  restoreSceneAudioVoiceover,
} from "@/lib/audio-job-settlement";

describe("audio generation job settlement", () => {
  it("checks both the completion RPC and persisted terminal state", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const readStatus = vi.fn(async () => ({ data: { status: "complete" }, error: null }));
    await expect(completeAudioJob(rpc, "job-1", { path: "audio.mp3" }, readStatus)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("complete_generation_job", {
      _job_id: "job-1",
      _output: { path: "audio.mp3" },
    });
    expect(readStatus).toHaveBeenCalledWith("job-1");
  });

  it("does not report success when the completion RPC is a no-op for an already failed job", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const readStatus = vi.fn(async () => ({ data: { status: "failed" }, error: null }));
    await expect(completeAudioJob(rpc, "job-1", {}, readStatus))
      .rejects.toThrow("Audio generation job was already marked failed");
  });

  it("requires a readable persisted completion state", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const readStatus = vi.fn(async () => ({ data: null, error: { message: "database unavailable" } }));
    await expect(completeAudioJob(rpc, "job-1", {}, readStatus))
      .rejects.toThrow("Could not confirm audio generation job completion.");
  });

  it("does not ignore a completion RPC error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const readStatus = vi.fn(async () => ({ data: { status: "complete" }, error: null }));
    await expect(completeAudioJob(rpc, "job-1", {}, readStatus))
      .rejects.toThrow("Could not finalize the audio generation job.");
    expect(readStatus).not.toHaveBeenCalled();
  });

  it("only says credits were refunded when checked settlement confirms it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "failed_refunded", error: null });
    const outcome = await failAudioJob(rpc, "job-1", "provider failed");
    expect(outcome.error).toContain("Your credits were refunded.");
    expect(rpc).toHaveBeenCalledWith("fail_generation_job_checked", {
      _job_id: "job-1",
      _error: "provider failed",
    });
  });

  it("never claims a refund when the settlement request fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const cleanupAsset = vi.fn(async () => undefined);
    const outcome = await failAudioJob(rpc, "job-1", "attach failed", { cleanupAsset });
    expect(outcome.state).toBeNull();
    expect(outcome.error).toContain("credit state needs reconciliation");
    expect(outcome.error).not.toContain("Your credits were refunded.");
    expect(cleanupAsset).not.toHaveBeenCalled();
  });


  it("restores only the voiceover reference without overwriting other scene audio settings", async () => {
    const updateVoiceoverId = vi.fn(async (_voiceoverId: string | null) => ({ error: null }));
    const result = await restoreSceneAudioVoiceover({
      currentVoiceoverId: "new-voiceover",
      createdVoiceoverId: "new-voiceover",
      previousVoiceoverId: "previous-voiceover",
      updateVoiceoverId,
    });
    expect(result).toBe("restored");
    expect(updateVoiceoverId).toHaveBeenCalledWith("previous-voiceover");
  });

  it("preserves concurrent edits when the scene now points at another voiceover", async () => {
    const updateVoiceoverId = vi.fn(async (_voiceoverId: string | null) => ({ error: null }));
    const result = await restoreSceneAudioVoiceover({
      currentVoiceoverId: "concurrent-voiceover",
      createdVoiceoverId: "new-voiceover",
      previousVoiceoverId: null,
      updateVoiceoverId,
    });
    expect(result).toBe("changed-elsewhere");
    expect(updateVoiceoverId).not.toHaveBeenCalled();
  });

  it("surfaces a failed scene voiceover rollback", async () => {
    const updateVoiceoverId = vi.fn(async (_voiceoverId: string | null) => ({ error: { message: "database unavailable" } }));
    await expect(restoreSceneAudioVoiceover({
      currentVoiceoverId: "new-voiceover",
      createdVoiceoverId: "new-voiceover",
      previousVoiceoverId: null,
      updateVoiceoverId,
    })).rejects.toThrow("Could not restore the previous scene voiceover.");
  });

  it("preserves output after a lost completion response if the job is already complete", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "already_complete", error: null });
    const cleanupUpload = vi.fn(async () => undefined);
    const outcome = await failAudioJob(rpc, "job-1", "completion response lost", {
      completionMayHaveSucceeded: true,
      cleanupUpload,
    });
    expect(outcome).toMatchObject({ state: "already_complete", completed: true, error: "" });
    expect(cleanupUpload).not.toHaveBeenCalled();
  });
});
