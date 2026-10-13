import { describe, expect, it, vi } from "vitest";
import { claimRenderJobFinalization, recoverTerminalRenderWithReadyExport } from "@/lib/render-finalization";

describe("render finalization claim contract", () => {
  it("claims one render job by ID", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "claimed", error: null });
    await expect(claimRenderJobFinalization(rpc, "render-1")).resolves.toBe("claimed");
    expect(rpc).toHaveBeenCalledWith({ _job_id: "render-1" });
  });

  it.each(["busy", "already_complete", "not_found", "not_active"] as const)(
    "returns known non-claim state %s without interpreting it as a claim",
    async (state) => {
      const rpc = vi.fn().mockResolvedValue({ data: state, error: null });
      await expect(claimRenderJobFinalization(rpc, "render-2")).resolves.toBe(state);
    },
  );

  it("surfaces database failures", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(claimRenderJobFinalization(rpc, "render-3"))
      .rejects.toThrow("Could not claim render finalization.");
  });

  it("rejects unexpected RPC return values", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "anything", error: null });
    await expect(claimRenderJobFinalization(rpc, "render-4"))
      .rejects.toThrow("unknown state");
  });
});


describe("terminal render recovery from a persisted ready export", () => {
  const failedJob = { id: "render-1", status: "failed", error: "write response lost" };
  const readyExport = { id: "export-1", status: "ready" };

  it("does not query export recovery for non-terminal jobs", async () => {
    const findReadyExport = vi.fn();
    const markCompleted = vi.fn();
    const reloadJob = vi.fn();
    await expect(recoverTerminalRenderWithReadyExport("processing", {
      findReadyExport, markCompleted, reloadJob,
    })).resolves.toEqual({ kind: "not-needed" });
    expect(findReadyExport).not.toHaveBeenCalled();
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it.each(["failed", "cancelled"] as const)(
    "leaves a %s job unchanged when no ready export exists",
    async (status) => {
      const markCompleted = vi.fn();
      const result = await recoverTerminalRenderWithReadyExport(status, {
        findReadyExport: async () => ({ data: null, error: null }),
        markCompleted,
        reloadJob: vi.fn(),
      });
      expect(result).toEqual({ kind: "not-needed" });
      expect(markCompleted).not.toHaveBeenCalled();
    },
  );

  it("does not recover from an export row that is not ready", async () => {
    const markCompleted = vi.fn();
    const result = await recoverTerminalRenderWithReadyExport("failed", {
      findReadyExport: async () => ({ data: { ...readyExport, status: "processing" }, error: null }),
      markCompleted,
      reloadJob: vi.fn(),
    });
    expect(result).toEqual({ kind: "not-needed" });
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it("marks a failed render complete when a ready export was already persisted", async () => {
    const completedJob = { ...failedJob, status: "completed", error: null };
    const markCompleted = vi.fn(async () => ({ data: completedJob, error: null }));
    const reloadJob = vi.fn();
    const result = await recoverTerminalRenderWithReadyExport("failed", {
      findReadyExport: async () => ({ data: readyExport, error: null }),
      markCompleted,
      reloadJob,
    });
    expect(result).toEqual({ kind: "recovered", job: completedJob });
    expect(markCompleted).toHaveBeenCalledTimes(1);
    expect(reloadJob).not.toHaveBeenCalled();
  });

  it("reconciles a lost completion-update response by reading the persisted job", async () => {
    const completedJob = { ...failedJob, status: "completed", error: null };
    const result = await recoverTerminalRenderWithReadyExport("cancelled", {
      findReadyExport: async () => ({ data: readyExport, error: null }),
      markCompleted: async () => { throw new Error("connection reset after commit"); },
      reloadJob: async () => ({ data: completedJob, error: null }),
    });
    expect(result).toEqual({ kind: "recovered", job: completedJob });
  });

  it("surfaces failure when export lookup is unavailable", async () => {
    const markCompleted = vi.fn();
    const result = await recoverTerminalRenderWithReadyExport("failed", {
      findReadyExport: async () => ({ data: null, error: { message: "database unavailable" } }),
      markCompleted,
      reloadJob: vi.fn(),
    });
    expect(result).toEqual({
      kind: "error",
      message: "Couldn't verify whether a saved export exists for this render.",
    });
    expect(markCompleted).not.toHaveBeenCalled();
  });

  it("does not claim recovery when the ready export exists but status remains terminal", async () => {
    const result = await recoverTerminalRenderWithReadyExport("failed", {
      findReadyExport: async () => ({ data: readyExport, error: null }),
      markCompleted: async () => ({ data: null, error: { message: "write failed" } }),
      reloadJob: async () => ({ data: failedJob, error: null }),
    });
    expect(result).toEqual({
      kind: "error",
      message: "A ready export exists, but render status reconciliation is still required.",
    });
  });
});
