import { describe, expect, it } from "vitest";
import { buildProductionPlan, getTargetDurationSeconds, productionPlanContext } from "@/lib/production-plan";

const base = {
  format: "long", videoType: "explainer", targetAudience: " New creators ",
  tone: "engaging", language: "en", durationSeconds: 480, visualStyle: "cinematic",
  platform: "youtube", captionsEnabled: true,
};

describe("project production plan", () => {
  it("builds a persisted brief and ordered production stages", () => {
    const plan = buildProductionPlan(base);
    expect(plan.brief).toMatchObject({ targetAudience: "New creators", targetDurationSeconds: 480, aspectRatio: "16:9", captionsEnabled: true });
    expect(plan.plan.recommendedSceneCount).toBe(40);
    expect(plan.plan.stages).toHaveLength(8);
  });

  it("bounds duration and uses safe defaults for invalid choices", () => {
    expect(buildProductionPlan({ ...base, format: "short", durationSeconds: 500, tone: "unknown" })).toMatchObject({
      brief: { targetDurationSeconds: 60, aspectRatio: "9:16", tone: "engaging" },
    });
    expect(buildProductionPlan({ ...base, durationSeconds: 0, videoType: "invalid" })).toMatchObject({
      brief: { targetDurationSeconds: 300, videoType: "explainer" },
    });
  });

  it("bounds target duration when persisted settings are missing or malformed", () => {
    expect(getTargetDurationSeconds(null, "short")).toBe(45);
    expect(getTargetDurationSeconds({ brief: { targetDurationSeconds: 9999 } }, "long")).toBe(1200);
    expect(getTargetDurationSeconds({ brief: { targetDurationSeconds: 1 } }, "short")).toBe(15);
  });

  it("formats saved preferences into prompt context", () => {
    const context = productionPlanContext(buildProductionPlan(base));
    expect(context).toContain("Audience: New creators");
    expect(context).toContain("Target duration: 8 minutes (480 seconds)");
    expect(context).toContain("Aspect ratio: 16:9");
  });
});
