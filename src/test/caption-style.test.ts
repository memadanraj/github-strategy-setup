import { describe, expect, it } from "vitest";
import { normalizeCaptionStyle, positionBucket } from "@/lib/caption-style";
import { validateTimelineCaptionPatch } from "@/lib/timeline-validation";

describe("caption style", () => {
  it("clamps font size to 12-200", () => {
    expect(normalizeCaptionStyle({ size: 999 }).size).toBe(200);
    expect(normalizeCaptionStyle({ size: 2 }).size).toBe(12);
  });
  it("keeps captions inside the frame", () => {
    const s = normalizeCaptionStyle({ x: -20, y: 140 });
    expect(s.x).toBe(0);
    expect(s.y).toBe(100);
  });
  it("uses legacy position when no y is stored", () => {
    expect(normalizeCaptionStyle({}, "top").y).toBe(12);
  });
  it("rejects invalid colours", () => {
    expect(normalizeCaptionStyle({ color: "red" }).color).toBe("#ffffff");
  });
  it("maps y to position bucket", () => {
    expect(positionBucket(10)).toBe("top");
    expect(positionBucket(90)).toBe("bottom");
  });
  it("allows style patches", () => {
    expect(validateTimelineCaptionPatch({ style: { size: 40 } }, { start_seconds: 0, end_seconds: 1 })).toBeNull();
  });
});
