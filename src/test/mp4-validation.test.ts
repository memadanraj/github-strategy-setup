import { describe, expect, it } from "vitest";
import {
  MAX_GENERATED_CLIP_BYTES,
  MAX_RENDER_EXPORT_BYTES,
  Mp4ValidationError,
  validateGeneratedClip,
  validateMp4Container,
} from "@/lib/mp4-validation";

function box(type: string, payload: number[] = []): number[] {
  const size = payload.length + 8;
  return [
    (size >>> 24) & 255, (size >>> 16) & 255,
    (size >>> 8) & 255, size & 255,
    ...Array.from(type).map((character) => character.charCodeAt(0)),
    ...payload,
  ];
}

const brand = [..."isom"].map((character) => character.charCodeAt(0));
function validMp4(): Uint8Array {
  const ftyp = box("ftyp", [...brand, 0, 0, 0, 0, ...brand]);
  const moov = box("moov", box("mvhd", [0, 0, 0, 0]));
  const mdat = box("mdat", [1, 2, 3, 4]);
  return new Uint8Array([...ftyp, ...moov, ...mdat]);
}

describe("rendered MP4 container validation", () => {
  it("accepts a structurally valid MP4 with the required top-level boxes", () => {
    expect(() => validateMp4Container(validMp4(), "video/mp4")).not.toThrow();
  });

  it("accepts generic binary content type only when the bytes are a valid MP4", () => {
    expect(() => validateMp4Container(validMp4(), "application/octet-stream")).not.toThrow();
    expect(() => validateMp4Container(new TextEncoder().encode("<html>error</html>"), "application/octet-stream"))
      .toThrow(Mp4ValidationError);
  });

  it("rejects non-MP4 content types even when bytes look valid", () => {
    expect(() => validateMp4Container(validMp4(), "text/html")).toThrow("MP4-compatible content type");
    expect(() => validateMp4Container(validMp4(), "video/quicktime")).toThrow("MP4-compatible content type");
  });

  it("rejects truncated box sizes and short headers", () => {
    const truncated = validMp4();
    truncated[3] = 250;
    expect(() => validateMp4Container(truncated, "video/mp4")).toThrow("truncated or invalid MP4 box");
    expect(() => validateMp4Container(new Uint8Array(12), "video/mp4")).toThrow("too small");
  });

  it("requires file-type, movie, and non-empty media-data boxes", () => {
    const ftyp = box("ftyp", [...brand, 0, 0, 0, 0, ...brand]);
    const mdat = box("mdat", Array.from({ length: 10 }, () => 1));
    expect(() => validateMp4Container(new Uint8Array([...ftyp, ...mdat]), "video/mp4"))
      .toThrow("missing required MP4");
    const moov = box("moov", box("mvhd", [0]));
    expect(() => validateMp4Container(new Uint8Array([...ftyp, ...moov, ...box("mdat")]), "video/mp4"))
      .toThrow("empty MP4 media-data");
  });

  it("rejects files over the configured export size limit", () => {
    expect(MAX_RENDER_EXPORT_BYTES).toBe(512 * 1024 * 1024);
    expect(() => validateMp4Container(validMp4(), "video/mp4", 32)).toThrow("size limit");
  });

  it("accepts an extended-size file-type box", () => {
    const ftypExtended = [
      0, 0, 0, 1, ...[..."ftyp"].map((character) => character.charCodeAt(0)),
      0, 0, 0, 0, 0, 0, 0, 28,
      ...brand, 0, 0, 0, 0, ...brand,
    ];
    const rest = validMp4().slice(20);
    expect(() => validateMp4Container(new Uint8Array([...ftypExtended, ...rest]), "video/mp4")).not.toThrow();
  });
});

describe("generated scene-clip validation", () => {
  it("accepts only structurally valid MP4 data before clip persistence", () => {
    expect(() => validateGeneratedClip(validMp4(), "video/mp4")).not.toThrow();
    expect(() => validateGeneratedClip(new TextEncoder().encode("<html>provider error</html>"), "video/mp4"))
      .toThrow(Mp4ValidationError);
  });

  it("rejects non-MP4 video content types instead of relabeling them as MP4", () => {
    expect(() => validateGeneratedClip(validMp4(), "video/webm"))
      .toThrow("MP4-compatible content type");
  });

  it("applies the smaller scene-clip download budget", () => {
    expect(MAX_GENERATED_CLIP_BYTES).toBe(128 * 1024 * 1024);
    expect(() => validateGeneratedClip(validMp4(), "video/mp4", 32)).toThrow("size limit");
  });
});
