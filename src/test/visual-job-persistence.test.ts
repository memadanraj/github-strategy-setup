import { describe, expect, it, vi } from "vitest";
import {
  persistGeneratedVisual,
  settleVisualJobFailure,
  type VisualJobFailureState,
} from "@/lib/visual-job-persistence";

type Output = { path: string; bytes: Uint8Array; kind: string };

function makeOperations(overrides: Partial<{
  prepare: () => Promise<Output>;
  upload: (output: Output) => Promise<void>;
  registerAsset: (output: Output) => Promise<string>;
  attachScene: (output: Output, assetId: string) => Promise<void>;
  completeJob: (output: Output, assetId: string) => Promise<void>;
  cleanupAsset: (output: Output) => Promise<void>;
  cleanupUpload: (output: Output) => Promise<void>;
  failJob: (message: string) => Promise<VisualJobFailureState>;
}> = {}) {
  const output: Output = { path: "user/project/generated.png", bytes: new Uint8Array([1, 2, 3]), kind: "image" };
  const operations = {
    prepare: vi.fn(async () => output),
    upload: vi.fn(async (_output: Output) => undefined),
    registerAsset: vi.fn(async (_output: Output) => "asset-1"),
    attachScene: vi.fn(async (_output: Output, _assetId: string) => undefined),
    completeJob: vi.fn(async (_output: Output, _assetId: string) => undefined),
    cleanupAsset: vi.fn(async (_output: Output) => undefined),
    cleanupUpload: vi.fn(async (_output: Output) => undefined),
    failJob: vi.fn(async (_message: string): Promise<VisualJobFailureState> => "failed_refunded"),
    ...overrides,
  };
  return { operations, output };
}

describe("checked visual-job settlement", () => {
  it("preserves media when the database confirms completion after a lost response", async () => {
    const failJob = vi.fn(async (): Promise<VisualJobFailureState> => "already_complete");
    const cleanupAsset = vi.fn(async () => undefined);
    const cleanupUpload = vi.fn(async () => undefined);
    const outcome = await settleVisualJobFailure(failJob, "completion response failed", {
      completionMayHaveSucceeded: true,
      cleanupAsset,
      cleanupUpload,
    });
    expect(outcome).toMatchObject({ state: "already_complete", completed: true, error: "" });
    expect(cleanupAsset).not.toHaveBeenCalled();
    expect(cleanupUpload).not.toHaveBeenCalled();
  });

  it("does not claim a refund or clean media when settlement cannot be confirmed", async () => {
    const failJob = vi.fn(async (): Promise<VisualJobFailureState> => { throw new Error("database unavailable"); });
    const cleanupAsset = vi.fn(async () => undefined);
    const cleanupUpload = vi.fn(async () => undefined);
    const outcome = await settleVisualJobFailure(failJob, "scene update failed", { cleanupAsset, cleanupUpload });
    expect(outcome.state).toBeNull();
    expect(outcome.error).toContain("credit state needs reconciliation");
    expect(outcome.error).not.toContain("Your credits were refunded.");
    expect(cleanupAsset).not.toHaveBeenCalled();
    expect(cleanupUpload).not.toHaveBeenCalled();
  });

  it("claims a refund only after the database confirms failure", async () => {
    const failJob = vi.fn(async (): Promise<VisualJobFailureState> => "failed_refunded");
    const cleanupAsset = vi.fn(async () => undefined);
    const cleanupUpload = vi.fn(async () => undefined);
    const outcome = await settleVisualJobFailure(failJob, "provider failed", { cleanupAsset, cleanupUpload });
    expect(outcome.error).toContain("Your credits were refunded.");
    expect(cleanupAsset).toHaveBeenCalledTimes(1);
    expect(cleanupUpload).toHaveBeenCalledTimes(1);
  });
});
describe("generated visual persistence", () => {
  it("uploads, registers, attaches and settles a job in order", async () => {
    const calls: string[] = [];
    const setup = makeOperations({
      upload: vi.fn(async () => { calls.push("upload"); }),
      registerAsset: vi.fn(async () => { calls.push("register"); return "asset-1"; }),
      attachScene: vi.fn(async () => { calls.push("attach"); }),
      completeJob: vi.fn(async () => { calls.push("complete"); }),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result).toMatchObject({ ok: true, assetId: "asset-1", output: { path: setup.output.path } });
    expect(calls).toEqual(["upload", "register", "attach", "complete"]);
    expect(setup.operations.failJob).not.toHaveBeenCalled();
  });

  it("confirms a refund before saying credits were refunded when upload fails", async () => {
    const setup = makeOperations({
      upload: vi.fn(async () => { throw new Error("storage unavailable"); }),
      failJob: vi.fn(async (): Promise<VisualJobFailureState> => "failed_refunded"),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Your credits were refunded.");
    expect(setup.operations.cleanupUpload).toHaveBeenCalledWith(setup.output);
    expect(setup.operations.cleanupAsset).not.toHaveBeenCalled();
  });

  it("cleans up an uploaded file and possible asset row after registration failure", async () => {
    const setup = makeOperations({
      registerAsset: vi.fn(async () => { throw new Error("asset insert failed"); }),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result.ok).toBe(false);
    expect(setup.operations.cleanupAsset).toHaveBeenCalledWith(setup.output);
    expect(setup.operations.cleanupUpload).toHaveBeenCalledWith(setup.output);
  });

  it("checks scene attachment failures and compensates when failure is confirmed", async () => {
    const setup = makeOperations({
      attachScene: vi.fn(async () => { throw new Error("scene update failed"); }),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Your credits were refunded.");
    expect(setup.operations.cleanupAsset).toHaveBeenCalledTimes(1);
    expect(setup.operations.cleanupUpload).toHaveBeenCalledTimes(1);
  });

  it("preserves persisted media if completion committed but its response failed", async () => {
    const setup = makeOperations({
      completeJob: vi.fn(async () => { throw new Error("response was lost"); }),
      failJob: vi.fn(async (): Promise<VisualJobFailureState> => "already_complete"),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result).toMatchObject({ ok: true, assetId: "asset-1" });
    expect(setup.operations.cleanupAsset).not.toHaveBeenCalled();
    expect(setup.operations.cleanupUpload).not.toHaveBeenCalled();
  });

  it("does not claim a refund or delete media when settlement cannot be confirmed", async () => {
    const setup = makeOperations({
      attachScene: vi.fn(async () => { throw new Error("scene update failed"); }),
      failJob: vi.fn(async () => { throw new Error("settlement database unavailable"); }),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("credit state needs reconciliation");
      expect(result.error).not.toContain("Your credits were refunded.");
    }
    expect(setup.operations.cleanupAsset).not.toHaveBeenCalled();
    expect(setup.operations.cleanupUpload).not.toHaveBeenCalled();
  });

  it("reports cleanup failure even when refund succeeded", async () => {
    const setup = makeOperations({
      attachScene: vi.fn(async () => { throw new Error("scene update failed"); }),
      cleanupUpload: vi.fn(async () => { throw new Error("storage remove failed"); }),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Your credits were refunded.");
      expect(result.error).toContain("manual cleanup is required");
    }
  });

  it("does not claim a refund when no reservation existed", async () => {
    const setup = makeOperations({
      prepare: vi.fn(async () => { throw new Error("provider timeout"); }),
      failJob: vi.fn(async (): Promise<VisualJobFailureState> => "failed_without_reservation"),
    });
    const result = await persistGeneratedVisual(setup.operations);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no reserved credits");
      expect(result.error).not.toContain("Your credits were refunded.");
    }
  });
});
