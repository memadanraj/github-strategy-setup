export type RenderManifest = {
  projectId: string; width: number; height: number; fps: number; format: string;
  scenes: any[]; tracks: any[]; clips: any[]; captions: any[]; assets: any[];
};
export type RenderSubmitResult = { providerJobId: string };
export type RenderStatus = { status: "queued" | "processing" | "completed" | "failed"; progress: number; outputUrl?: string; error?: string };
export interface RenderProvider { submit(manifest: RenderManifest): Promise<RenderSubmitResult>; status(providerJobId: string): Promise<RenderStatus> }

export class HttpRenderProvider implements RenderProvider {
  constructor(private baseUrl: string, private apiKey?: string) {}
  private headers() { return { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) } }
  async submit(manifest: RenderManifest) { const r = await fetch(`${this.baseUrl.replace(/\/$/, "")}/jobs`, { method: "POST", headers: this.headers(), body: JSON.stringify({ manifest }) }); if (!r.ok) throw new Error(`Renderer submit failed (${r.status})`); const j: any = await r.json(); if (!j.id && !j.jobId) throw new Error("Renderer returned no job id"); return { providerJobId: j.id || j.jobId } }
  async status(id: string): Promise<RenderStatus> { const r = await fetch(`${this.baseUrl.replace(/\/$/, "")}/jobs/${encodeURIComponent(id)}`, { headers: this.headers() }); if (!r.ok) throw new Error(`Renderer status failed (${r.status})`); const j: any = await r.json(); const raw = String(j.status || "processing"); const status: RenderStatus["status"] = raw === "succeeded" || raw === "success" ? "completed" : raw === "error" ? "failed" : raw === "queued" ? "queued" : "processing"; return { status, progress: Number(j.progress ?? 0), outputUrl: j.output_url || j.outputUrl || j.url, error: j.error?.message || j.error } }
}

const AUDIO_TRACKS = new Set(["audio", "voice", "music", "sfx"]);

/** Converts our manifest into a Shotstack edit. Assets/scenes must carry signed `url`/`image_url`/`clip_url`. */
export function toShotstackEdit(m: RenderManifest) {
  const assetById = new Map(m.assets.map((a: any) => [a.id, a]));
  const trackById = new Map(m.tracks.map((t: any) => [t.id, t]));
  const visual: any[] = [], audio: any[] = [];
  for (const c of m.clips) {
    const a: any = c.asset_id ? assetById.get(c.asset_id) : null;
    if (!a?.url) continue;
    const t: any = trackById.get(c.track_id);
    if (t?.muted || t?.visible === false) continue;
    const start = Number(c.start_seconds) || 0, length = Math.max(0.1, Number(c.duration_seconds) || 1);
    const isAudio = AUDIO_TRACKS.has(t?.track_type) || ["audio", "voice", "music"].includes(a.kind);
    if (isAudio) audio.push({ asset: { type: "audio", src: a.url, trim: Number(c.source_start_seconds) || 0, volume: Number(c.volume ?? 1) * Number(t?.volume ?? 1) }, start, length });
    else visual.push({ asset: a.kind === "video" ? { type: "video", src: a.url, trim: Number(c.source_start_seconds) || 0, volume: Number(c.volume ?? 1) } : { type: "image", src: a.url }, start, length, fit: "cover" });
  }
  // Fallback: no timeline visuals -> lay scenes end to end.
  if (visual.length === 0) {
    let t = 0;
    for (const s of m.scenes) {
      const length = Math.max(1, Number(s.duration_seconds) || 5);
      const src = s.clip_url || s.image_url;
      if (src) visual.push({ asset: s.clip_url ? { type: "video", src } : { type: "image", src }, start: t, length, fit: "cover", effect: s.clip_url ? undefined : "zoomInSlow" });
      t += length;
    }
  }
  if (visual.length === 0) throw new Error("Nothing to render — add images or clips to your scenes first.");
  const captions = m.captions.filter((c: any) => c.text?.trim()).map((c: any) => ({
    asset: { type: "title", text: c.text, style: "subtitle", size: "small", position: c.position === "top" ? "top" : c.position === "center" ? "center" : "bottom" },
    start: Number(c.start_seconds) || 0, length: Math.max(0.2, Number(c.end_seconds) - Number(c.start_seconds)),
  }));
  const tracks = [captions, visual, audio].filter((x) => x.length).map((clips) => ({ clips }));
  return { timeline: { background: "#000000", tracks }, output: { format: "mp4", fps: m.fps || 30, size: { width: m.width, height: m.height } } };
}

export class ShotstackRenderProvider implements RenderProvider {
  constructor(private apiKey: string, private env: string) {}
  private base() { return `https://api.shotstack.io/edit/${this.env}` }
  async submit(m: RenderManifest) {
    const r = await fetch(`${this.base()}/render`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": this.apiKey }, body: JSON.stringify(toShotstackEdit(m)) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.response?.id) { console.error("Shotstack submit failed", r.status, j); throw new Error(r.status === 403 || r.status === 401 ? "Shotstack rejected the API key." : `Shotstack couldn't start the render (${j?.message || r.status}).`) }
    return { providerJobId: j.response.id as string };
  }
  async status(id: string): Promise<RenderStatus> {
    const r = await fetch(`${this.base()}/render/${encodeURIComponent(id)}`, { headers: { "x-api-key": this.apiKey } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Shotstack status failed (${r.status})`);
    const s = String(j.response?.status || "queued");
    const progress: Record<string, number> = { queued: 5, fetching: 20, rendering: 60, saving: 90, done: 100 };
    if (s === "done") return { status: "completed", progress: 100, outputUrl: j.response.url };
    if (s === "failed") return { status: "failed", progress: 0, error: j.response?.error || "Render failed" };
    return { status: s === "queued" ? "queued" : "processing", progress: progress[s] ?? 50 };
  }
}

export function getRenderProvider(): RenderProvider | null {
  const key = process.env["SHOTSTACK_API_KEY"];
  if (key) return new ShotstackRenderProvider(key, process.env["SHOTSTACK_ENV"] || "stage");
  const url = process.env["RENDERER_URL"];
  if (!url) return null;
  return new HttpRenderProvider(url, process.env["RENDERER_API_KEY"]);
}
