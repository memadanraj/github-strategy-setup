import { describe, expect, it, vi } from "vitest";
import { resetSharePasswordLockout } from "@/lib/share-password-lockout";

describe("share password lockout reset", () => {
  it("confirms reset only when the expected row is returned", async () => {
    const reset = vi.fn(async (id: string) => ({ data: { id }, error: null }));
    await expect(resetSharePasswordLockout("share-1", reset)).resolves.toBe(true);
    expect(reset).toHaveBeenCalledWith("share-1");
  });

  it("fails closed on database errors or a missing row", async () => {
    await expect(resetSharePasswordLockout("share-1", async () => ({
      data: null, error: new Error("database unavailable"),
    }))).resolves.toBe(false);
    await expect(resetSharePasswordLockout("share-1", async () => ({
      data: null, error: null,
    }))).resolves.toBe(false);
  });

  it("fails closed when the reset throws or returns a different row", async () => {
    await expect(resetSharePasswordLockout("share-1", async () => {
      throw new Error("network failed");
    })).resolves.toBe(false);
    await expect(resetSharePasswordLockout("share-1", async () => ({
      data: { id: "other-share" }, error: null,
    }))).resolves.toBe(false);
  });

  it("rejects an empty share identifier without touching the database", async () => {
    const reset = vi.fn();
    await expect(resetSharePasswordLockout("", reset)).resolves.toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });
});
