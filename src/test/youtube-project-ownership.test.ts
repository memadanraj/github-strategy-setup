import { describe, expect, it, vi } from "vitest";
import { confirmProjectOwnership } from "@/lib/youtube-project-ownership";

describe("YouTube project ownership guard", () => {
  it("allows a project only when the authenticated lookup returns the requested row", async () => {
    const lookup = vi.fn(async (projectId: string, _userId: string) => ({
      data: { id: projectId },
      error: null,
    }));
    await expect(confirmProjectOwnership({
      projectId: "project-a",
      userId: "user-a",
      lookup,
    })).resolves.toBe(true);
    expect(lookup).toHaveBeenCalledWith("project-a", "user-a");
  });

  it("denies a project that is absent under the current user's RLS/session", async () => {
    const lookup = vi.fn(async () => ({ data: null, error: null }));
    await expect(confirmProjectOwnership({
      projectId: "project-b",
      userId: "user-a",
      lookup,
    })).resolves.toBe(false);
  });

  it("fails closed when the authenticated project lookup errors or throws", async () => {
    await expect(confirmProjectOwnership({
      projectId: "project-a",
      userId: "user-a",
      lookup: async () => ({ data: { id: "project-a" }, error: { message: "database unavailable" } }),
    })).resolves.toBe(false);
    await expect(confirmProjectOwnership({
      projectId: "project-a",
      userId: "user-a",
      lookup: async () => { throw new Error("request failed"); },
    })).resolves.toBe(false);
  });

  it("rejects a mismatched returned project ID and missing identity", async () => {
    const lookup = vi.fn(async () => ({ data: { id: "project-b" }, error: null }));
    await expect(confirmProjectOwnership({
      projectId: "project-a",
      userId: "user-a",
      lookup,
    })).resolves.toBe(false);
    await expect(confirmProjectOwnership({
      projectId: "project-a",
      userId: "",
      lookup,
    })).resolves.toBe(false);
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
