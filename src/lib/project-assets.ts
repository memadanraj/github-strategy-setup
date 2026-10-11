export const MAX_PROJECT_ASSET_SIZE_BYTES = 50 * 1024 * 1024;

export type ProjectAssetFileInfo = {
  name: string;
  size: number;
  type: string;
};

export function validateProjectAssetFile(file: ProjectAssetFileInfo): string | null {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "The selected file is empty or has an invalid size.";
  }
  if (file.size > MAX_PROJECT_ASSET_SIZE_BYTES) {
    return "Files must be 50 MB or smaller.";
  }
  if (!/^(image|video|audio)\/[a-z0-9.+-]+$/i.test(file.type.trim())) {
    return "Choose an image, video, or audio file with a recognized media type.";
  }
  return null;
}

/** Keep uploaded filenames within one storage-path segment and bound metadata length. */
export function safeProjectAssetFileName(name: string): string {
  const normalized = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "");
  const safe = normalized.replace(/[^a-zA-Z0-9._() -]/g, "_").trim().slice(0, 120);
  return safe || "uploaded-file";
}
