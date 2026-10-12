import { describe, expect, it } from "vitest";
import {
  validateTimelineCaptionPatch,
  validateTimelineClipPatch,
  validateTimelineSettingsPatch,
} from "@/lib/timeline-validation";

describe("timeline editor input validation", () => {
  it.each([
    { start_seconds: 0 },
    { duration_seconds: 0.1 },
    { source_start_seconds: 0 },
    { playback_rate: 4 },
    { volume: 2 },
    { opacity: 0.5 },
    { transition_in: null },
  ])("accepts valid clip patches: %j", (patch) => {
    expect(validateTimelineClipPatch(patch)).toBeNull();
  });

  it.each([
    { start_seconds: -0.1 },
    { duration_seconds: 0 },
    { source_start_seconds: -1 },
    { playback_rate: 0 },
    { playback_rate: 4.1 },
    { volume: -0.1 },
    { volume: 2.1 },
    { opacity: -0.1 },
    { opacity: 1.1 },
    { start_seconds: Number.NaN },
    { project_id: "another-project" },
    {},
    null,
  ])("rejects invalid clip patches: %j", (patch) => {
    expect(validateTimelineClipPatch(patch)).not.toBeNull();
  });

  it("limits clip timing to 24 hours and validates the combined clip end", () => {
    expect(validateTimelineClipPatch({ start_seconds: 86400 })).toBeNull();
    expect(validateTimelineClipPatch({ start_seconds: 86401 })).toContain("24 hours");
    expect(validateTimelineClipPatch({ duration_seconds: 86401 })).toContain("24 hours");
    expect(validateTimelineClipPatch({ source_start_seconds: 86401 })).toContain("24 hours");
    expect(validateTimelineClipPatch(
      { start_seconds: 86399 },
      { start_seconds: 10, duration_seconds: 5 },
    )).toBeNull();
    expect(validateTimelineClipPatch(
      { start_seconds: 86399 },
      { start_seconds: 86399, duration_seconds: 2 },
    )).toContain("Clip end");
    expect(validateTimelineClipPatch(
      { duration_seconds: 2 },
      { start_seconds: 86399, duration_seconds: 1 },
    )).toContain("Clip end");
  });

  it("validates caption timing using both the patch and saved values", () => {
    const current = { start_seconds: 1, end_seconds: 2, text: "Caption", position: "bottom" };
    expect(validateTimelineCaptionPatch({ start_seconds: 1.5 }, current)).toBeNull();
    expect(validateTimelineCaptionPatch({ end_seconds: 1 }, current)).toContain("after its start");
    expect(validateTimelineCaptionPatch({ start_seconds: -1 }, current)).toContain("cannot be negative");
    expect(validateTimelineCaptionPatch({ position: "outside" }, current)).toContain("position");
    expect(validateTimelineCaptionPatch({ text: "x".repeat(5001) }, current)).toContain("5,000");
    expect(validateTimelineCaptionPatch({ start_seconds: Number.POSITIVE_INFINITY }, current)).toContain("finite");
    expect(validateTimelineCaptionPatch({ start_seconds: 86401 }, current)).toContain("24 hours");
    expect(validateTimelineCaptionPatch({ end_seconds: 86401 }, current)).toContain("24 hours");
  });

  it("validates FPS and grid bounds", () => {
    expect(validateTimelineSettingsPatch({ fps: 30 })).toBeNull();
    expect(validateTimelineSettingsPatch({ grid_seconds: 0.1 })).toBeNull();
    expect(validateTimelineSettingsPatch({ fps: 29 })).toContain("FPS");
    expect(validateTimelineSettingsPatch({ grid_seconds: 11 })).toContain("grid");
    expect(validateTimelineSettingsPatch({ fps: "30" })).toContain("FPS");
    expect(validateTimelineSettingsPatch({ project_id: "other" })).toContain("not supported");
  });
});
