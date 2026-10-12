import { describe, expect, it, vi } from "vitest";
import { claimRenderJobFinalization } from "@/lib/render-finalization";

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
