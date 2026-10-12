export type ProjectProductionPlan = {
  schemaVersion: 1;
  brief: {
    videoType: string;
    targetAudience: string;
    tone: string;
    language: string;
    targetDurationSeconds: number;
    aspectRatio: "16:9" | "9:16";
    visualStyle: string;
    platform: string;
    captionsEnabled: boolean;
  };
  plan: { recommendedSceneCount: number; stages: string[] };
};

export type ProductionPlanInput = {
  format: string;
  videoType: string;
  targetAudience: string;
  tone: string;
  language: string;
  durationSeconds: number;
  visualStyle: string;
  platform: string;
  captionsEnabled: boolean;
};

const choices = {
  videoType: ["explainer", "documentary", "storytelling", "tutorial", "product-review"],
  tone: ["engaging", "cinematic", "educational", "humorous", "calm", "dramatic"],
  language: ["en", "ne", "hi", "es", "fr", "de", "pt", "ja"],
  visualStyle: ["cinematic", "realistic", "illustrated", "anime", "minimal", "documentary"],
  platform: ["youtube", "tiktok", "instagram", "facebook", "other"],
} as const;

function choice(value: string, allowed: readonly string[], fallback: string): string {
  return allowed.includes(value) ? value : fallback;
}

export function buildProductionPlan(input: ProductionPlanInput): ProjectProductionPlan {
  const format = input.format === "short" ? "short" : "long";
  const minSeconds = format === "short" ? 15 : 300;
  const maxSeconds = format === "short" ? 60 : 1200;
  const fallbackSeconds = format === "short" ? 45 : 480;
  const rawDuration = Number(input.durationSeconds);
  const targetDurationSeconds = Math.min(maxSeconds, Math.max(
    minSeconds, Math.round(Number.isFinite(rawDuration) ? rawDuration : fallbackSeconds),
  ));
  const targetAudience = input.targetAudience.trim().slice(0, 160) || "General audience";
  const recommendedSceneCount = Math.min(60, Math.max(
    3, Math.ceil(targetDurationSeconds / (format === "short" ? 4 : 12)),
  ));

  return {
    schemaVersion: 1,
    brief: {
      videoType: choice(input.videoType, choices.videoType, "explainer"),
      targetAudience,
      tone: choice(input.tone, choices.tone, "engaging"),
      language: choice(input.language, choices.language, "en"),
      targetDurationSeconds,
      aspectRatio: format === "short" ? "9:16" : "16:9",
      visualStyle: choice(input.visualStyle, choices.visualStyle, "cinematic"),
      platform: choice(input.platform, choices.platform, "youtube"),
      captionsEnabled: input.captionsEnabled !== false,
    },
    plan: {
      recommendedSceneCount,
      stages: [
        "Confirm brief and audience", "Research topic and choose an angle",
        "Generate hooks and titles", "Write and review the script",
        "Break the script into scenes", "Generate visuals and voiceover",
        "Create captions and assemble the timeline", "Render, inspect, and export the final video",
      ],
    },
  };
}

export function getTargetDurationSeconds(settings: unknown, format: "long" | "short"): number {
  const fallback = format === "short" ? 45 : 480;
  if (!settings || typeof settings !== "object") return fallback;
  const brief = (settings as Record<string, unknown>)["brief"];
  if (!brief || typeof brief !== "object") return fallback;
  const value = Number((brief as Record<string, unknown>)["targetDurationSeconds"]);
  const min = format === "short" ? 15 : 300;
  const max = format === "short" ? 60 : 1200;
  return Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : fallback)));
}

export function productionPlanContext(settings: unknown): string {
  if (!settings || typeof settings !== "object") return "";
  const brief = (settings as Record<string, unknown>)["brief"];
  if (!brief || typeof brief !== "object") return "";
  const b = brief as Record<string, unknown>;
  const value = (key: string, fallback: string) => {
    const item = b[key];
    return typeof item === "string" && item.trim() ? item.trim() : fallback;
  };
  const duration = Number(b["targetDurationSeconds"]);
  const durationText = Number.isFinite(duration) && duration > 0
    ? `${Math.round(duration / 60 * 10) / 10} minutes (${Math.round(duration)} seconds)`
    : "use the selected project format";
  return `\nProduction brief:\n- Video type: ${value("videoType", "explainer")}\n- Audience: ${value("targetAudience", "General audience")}\n- Tone: ${value("tone", "engaging")}\n- Language: ${value("language", "en")}\n- Target duration: ${durationText}\n- Aspect ratio: ${value("aspectRatio", "16:9")}\n- Visual style: ${value("visualStyle", "cinematic")}\n- Platform: ${value("platform", "youtube")}\n- Captions enabled: ${b["captionsEnabled"] === false ? "no" : "yes"}`;
}
