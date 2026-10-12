import { describe, expect, it } from "vitest";
import { normalizeSceneBreakdown } from "@/lib/scene-breakdown";

describe("normalizeSceneBreakdown", () => {
  it("normalizes titles and bounds scene durations", () => {
    expect(normalizeSceneBreakdown([
      { title: "  Opening  ", narration: "  Start here. ", visual_prompt: "  A sunrise. ", duration_seconds: 0 },
      { title: "", narration: "Middle", visual_prompt: "A road", duration_seconds: 999 },
    ])).toEqual([
      { title: "Opening", narration: "Start here.", visual_prompt: "A sunrise.", duration_seconds: 1 },
      { title: "Scene 2", narration: "Middle", visual_prompt: "A road", duration_seconds: 120 },
    ]);
  });

  it("rejects empty model output so existing scenes are not deleted", () => {
    expect(() => normalizeSceneBreakdown([])).toThrow("Existing scenes were preserved");
    expect(() => normalizeSceneBreakdown(null)).toThrow("Existing scenes were preserved");
  });

  it("rejects incomplete or malformed scenes", () => {
    expect(() => normalizeSceneBreakdown([null])).toThrow("invalid scene");
    expect(() => normalizeSceneBreakdown([
      { title: "Missing narration", narration: "", visual_prompt: "A scene", duration_seconds: 5 },
    ])).toThrow("incomplete scene");
    expect(() => normalizeSceneBreakdown([
      { title: "Bad duration", narration: "Hello", visual_prompt: "A scene", duration_seconds: "fast" },
    ])).toThrow("incomplete scene");
  });

  it("limits oversized model responses to 60 scenes", () => {
    const scenes = Array.from({ length: 75 }, (_, index) => ({
      title: `Scene ${index + 1}`,
      narration: "Narration",
      visual_prompt: "A clear shot",
      duration_seconds: 5,
    }));
    expect(normalizeSceneBreakdown(scenes)).toHaveLength(60);
  });
});
