import { describe, expect, it } from "vitest";
import {
  MAX_PROJECT_ASSET_SIZE_BYTES,
  safeProjectAssetFileName,
  validateProjectAssetFile,
} from "@/lib/project-assets";

describe("project asset upload validation", () => {
  it.each([
    { name: "photo.png", size: 1200, type: "image/png" },
    { name: "clip.mp4", size: 40 * 1024 * 1024, type: "video/mp4" },
    { name: "voice.mp3", size: 10_000, type: "audio/mpeg" },
  ])("accepts supported media: %j", (file) => {
    expect(validateProjectAssetFile(file)).toBeNull();
  });

  it("accepts a file at the configured 50 MB limit", () => {
    expect(validateProjectAssetFile({
      name: "clip.mp4",
      size: MAX_PROJECT_ASSET_SIZE_BYTES,
      type: "video/mp4",
    })).toBeNull();
  });

  it.each([
    { name: "empty.mp4", size: 0, type: "video/mp4" },
    { name: "bad.mp4", size: -2, type: "video/mp4" },
    { name: "large.mp4", size: MAX_PROJECT_ASSET_SIZE_BYTES + 1, type: "video/mp4" },
    { name: "document.pdf", size: 100, type: "application/pdf" },
    { name: "unknown", size: 100, type: "" },
    { name: "spoofed", size: 100, type: "text/html" },
  ])("rejects invalid file metadata: %j", (file) => {
    expect(validateProjectAssetFile(file)).not.toBeNull();
  });

  it("normalizes path separators and unsafe filename characters", () => {
    expect(safeProjectAssetFileName("../../raw video?.mp4")).toBe(".._.._raw video_.mp4");
    expect(safeProjectAssetFileName("")).toBe("uploaded-file");
    expect(safeProjectAssetFileName("x".repeat(200))).toHaveLength(120);
  });
});
