export const MAX_RENDER_EXPORT_BYTES = 512 * 1024 * 1024;

/** Scene clips use a smaller download budget than final rendered exports. */
export const MAX_GENERATED_CLIP_BYTES = 128 * 1024 * 1024;

/** Reject provider media that cannot safely be stored with an .mp4 extension. */
export function validateGeneratedClip(
  bytes: Uint8Array,
  contentType: string,
  maxBytes = MAX_GENERATED_CLIP_BYTES,
): void {
  validateMp4Container(bytes, contentType, maxBytes);
}

export class Mp4ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp4ValidationError";
  }
}

function fail(message: string): never {
  throw new Mp4ValidationError(message);
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

/**
 * Validate the outer ISO Base Media File Format structure before persisting a
 * renderer download as a ready MP4. This validates container structure, not
 * codec compatibility or the integrity of every media sample.
 */
export function validateMp4Container(
  bytes: Uint8Array,
  contentType: string,
  maxBytes = MAX_RENDER_EXPORT_BYTES,
): void {
  const normalizedType = contentType.split(";")[0]?.trim().toLowerCase();
  if (normalizedType !== "video/mp4" && normalizedType !== "application/octet-stream") {
    fail("Renderer output did not have an MP4-compatible content type.");
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 32) {
    fail("Renderer output is too small to be a valid MP4 file.");
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 32 || bytes.byteLength > maxBytes) {
    fail("Renderer output exceeded the configured MP4 size limit.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let boxes = 0;
  let sawFileType = false;
  let sawMovie = false;
  let sawMediaData = false;

  while (offset < bytes.byteLength) {
    const remaining = bytes.byteLength - offset;
    if (remaining < 8) fail("Renderer output has a truncated MP4 box header.");

    let size = view.getUint32(offset, false);
    const type = fourCC(bytes, offset + 4);
    let headerSize = 8;

    if (size === 1) {
      if (remaining < 16) fail("Renderer output has a truncated extended MP4 box header.");
      const extendedSize = view.getBigUint64(offset + 8, false);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
        fail("Renderer output contains an oversized MP4 box.");
      }
      size = Number(extendedSize);
      headerSize = 16;
    } else if (size === 0) {
      size = remaining;
    }

    if (size < headerSize || size > remaining) {
      fail("Renderer output contains a truncated or invalid MP4 box.");
    }

    if (type === "ftyp") {
      if (size < 16) fail("Renderer output contains an invalid MP4 file-type box.");
      sawFileType = true;
    } else if (type === "moov") {
      if (size < 16) fail("Renderer output contains an invalid MP4 movie box.");
      sawMovie = true;
    } else if (type === "mdat") {
      if (size <= headerSize) fail("Renderer output contains an empty MP4 media-data box.");
      sawMediaData = true;
    }

    offset += size;
    boxes += 1;
    if (boxes > 100_000) fail("Renderer output contains too many MP4 boxes.");
  }

  if (offset !== bytes.byteLength) fail("Renderer output has trailing malformed MP4 data.");
  if (!sawFileType || !sawMovie || !sawMediaData) {
    fail("Renderer output is missing required MP4 file, movie, or media-data boxes.");
  }
}
