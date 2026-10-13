import { describe, expect, it, vi } from "vitest";
import { completeGenerationJobAndConfirm } from "@/lib/generation-job-completion";

describe("checked generation-job completion", () => {
  it("returns success only when the persisted job row is complete", async () => {
    const complete = vi.fn(async () => ({ error: null }));
    const readStatus = vi.fn(async () => ({ data: { status: "complete" }, error: null }));
    await expect(completeGenerationJobAndConfirm({
      jobId: "job-1",
      output: { path: "generated.mp4" },
      complete,
      readStatus,
      jobLabel: "visual",
      completionErrorMessage: "Could not finalize the visual job.",
    })).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledWith("job-1", { path: "generated.mp4" });
    expect(readStatus).toHaveBeenCalledWith("job-1");
  });

  it("rejects a successful RPC response when a prior failure made it a no-op", async () => {
    const complete = vi.fn(async () => ({ error: null }));
    const readStatus = vi.fn(async () => ({ data: { status: "failed" }, error: null }));
    await expect(completeGenerationJobAndConfirm({
      jobId: "job-1",
      output: {},
      complete,
      readStatus,
      jobLabel: "visual",
      completionErrorMessage: "Could not finalize the visual job.",
    })).rejects.toThrow("Visual generation job was already marked failed");
  });

  it("rejects missing or nonterminal status and surfaces read errors", async () => {
    const complete = vi.fn(async () => ({ error: null }));
    const options = {
      jobId: "job-1",
      output: {},
      complete,
      jobLabel: "visual" as const,
      completionErrorMessage: "Could not finalize the visual job.",
    };
    await expect(completeGenerationJobAndConfirm({
      ...options,
      readStatus: async () => ({ data: null, error: { message: "database unavailable" } }),
    })).rejects.toThrow("Could not confirm visual generation job completion.");
    await expect(completeGenerationJobAndConfirm({
      ...options,
      readStatus: async () => ({ data: { status: "running" }, error: null }),
    })).rejects.toThrow("Visual generation job is not confirmed complete.");
  });

  it("does not read state after a completion RPC error or thrown request", async () => {
    const readStatus = vi.fn(async () => ({ data: { status: "complete" }, error: null }));
    await expect(completeGenerationJobAndConfirm({
      jobId: "job-1",
      output: {},
      complete: async () => ({ error: { message: "database unavailable" } }),
      readStatus,
      jobLabel: "visual",
      completionErrorMessage: "Could not finalize the visual job.",
    })).rejects.toThrow("Could not finalize the visual job.");
    await expect(completeGenerationJobAndConfirm({
      jobId: "job-1",
      output: {},
      complete: async () => { throw new Error("network failure"); },
      readStatus,
      jobLabel: "visual",
      completionErrorMessage: "Could not finalize the visual job.",
    })).rejects.toThrow("Could not finalize the visual job.");
    expect(readStatus).not.toHaveBeenCalled();
  });
});
