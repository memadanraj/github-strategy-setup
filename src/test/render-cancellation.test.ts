import { describe, expect, it, vi } from "vitest";
import { cancelRenderJobWithProvider } from "@/lib/render-cancellation";

const job = {
  status: "processing",
  provider_job_id: "provider-1",
  finalization_started_at: null,
};

describe("render cancellation contract", () => {
  it("requires provider support before changing local render state", async () => {
    const persist = vi.fn().mockResolvedValue({ data: { id: "render-1" }, error: null });
    const result = await cancelRenderJobWithProvider(job, {}, persist);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("does not support remote cancellation") });
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not mark a render cancelled when the provider rejects cancellation", async () => {
    const persist = vi.fn().mockResolvedValue({ data: { id: "render-1" }, error: null });
    const cancel = vi.fn().mockRejectedValue(new Error("provider unavailable"));
    const result = await cancelRenderJobWithProvider(job, { cancel }, persist);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("could not confirm cancellation") });
    expect(cancel).toHaveBeenCalledWith("provider-1");
    expect(persist).not.toHaveBeenCalled();
  });

  it("persists local cancellation only after provider acceptance", async () => {
    const order: string[] = [];
    const result = await cancelRenderJobWithProvider(
      job,
      { cancel: vi.fn(async () => { order.push("provider"); }) },
      async () => { order.push("database"); return { data: { id: "render-1" }, error: null }; },
    );
    expect(result).toEqual({ ok: true });
    expect(order).toEqual(["provider", "database"]);
  });

  it("returns reconciliation warning when provider cancels but local write fails", async () => {
    const result = await cancelRenderJobWithProvider(
      job,
      { cancel: vi.fn(async () => undefined) },
      async () => ({ data: null, error: { message: "database unavailable" } }),
    );
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Reconciliation is required") });
  });

  it("does not call provider for jobs that have started finalization", async () => {
    const cancel = vi.fn();
    const persist = vi.fn();
    const result = await cancelRenderJobWithProvider(
      { ...job, finalization_started_at: "2026-10-12T00:00:00Z" },
      { cancel },
      persist,
    );
    expect(result.ok).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("allows local cancellation before the provider job ID is saved", async () => {
    const persist = vi.fn().mockResolvedValue({ data: { id: "render-2" }, error: null });
    const result = await cancelRenderJobWithProvider(
      { status: "queued", provider_job_id: null, finalization_started_at: null },
      null,
      persist,
    );
    expect(result).toEqual({ ok: true });
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
