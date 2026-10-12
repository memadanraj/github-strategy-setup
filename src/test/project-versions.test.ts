import { describe, expect, it, vi } from "vitest";
import { createProjectVersion, restoreProjectVersion } from "@/lib/project-versions";

describe("project version RPC client", () => {
  it("trims labels, requests a transactional snapshot, and validates the response", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "version-1", version_number: 4, created_at: "2026-10-11T00:00:00Z" },
      error: null,
    });
    const result = await createProjectVersion(rpc, "project-1", "  Before rewrite  ");
    expect(rpc).toHaveBeenCalledWith({
      _project_id: "project-1",
      _label: "Before rewrite",
    });
    expect(result).toEqual({ id: "version-1", versionNumber: 4 });
  });

  it("sends null for an empty label", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "version-2", version_number: 1 },
      error: null,
    });
    await createProjectVersion(rpc, "project-1", "   ");
    expect(rpc).toHaveBeenCalledWith({ _project_id: "project-1", _label: null });
  });

  it("does not accept malformed success responses", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "version-x", version_number: "4" }, error: null });
    await expect(createProjectVersion(rpc, "project-1", "label"))
      .rejects.toThrow("invalid project version");
  });

  it("passes through safe database errors for version creation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Project not found or not owned by current user" } });
    await expect(createProjectVersion(rpc, "project-1", "label"))
      .rejects.toThrow("Project not found or not owned by current user");
  });

  it("restores only the supplied project/version pair", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(restoreProjectVersion(rpc, "project-1", "version-8")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith({ _project_id: "project-1", _version_id: "version-8" });
  });

  it("surfaces restore errors without claiming that restoration succeeded", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Project version not found" } });
    await expect(restoreProjectVersion(rpc, "project-1", "version-8"))
      .rejects.toThrow("Project version not found");
  });
});
