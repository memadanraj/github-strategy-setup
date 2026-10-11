import { describe, expect, it, vi } from "vitest";
import { canMoveScene, moveProjectScene } from "@/lib/project-scenes";

describe("scene reorder contract", () => {
  it("allows a move only when the target index is within bounds", () => {
    expect(canMoveScene(0, -1, 4)).toBe(false);
    expect(canMoveScene(0, 1, 4)).toBe(true);
    expect(canMoveScene(3, 1, 4)).toBe(false);
    expect(canMoveScene(3, -1, 4)).toBe(true);
    expect(canMoveScene(-1, 1, 4)).toBe(false);
    expect(canMoveScene(0.5, 1, 4)).toBe(false);
    expect(canMoveScene(0, 1, -1)).toBe(false);
  });

  it("uses one atomic RPC with project, scene, and direction", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(moveProjectScene(rpc, "project-1", "scene-2", -1)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith({ _project_id: "project-1", _scene_id: "scene-2", _direction: -1 });
  });

  it("surfaces database failures instead of silently refreshing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(moveProjectScene(rpc, "project-1", "scene-2", 1)).rejects.toThrow("permission denied");
  });

  it("does not treat a missing scene or out-of-range move as success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(moveProjectScene(rpc, "project-1", "scene-2", 1))
      .rejects.toThrow("Scene not found or cannot move further");
  });
});
