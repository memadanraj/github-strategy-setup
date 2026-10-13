type UnknownRecord = Record<string, unknown>;

export const MAX_TIMELINE_SECONDS = 24 * 60 * 60;

export type TimelineClipTiming = {
  start_seconds: number;
  duration_seconds: number;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(patch: UnknownRecord, allowed: readonly string[]): boolean {
  return Object.keys(patch).some((key) => !allowed.includes(key));
}

function numericField(patch: UnknownRecord, key: string): number | null {
  const value = patch[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateTimelineClipPatch(
  patch: unknown,
  current?: TimelineClipTiming,
): string | null {
  if (!isRecord(patch) || Object.keys(patch).length === 0) return "No clip changes were provided.";
  const allowed = [
    "start_seconds", "duration_seconds", "source_start_seconds",
    "playback_rate", "volume", "opacity", "transition_in", "transition_out",
  ];
  if (unknownKeys(patch, allowed)) return "This clip change is not supported.";

  for (const key of ["start_seconds", "duration_seconds", "source_start_seconds", "playback_rate", "volume", "opacity"]) {
    if (!(key in patch)) continue;
    const value = numericField(patch, key);
    if (value === null) return "Clip timing and levels must be finite numbers.";
    if (key === "start_seconds" && value < 0) return "Clip start cannot be negative.";
    if (key === "start_seconds" && value > MAX_TIMELINE_SECONDS) return "Clip start cannot exceed 24 hours.";
    if (key === "duration_seconds" && value <= 0) return "Clip duration must be greater than zero.";
    if (key === "duration_seconds" && value > MAX_TIMELINE_SECONDS) return "Clip duration cannot exceed 24 hours.";
    if (key === "source_start_seconds" && value < 0) return "Source start cannot be negative.";
    if (key === "source_start_seconds" && value > MAX_TIMELINE_SECONDS) return "Source start cannot exceed 24 hours.";
    if (key === "playback_rate" && (value <= 0 || value > 4)) return "Playback rate must be greater than zero and at most 4.";
    if (key === "volume" && (value < 0 || value > 2)) return "Clip volume must be between 0 and 2.";
    if (key === "opacity" && (value < 0 || value > 1)) return "Clip opacity must be between 0 and 1.";
  }

  const start = "start_seconds" in patch ? numericField(patch, "start_seconds") : current?.start_seconds;
  const duration = "duration_seconds" in patch ? numericField(patch, "duration_seconds") : current?.duration_seconds;
  if (start !== undefined && start !== null && duration !== undefined && duration !== null) {
    if (!Number.isFinite(start) || !Number.isFinite(duration)) return "Clip timing and levels must be finite numbers.";
    if (start + duration > MAX_TIMELINE_SECONDS) return "Clip end cannot exceed 24 hours.";
  }

  for (const key of ["transition_in", "transition_out"]) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value !== null && (typeof value !== "string" || value.length > 80)) {
      return "Clip transition values are invalid.";
    }
  }
  return null;
}

export type TimelineCaptionTiming = {
  start_seconds: number;
  end_seconds: number;
  text?: string;
  position?: string;
};

export function validateTimelineCaptionPatch(
  patch: unknown,
  current: TimelineCaptionTiming,
): string | null {
  if (!isRecord(patch) || Object.keys(patch).length === 0) return "No caption changes were provided.";
  if (unknownKeys(patch, ["text", "start_seconds", "end_seconds", "position", "style"])) {
    return "This caption change is not supported.";
  }

  if ("text" in patch && (typeof patch["text"] !== "string" || patch["text"].length > 5000)) {
    return "Caption text must be 5,000 characters or fewer.";
  }
  if ("position" in patch && !["top", "center", "bottom"].includes(String(patch["position"]))) {
    return "Caption position is invalid.";
  }
  if ("style" in patch && !isRecord(patch["style"])) return "Caption style is invalid.";

  const start = "start_seconds" in patch ? numericField(patch, "start_seconds") : current.start_seconds;
  const end = "end_seconds" in patch ? numericField(patch, "end_seconds") : current.end_seconds;
  if (start === null || !Number.isFinite(start) || end === null || !Number.isFinite(end)) {
    return "Caption timing must use finite numbers.";
  }
  if (start < 0) return "Caption start cannot be negative.";
  if (start > MAX_TIMELINE_SECONDS || end > MAX_TIMELINE_SECONDS) {
    return "Caption timing cannot exceed 24 hours.";
  }
  if (end <= start) return "Caption end must be after its start.";
  return null;
}

export function validateTimelineSettingsPatch(patch: unknown): string | null {
  if (!isRecord(patch) || Object.keys(patch).length === 0) return "No timeline setting changes were provided.";
  if (unknownKeys(patch, ["fps", "grid_seconds"])) return "This timeline setting is not supported.";

  if ("fps" in patch) {
    const fps = numericField(patch, "fps");
    if (fps === null || ![24, 25, 30, 50, 60].includes(fps)) {
      return "FPS must be 24, 25, 30, 50, or 60.";
    }
  }
  if ("grid_seconds" in patch) {
    const grid = numericField(patch, "grid_seconds");
    if (grid === null || grid < 0.1 || grid > 10) {
      return "Timeline grid must be between 0.1 and 10 seconds.";
    }
  }
  return null;
}
