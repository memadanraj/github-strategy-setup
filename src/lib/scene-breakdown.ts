export type NormalizedScene = {
  title: string;
  narration: string;
  visual_prompt: string;
  duration_seconds: number;
};

/**
 * Validate and normalize model output before asking the database to atomically
 * replace a project's scenes. Invalid/empty output must never erase existing work.
 */
export function normalizeSceneBreakdown(value: unknown): NormalizedScene[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("AI returned no scenes. Existing scenes were preserved.");
  }

  return value.slice(0, 60).map((item: unknown, index: number) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`AI returned an invalid scene at position ${index + 1}. Existing scenes were preserved.`);
    }

    const scene = item as Record<string, unknown>;
    const narration = typeof scene["narration"] === "string" ? scene["narration"].trim() : "";
    const visualPrompt = typeof scene["visual_prompt"] === "string" ? scene["visual_prompt"].trim() : "";
    const rawDuration = typeof scene["duration_seconds"] === "number" || typeof scene["duration_seconds"] === "string"
      ? Number(scene["duration_seconds"])
      : Number.NaN;

    if (!narration || !visualPrompt || !Number.isFinite(rawDuration)) {
      throw new Error(`AI returned incomplete scene ${index + 1}. Existing scenes were preserved.`);
    }

    const title = typeof scene["title"] === "string" ? scene["title"].trim().slice(0, 120) : "";
    return {
      title: title || `Scene ${index + 1}`,
      narration,
      visual_prompt: visualPrompt,
      duration_seconds: Math.max(1, Math.min(120, Math.round(rawDuration))),
    };
  });
}
