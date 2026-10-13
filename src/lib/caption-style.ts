// Caption styling shared by the editor preview and the render export.
export const CAPTION_FONTS = [
  "Inter", "Montserrat", "Bebas Neue", "Anton", "Poppins", "Oswald",
  "Roboto", "Playfair Display", "Lora", "Permanent Marker", "Bangers", "Space Mono",
] as const;

export type CaptionStyle = {
  font: string;
  size: number; // px at 1080p-height reference
  color: string;
  background: string;
  backgroundOpacity: number; // 0..1
  strokeColor: string;
  strokeWidth: number; // px
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  align: "left" | "center" | "right";
  x: number; // centre point, percent of frame width 0..100
  y: number; // centre point, percent of frame height 0..100
  maxWidth: number; // percent of frame width
  animation: "none" | "fade" | "pop" | "slide";
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  font: "Inter", size: 56, color: "#ffffff", background: "#000000", backgroundOpacity: 0.6,
  strokeColor: "#000000", strokeWidth: 0, bold: true, italic: false, uppercase: false,
  align: "center", x: 50, y: 85, maxWidth: 80, animation: "none",
};

export const CAPTION_PRESETS: { name: string; style: Partial<CaptionStyle> }[] = [
  { name: "Classic", style: { font: "Inter", size: 52, color: "#ffffff", backgroundOpacity: 0.6, strokeWidth: 0, uppercase: false } },
  { name: "Bold pop", style: { font: "Anton", size: 80, color: "#ffe14d", backgroundOpacity: 0, strokeColor: "#000000", strokeWidth: 6, uppercase: true, animation: "pop" } },
  { name: "Clean", style: { font: "Montserrat", size: 48, color: "#ffffff", backgroundOpacity: 0, strokeWidth: 3, strokeColor: "#000000" } },
  { name: "Cinematic", style: { font: "Playfair Display", size: 44, color: "#f5f0e6", backgroundOpacity: 0, strokeWidth: 0, italic: true, bold: false, animation: "fade" } },
  { name: "Comic", style: { font: "Bangers", size: 72, color: "#ffffff", backgroundOpacity: 0, strokeColor: "#e11d48", strokeWidth: 5, uppercase: true } },
  { name: "Boxed", style: { font: "Oswald", size: 54, color: "#111111", background: "#ffffff", backgroundOpacity: 1, strokeWidth: 0, uppercase: true } },
];

const clamp = (v: unknown, min: number, max: number, d: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);
const POSITION_Y: Record<string, number> = { top: 12, center: 50, bottom: 85 };

export function normalizeCaptionStyle(raw: unknown, position?: string): CaptionStyle {
  const s = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CAPTION_STYLE;
  return {
    font: typeof s.font === "string" && (CAPTION_FONTS as readonly string[]).includes(s.font) ? s.font : d.font,
    size: clamp(s.size, 12, 200, d.size),
    color: hex(s.color, d.color),
    background: hex(s.background, d.background),
    backgroundOpacity: clamp(s.backgroundOpacity, 0, 1, d.backgroundOpacity),
    strokeColor: hex(s.strokeColor, d.strokeColor),
    strokeWidth: clamp(s.strokeWidth, 0, 20, d.strokeWidth),
    bold: typeof s.bold === "boolean" ? s.bold : d.bold,
    italic: typeof s.italic === "boolean" ? s.italic : d.italic,
    uppercase: typeof s.uppercase === "boolean" ? s.uppercase : d.uppercase,
    align: s.align === "left" || s.align === "right" ? s.align : "center",
    x: clamp(s.x, 0, 100, d.x),
    y: clamp(s.y, 0, 100, position ? POSITION_Y[position] ?? d.y : d.y),
    maxWidth: clamp(s.maxWidth, 20, 100, d.maxWidth),
    animation: s.animation === "fade" || s.animation === "pop" || s.animation === "slide" ? s.animation : "none",
  };
}

/** Nearest legacy position bucket, kept in sync for older consumers. */
export function positionBucket(y: number): "top" | "center" | "bottom" {
  return y < 33 ? "top" : y > 66 ? "bottom" : "center";
}

export function hexToRgba(h: string, a: number) {
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** CSS used both in the preview (scaled) and the render HTML asset. */
export function captionTextCss(s: CaptionStyle, scale = 1): Record<string, string> {
  return {
    fontFamily: `'${s.font}', sans-serif`,
    fontSize: `${s.size * scale}px`,
    lineHeight: "1.15",
    color: s.color,
    fontWeight: s.bold ? "800" : "500",
    fontStyle: s.italic ? "italic" : "normal",
    textTransform: s.uppercase ? "uppercase" : "none",
    textAlign: s.align,
    background: s.backgroundOpacity > 0 ? hexToRgba(s.background, s.backgroundOpacity) : "transparent",
    padding: s.backgroundOpacity > 0 ? `${0.2 * s.size * scale}px ${0.4 * s.size * scale}px` : "0",
    borderRadius: `${0.15 * s.size * scale}px`,
    WebkitTextStroke: s.strokeWidth > 0 ? `${s.strokeWidth * scale}px ${s.strokeColor}` : "0",
    paintOrder: "stroke fill",
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
  };
}
