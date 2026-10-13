import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Play, Pause, SkipBack, SkipForward, Wand2, Captions as CaptionsIcon, Lock, Volume2, VolumeX, Undo2, Redo2,
  Plus, Trash2, Magnet, ZoomIn, ZoomOut, Bold, Italic, CaseUpper, AlignLeft, AlignCenter, AlignRight, Copy, Film, Image as ImageIcon, Music, Type,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { rebuildProjectTimeline, regenerateProjectCaptions } from "@/lib/timeline-operations";
import { ClipInspectorForm, TimelineSettingsForm } from "@/components/studio/TimelineEditForms";
import { createTimelineClipEdit, recordTimelineEdit, takeTimelineUndo, takeTimelineRedo, type TimelineHistory } from "@/lib/timeline-history";
import { validateTimelineCaptionPatch, validateTimelineClipPatch, type TimelineClipTiming, validateTimelineSettingsPatch } from "@/lib/timeline-validation";
import {
  CAPTION_FONTS, CAPTION_PRESETS, captionTextCss, normalizeCaptionStyle, positionBucket, type CaptionStyle,
} from "@/lib/caption-style";

const db: any = supabase;
const PX = 72;
const HEAD_W = 148;
type Project = Tables<"projects">;

const FONT_HREF = `https://fonts.googleapis.com/css2?${CAPTION_FONTS.map((f) => `family=${f.replace(/ /g, "+")}:ital,wght@0,400;0,500;0,800;1,400;1,800`).join("&")}&display=swap`
  .replace(/family=(Bebas\+Neue|Anton|Permanent\+Marker|Bangers):ital,wght@[^&]+/g, "family=$1");

function useCaptionFonts() {
  useEffect(() => {
    if (document.getElementById("caption-fonts")) return;
    const l = document.createElement("link");
    l.id = "caption-fonts"; l.rel = "stylesheet"; l.href = FONT_HREF;
    document.head.appendChild(l);
  }, []);
}

export function TimelinePanel({ project }: { project: Project }) {
  useCaptionFonts();
  const qc = useQueryClient();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [history, setHistory] = useState<TimelineHistory>({ undo: [], redo: [] });
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyInFlight = useRef(false);
  const saveTimers = useRef<Record<string, number>>({});

  const q = (key: string, table: string, order: string) => ({
    queryKey: [key, project.id],
    queryFn: async () => {
      const r = await db.from(table).select("*").eq("project_id", project.id).order(order);
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: scenes = [] } = useQuery(q("scenes", "scenes", "position"));
  const { data: tracks = [] } = useQuery(q("timeline_tracks", "timeline_tracks", "position"));
  const { data: clips = [] } = useQuery(q("timeline_clips", "timeline_clips", "start_seconds"));
  const { data: captions = [] } = useQuery(q("captions", "captions", "start_seconds"));
  const { data: settings } = useQuery({
    queryKey: ["timeline_settings", project.id],
    queryFn: async () => {
      const r = await db.from("timeline_settings").select("*").eq("project_id", project.id).maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
  });

  const duration = Math.max(
    scenes.reduce((n: number, s: any) => n + Number(s.duration_seconds || 0), 0),
    clips.reduce((n: number, c: any) => Math.max(n, Number(c.start_seconds) + Number(c.duration_seconds)), 0),
    captions.reduce((n: number, c: any) => Math.max(n, Number(c.end_seconds)), 0),
    1,
  );
  const scale = PX * zoom;
  const grid = Number(settings?.grid_seconds) || 0.5;
  const snapTo = useCallback((v: number) => (snap ? Math.round(v / grid) * grid : Math.round(v * 100) / 100), [snap, grid]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setTime((t) => { const n = t + dt; if (n >= duration) { setPlaying(false); return duration; } return n; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  async function refresh() {
    await Promise.all(["timeline_tracks", "timeline_clips", "captions", "timeline_settings"].map((k) => qc.invalidateQueries({ queryKey: [k, project.id] })));
  }

  async function buildTimeline() {
    if (!scenes.length) { toast.error("Add scenes first."); return; }
    if (clips.length && !confirm("Rebuild the timeline? Existing timeline clips will be replaced.")) return;
    setBuilding(true);
    try {
      const result = await rebuildProjectTimeline((args) => db.rpc("rebuild_project_timeline", args), project.id);
      await refresh();
      toast.success(`Timeline built from scenes (${result.clipCount} clips).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rebuild timeline. Existing clips were preserved.");
    } finally { setBuilding(false); }
  }

  async function generateCaptions() {
    if (!scenes.length) { toast.error("Add scenes first."); return; }
    if (captions.length && !confirm("Replace existing captions?")) return;
    setCaptioning(true);
    try {
      const result = await regenerateProjectCaptions((args) => db.rpc("regenerate_project_captions", args), project.id);
      await refresh();
      toast.success(`Created ${result.cueCount} caption cues.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Caption generation failed. Existing captions were preserved.");
    } finally { setCaptioning(false); }
  }

  // ---------- clips ----------
  async function persistClipPatch(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const current = clips.find((clip: any) => clip.id === id) as TimelineClipTiming | undefined;
    if (!current) { toast.error("Clip not found or no longer available."); return false; }
    const invalid = validateTimelineClipPatch(patch, current);
    if (invalid) { toast.error(invalid); return false; }
    try {
      const result = await db.from("timeline_clips").update({ ...patch, updated_at: new Date().toISOString() })
        .eq("project_id", project.id).eq("id", id).select("id").maybeSingle();
      if (result.error) { toast.error(result.error.message); return false; }
      if (!result.data) { toast.error("Clip not found or no longer available."); return false; }
      await qc.invalidateQueries({ queryKey: ["timeline_clips", project.id] });
      return true;
    } catch { toast.error("Could not save the clip. Check your connection and try again."); return false; }
  }

  async function updateClip(id: string, patch: Record<string, unknown>): Promise<boolean> {
    if (historyInFlight.current) { toast.error("Wait for the current timeline edit to finish saving."); return false; }
    const current = clips.find((clip: any) => clip.id === id);
    if (!current) { toast.error("Clip not found or no longer available."); return false; }
    const invalid = validateTimelineClipPatch(patch, current);
    if (invalid) { toast.error(invalid); return false; }
    const edit = createTimelineClipEdit(id, current, patch);
    historyInFlight.current = true; setHistoryBusy(true);
    try {
      const saved = await persistClipPatch(id, patch);
      if (saved && edit) setHistory((previous) => recordTimelineEdit(previous, edit));
      return saved;
    } finally { historyInFlight.current = false; setHistoryBusy(false); }
  }

  async function stepHistory(dir: "undo" | "redo") {
    if (historyInFlight.current) return;
    const action = dir === "undo" ? takeTimelineUndo(history) : takeTimelineRedo(history);
    if (!action.edit) return;
    historyInFlight.current = true; setHistoryBusy(true);
    try {
      const saved = await persistClipPatch(action.edit.clipId, dir === "undo" ? action.edit.before : action.edit.after);
      if (!saved) return;
      setHistory(action.history); setSelected(action.edit.clipId);
    } finally { historyInFlight.current = false; setHistoryBusy(false); }
  }

  async function deleteClip(id: string) {
    const r = await db.from("timeline_clips").delete().eq("project_id", project.id).eq("id", id).select("id").maybeSingle();
    if (r.error || !r.data) { toast.error(r.error?.message || "Clip not found."); return; }
    setSelected(null); await refresh();
  }

  // ---------- captions ----------
  async function updateCaption(id: string, patch: any): Promise<boolean> {
    const current = captions.find((c: any) => c.id === id);
    if (!current) { toast.error("Caption not found or no longer available."); return false; }
    const invalid = validateTimelineCaptionPatch(patch, current);
    if (invalid) { toast.error(invalid); return false; }
    const r = await db.from("captions").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("project_id", project.id).eq("id", id).select("id").maybeSingle();
    if (r.error) { toast.error(r.error.message); return false; }
    if (!r.data) { toast.error("Caption not found or no longer available."); return false; }
    return true;
  }

  /** Instant local update + debounced save, so sliders and dragging feel live. */
  function patchCaptionLive(id: string, patch: any) {
    const current = captions.find((c: any) => c.id === id);
    if (!current) return;
    const next = { ...patch };
    if (patch.style) {
      const style = { ...normalizeCaptionStyle(current.style, current.position), ...patch.style };
      next.style = style;
      next.position = positionBucket(style.y);
    }
    qc.setQueryData(["captions", project.id], (rows: any[] = []) => rows.map((c) => (c.id === id ? { ...c, ...next } : c)));
    window.clearTimeout(saveTimers.current[id]);
    const pending = { ...((saveTimers.current as any)[`p_${id}`] || {}), ...next };
    (saveTimers.current as any)[`p_${id}`] = pending;
    saveTimers.current[id] = window.setTimeout(async () => {
      const body = (saveTimers.current as any)[`p_${id}`];
      delete (saveTimers.current as any)[`p_${id}`];
      const ok = await updateCaption(id, body);
      if (!ok) qc.invalidateQueries({ queryKey: ["captions", project.id] });
    }, 450);
  }

  async function addCaption() {
    const last = captions[captions.length - 1];
    const style = last ? normalizeCaptionStyle(last.style, last.position) : normalizeCaptionStyle({});
    const start = Math.round(time * 100) / 100;
    const r = await db.from("captions").insert({
      project_id: project.id, text: "New caption", start_seconds: start, end_seconds: start + 2,
      position: positionBucket(style.y), style,
    }).select("id").single();
    if (r.error) { toast.error(r.error.message); return; }
    await qc.invalidateQueries({ queryKey: ["captions", project.id] });
    setSelected(r.data.id);
  }

  async function deleteCaption(id: string) {
    const r = await db.from("captions").delete().eq("project_id", project.id).eq("id", id).select("id").maybeSingle();
    if (r.error || !r.data) { toast.error(r.error?.message || "Caption not found."); return; }
    setSelected(null);
    await qc.invalidateQueries({ queryKey: ["captions", project.id] });
  }

  async function applyStyleToAll(style: CaptionStyle) {
    const { x: _x, ...rest } = style;
    const rows = captions.map((c: any) => ({ id: c.id, style: { ...normalizeCaptionStyle(c.style, c.position), ...rest, x: style.x }, position: positionBucket(style.y) }));
    qc.setQueryData(["captions", project.id], (all: any[] = []) => all.map((c) => ({ ...c, ...rows.find((r) => r.id === c.id) })));
    const results = await Promise.all(rows.map((r) => db.from("captions").update({ style: r.style, position: r.position }).eq("project_id", project.id).eq("id", r.id)));
    if (results.some((r: any) => r.error)) toast.error("Some captions could not be updated.");
    else toast.success(`Style applied to ${rows.length} captions.`);
  }

  async function saveSettings(patch: any): Promise<boolean> {
    const invalid = validateTimelineSettingsPatch(patch);
    if (invalid) { toast.error(invalid); return false; }
    const r = await db.from("timeline_settings").upsert({ project_id: project.id, ...patch, updated_at: new Date().toISOString() }).select("project_id").single();
    if (r.error) { toast.error(r.error.message); return false; }
    await qc.invalidateQueries({ queryKey: ["timeline_settings", project.id] });
    return true;
  }

  const selectedClip = clips.find((c: any) => c.id === selected);
  const selectedCaption = captions.find((c: any) => c.id === selected);
  const activeCaptions = captions.filter((c: any) => time >= Number(c.start_seconds) && time < Number(c.end_seconds));
  const currentVisual = clips
    .filter((c: any) => c.clip_type === "video" || c.clip_type === "image")
    .find((c: any) => time >= Number(c.start_seconds) && time < Number(c.start_seconds) + Number(c.duration_seconds));
  const currentScene = currentVisual ? scenes.find((s: any) => s.id === currentVisual.scene_id) : scenes[0];

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input,textarea,select,[contenteditable=true]")) return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "ArrowLeft") setTime((v) => Math.max(0, v - (e.shiftKey ? 1 : 0.1)));
      else if (e.key === "ArrowRight") setTime((v) => Math.min(duration, v + (e.shiftKey ? 1 : 0.1)));
      else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        if (selectedCaption) void deleteCaption(selected); else if (selectedClip) void deleteClip(selected);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); void stepHistory(e.shiftKey ? "redo" : "undo"); }
      else if (e.key === "c" && !e.metaKey && !e.ctrlKey) void addCaption();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const vertical = project.format === "short";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-3 py-2">
        <p className="mr-2 font-mono text-[11px] uppercase tracking-wider text-signal">Editor</p>
        <Button size="sm" variant="panel" onClick={buildTimeline} disabled={building}><Wand2 />{building ? "Building…" : "Build from scenes"}</Button>
        <Button size="sm" variant="panel" onClick={generateCaptions} disabled={captioning}><CaptionsIcon />{captioning ? "Generating…" : "Auto captions"}</Button>
        <Button size="sm" variant="signal" onClick={addCaption}><Plus /> Add caption</Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <Button size="icon" variant="ghost" onClick={() => stepHistory("undo")} disabled={historyBusy || !history.undo.length} aria-label="Undo"><Undo2 /></Button>
        <Button size="icon" variant="ghost" onClick={() => stepHistory("redo")} disabled={historyBusy || !history.redo.length} aria-label="Redo"><Redo2 /></Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={snap ? "panel" : "ghost"} onClick={() => setSnap((s) => !s)} aria-pressed={snap} title="Snap to grid"><Magnet /> Snap</Button>
          <ZoomOut className="size-4 text-muted-foreground" />
          <Slider className="w-28" min={0.25} max={4} step={0.25} value={[zoom]} onValueChange={([v]) => setZoom(v)} aria-label="Zoom" />
          <ZoomIn className="size-4 text-muted-foreground" />
        </div>
      </div>

      {/* Stage + inspector */}
      <div className="grid lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex flex-1 items-center justify-center bg-background p-4">
            <Stage
              vertical={vertical}
              scene={currentScene}
              visual={currentVisual}
              time={time}
              captions={activeCaptions}
              selectedId={selected}
              onSelect={setSelected}
              onMove={(id, x, y) => patchCaptionLive(id, { style: { x, y } })}
            />
          </div>
          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <Button size="icon" variant="ghost" onClick={() => { setPlaying(false); setTime(0); }} aria-label="Go to start"><SkipBack /></Button>
            <Button size="icon" variant="signal" onClick={() => { if (time >= duration) setTime(0); setPlaying((p) => !p); }} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</Button>
            <Button size="icon" variant="ghost" onClick={() => { setPlaying(false); setTime(duration); }} aria-label="Go to end"><SkipForward /></Button>
            <span className="font-mono text-sm tabular-nums">{formatTime(time)}</span>
            <span className="font-mono text-xs text-muted-foreground">/ {formatTime(duration)}</span>
            <Slider className="mx-2 flex-1" min={0} max={duration} step={0.01} value={[time]} onValueChange={([v]) => { setPlaying(false); setTime(v); }} aria-label="Seek" />
            <span className="hidden truncate text-xs text-muted-foreground sm:block">{currentScene?.title}</span>
          </div>
        </div>
        <aside className="max-h-[640px] overflow-y-auto p-4">
          {selectedCaption ? (
            <CaptionInspector
              key={selectedCaption.id}
              caption={selectedCaption}
              onChange={(p) => patchCaptionLive(selectedCaption.id, p)}
              onDelete={() => deleteCaption(selectedCaption.id)}
              onApplyAll={applyStyleToAll}
              onSeek={setTime}
            />
          ) : selectedClip ? (
            <ClipInspectorForm clip={selectedClip} onSave={updateClip} onDelete={deleteClip} />
          ) : (
            <div className="space-y-4">
              <TimelineSettingsForm settings={settings} onSave={saveSettings} />
              <Shortcuts />
            </div>
          )}
        </aside>
      </div>

      {/* Timeline */}
      <Timeline
        duration={duration}
        scale={scale}
        time={time}
        onTime={(t) => { setPlaying(false); setTime(Math.max(0, Math.min(duration, t))); }}
        tracks={tracks}
        clips={clips}
        captions={captions}
        selected={selected}
        onSelect={setSelected}
        snapTo={snapTo}
        onClipCommit={(id, start, dur) => updateClip(id, { start_seconds: start, duration_seconds: dur })}
        onCaptionCommit={(id, start, end) => patchCaptionLive(id, { start_seconds: start, end_seconds: end })}
      />
    </div>
  );
}

/* ------------------------------ Stage ------------------------------ */
function Stage({ vertical, scene, visual, time, captions, selectedId, onSelect, onMove }: {
  vertical: boolean; scene: any; visual: any; time: number; captions: any[]; selectedId: string | null;
  onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(360);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const k = h / 1080;

  function startDrag(e: React.PointerEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    onSelect(id);
    const box = ref.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = Math.min(100, Math.max(0, ((ev.clientX - box.left) / box.width) * 100));
      const y = Math.min(100, Math.max(0, ((ev.clientY - box.top) / box.height) * 100));
      onMove(id, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div ref={ref} className={`relative overflow-hidden rounded-lg border border-border bg-surface-raised shadow-2xl ${vertical ? "aspect-[9/16] h-[460px]" : "aspect-video w-full max-w-[860px]"}`}>
      {scene?.clip_path && visual?.clip_type === "video" ? <PreviewVideo path={scene.clip_path} time={Math.max(0, time - Number(visual.start_seconds))} />
        : scene?.image_path ? <PreviewImage path={scene.image_path} />
        : <div className="flex size-full items-center justify-center text-sm text-muted-foreground">Build the timeline to preview scenes.</div>}
      {/* safe-area guides */}
      <div className="pointer-events-none absolute inset-[5%] rounded border border-dashed border-foreground/10" />
      {captions.map((c) => {
        const s = normalizeCaptionStyle(c.style, c.position);
        const sel = c.id === selectedId;
        return (
          <div
            key={c.id}
            onPointerDown={(e) => startDrag(e, c.id)}
            className={`absolute cursor-move select-none rounded ${sel ? "outline outline-2 outline-offset-4 outline-signal" : "hover:outline hover:outline-1 hover:outline-offset-4 hover:outline-foreground/40"}`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-50%)", width: `${s.maxWidth}%`, textAlign: s.align }}
            title="Drag to position"
          >
            <span className={`inline ${s.animation === "pop" ? "animate-in zoom-in-75" : s.animation === "fade" ? "animate-in fade-in" : s.animation === "slide" ? "animate-in slide-in-from-bottom-4" : ""}`} style={captionTextCss(s, k) as React.CSSProperties}>{c.text}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------ Timeline ------------------------------ */
function Timeline({ duration, scale, time, onTime, tracks, clips, captions, selected, onSelect, snapTo, onClipCommit, onCaptionCommit }: {
  duration: number; scale: number; time: number; onTime: (t: number) => void; tracks: any[]; clips: any[]; captions: any[];
  selected: string | null; onSelect: (id: string | null) => void; snapTo: (v: number) => number;
  onClipCommit: (id: string, start: number, dur: number) => void; onCaptionCommit: (id: string, start: number, end: number) => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const width = Math.max(800, (duration + 4) * scale);
  const step = scale >= 120 ? 1 : scale >= 50 ? 2 : 5;

  function scrub(e: React.PointerEvent) {
    const box = laneRef.current!.getBoundingClientRect();
    const at = (x: number) => onTime((x - box.left) / scale);
    at(e.clientX);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const icon = (type: string) => type === "caption" ? <Type className="size-3.5" /> : type === "audio" || type === "music" || type === "voiceover" ? <Music className="size-3.5" /> : type === "image" ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />;

  return (
    <div className="border-t border-border bg-surface-raised">
      <div className="overflow-x-auto">
        <div style={{ width: width + HEAD_W }} className="relative">
          {/* ruler */}
          <div className="sticky top-0 z-20 flex h-8 border-b border-border bg-surface-raised">
            <div className="sticky left-0 z-30 shrink-0 border-r border-border bg-surface-raised px-3 py-2 font-mono text-[10px] text-muted-foreground" style={{ width: HEAD_W }}>{formatTime(time)}</div>
            <div ref={laneRef} className="relative flex-1 cursor-ew-resize" onPointerDown={scrub}>
              {Array.from({ length: Math.ceil((duration + 4) / step) + 1 }, (_, i) => i * step).map((s) => (
                <div key={s} className="absolute top-0 h-full border-l border-border/70" style={{ left: s * scale }}>
                  <span className="ml-1 font-mono text-[9px] text-muted-foreground">{formatShort(s)}</span>
                </div>
              ))}
            </div>
          </div>
          {/* caption track */}
          <Lane label="Captions" icon={icon("caption")} count={captions.length}>
            {captions.map((c) => (
              <Block key={c.id} id={c.id} kind="caption" start={Number(c.start_seconds)} dur={Number(c.end_seconds) - Number(c.start_seconds)}
                scale={scale} selected={selected === c.id} label={c.text} snapTo={snapTo}
                onSelect={() => { onSelect(c.id); }} onCommit={(s, d) => onCaptionCommit(c.id, s, s + d)} />
            ))}
          </Lane>
          {tracks.map((track) => (
            <Lane key={track.id} label={track.name} icon={icon(track.track_type)} status={track.locked ? <Lock className="size-3" /> : track.muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}>
              {clips.filter((c) => c.track_id === track.id).map((c) => (
                <Block key={c.id} id={c.id} kind={c.clip_type} start={Number(c.start_seconds)} dur={Number(c.duration_seconds)} locked={track.locked}
                  scale={scale} selected={selected === c.id} label={c.clip_type} snapTo={snapTo}
                  onSelect={() => onSelect(c.id)} onCommit={(s, d) => onClipCommit(c.id, s, d)} />
              ))}
            </Lane>
          ))}
          {tracks.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground" style={{ marginLeft: HEAD_W }}>No media tracks yet — click “Build from scenes”.</div>}
          {/* playhead */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-10" style={{ left: HEAD_W + time * scale }}>
            <div className="absolute -left-[5px] top-0 size-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-signal" />
            <div className="h-full w-px bg-signal" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Lane({ label, icon, status, count, children }: { label: string; icon: React.ReactNode; status?: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <div className="flex h-14 border-b border-border last:border-0">
      <div className="sticky left-0 z-[5] flex shrink-0 items-center gap-2 border-r border-border bg-surface px-3 text-xs" style={{ width: HEAD_W }}>
        <span className="text-signal">{icon}</span><span className="truncate font-medium">{label}</span>
        <span className="ml-auto text-muted-foreground">{status ?? (count !== undefined ? <span className="font-mono text-[10px]">{count}</span> : null)}</span>
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

const KIND_CLASS: Record<string, string> = {
  caption: "bg-signal/25 border-signal/60",
  video: "bg-primary/25 border-primary/60",
  image: "bg-accent/40 border-accent",
};

function Block({ kind, start, dur, scale, selected, label, locked, snapTo, onSelect, onCommit }: {
  id: string; kind: string; start: number; dur: number; scale: number; selected: boolean; label: string; locked?: boolean;
  snapTo: (v: number) => number; onSelect: () => void; onCommit: (start: number, dur: number) => void;
}) {
  const [live, setLive] = useState<{ s: number; d: number } | null>(null);
  const s = live?.s ?? start;
  const d = live?.d ?? dur;

  function drag(e: React.PointerEvent, mode: "move" | "left" | "right") {
    e.stopPropagation(); e.preventDefault();
    onSelect();
    if (locked) return;
    const x0 = e.clientX;
    let next = { s: start, d: dur };
    const move = (ev: PointerEvent) => {
      const dt = (ev.clientX - x0) / scale;
      if (mode === "move") next = { s: Math.max(0, snapTo(start + dt)), d: dur };
      else if (mode === "right") next = { s: start, d: Math.max(0.2, snapTo(start + dur + dt) - start) };
      else { const ns = Math.min(start + dur - 0.2, Math.max(0, snapTo(start + dt))); next = { s: ns, d: start + dur - ns }; }
      setLive(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      setLive(null);
      if (Math.abs(next.s - start) > 0.001 || Math.abs(next.d - dur) > 0.001) onCommit(Math.round(next.s * 100) / 100, Math.round(next.d * 100) / 100);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      onPointerDown={(e) => drag(e, "move")}
      className={`group absolute top-1.5 h-11 overflow-hidden rounded-md border text-xs ${KIND_CLASS[kind] ?? "bg-muted border-border"} ${selected ? "ring-2 ring-signal" : ""} ${locked ? "cursor-not-allowed opacity-70" : "cursor-grab active:cursor-grabbing"}`}
      style={{ left: s * scale, width: Math.max(8, d * scale) }}
      title={`${label} · ${formatTime(s)} → ${formatTime(s + d)}`}
    >
      {!locked && <div onPointerDown={(e) => drag(e, "left")} className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-foreground/0 group-hover:bg-foreground/30" />}
      <div className="px-2.5 py-1">
        <p className={`truncate ${kind === "caption" ? "font-medium" : "font-mono text-[9px] uppercase text-muted-foreground"}`}>{label}</p>
        <p className="truncate font-mono text-[9px] text-muted-foreground">{d.toFixed(1)}s</p>
      </div>
      {!locked && <div onPointerDown={(e) => drag(e, "right")} className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-foreground/0 group-hover:bg-foreground/30" />}
    </div>
  );
}

/* ------------------------------ Caption inspector ------------------------------ */
function CaptionInspector({ caption, onChange, onDelete, onApplyAll, onSeek }: {
  caption: any; onChange: (p: any) => void; onDelete: () => void; onApplyAll: (s: CaptionStyle) => void; onSeek: (t: number) => void;
}) {
  const s = normalizeCaptionStyle(caption.style, caption.position);
  const set = (p: Partial<CaptionStyle>) => onChange({ style: p });
  const [text, setText] = useState(caption.text);
  useEffect(() => setText(caption.text), [caption.text]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><p className="font-mono text-[10px] uppercase text-muted-foreground">Caption</p><h3 className="font-semibold">Text & style</h3></div>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete caption"><Trash2 /></Button>
      </div>

      <Field label="Text">
        <textarea value={text} maxLength={5000} rows={3} onChange={(e) => { setText(e.target.value); onChange({ text: e.target.value }); }}
          className="w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus:border-signal" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)"><Input type="number" step=".1" min={0} value={caption.start_seconds} onChange={(e) => onChange({ start_seconds: Number(e.target.value) })} onFocus={() => onSeek(Number(caption.start_seconds))} /></Field>
        <Field label="End (s)"><Input type="number" step=".1" min={0} value={caption.end_seconds} onChange={(e) => onChange({ end_seconds: Number(e.target.value) })} /></Field>
      </div>

      <Field label="Presets">
        <div className="grid grid-cols-3 gap-1.5">
          {CAPTION_PRESETS.map((p) => {
            const ps = normalizeCaptionStyle({ ...s, ...p.style });
            return (
              <button key={p.name} onClick={() => set(p.style)} className="flex h-12 items-center justify-center overflow-hidden rounded-md border border-border bg-background hover:border-signal">
                <span style={captionTextCss(ps, 0.28) as React.CSSProperties}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Font">
        <select value={s.font} onChange={(e) => set({ font: e.target.value })} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" style={{ fontFamily: s.font }}>
          {CAPTION_FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
      </Field>

      <Field label={`Size · ${s.size}px`}><Slider min={12} max={200} step={1} value={[s.size]} onValueChange={([v]) => set({ size: v })} /></Field>

      <div className="flex flex-wrap gap-1">
        <Toggle on={s.bold} onClick={() => set({ bold: !s.bold })} label="Bold"><Bold /></Toggle>
        <Toggle on={s.italic} onClick={() => set({ italic: !s.italic })} label="Italic"><Italic /></Toggle>
        <Toggle on={s.uppercase} onClick={() => set({ uppercase: !s.uppercase })} label="Uppercase"><CaseUpper /></Toggle>
        <div className="mx-1 w-px bg-border" />
        <Toggle on={s.align === "left"} onClick={() => set({ align: "left" })} label="Align left"><AlignLeft /></Toggle>
        <Toggle on={s.align === "center"} onClick={() => set({ align: "center" })} label="Align center"><AlignCenter /></Toggle>
        <Toggle on={s.align === "right"} onClick={() => set({ align: "right" })} label="Align right"><AlignRight /></Toggle>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Text colour" value={s.color} onChange={(v) => set({ color: v })} />
        <ColorField label="Outline" value={s.strokeColor} onChange={(v) => set({ strokeColor: v })} />
      </div>
      <Field label={`Outline width · ${s.strokeWidth}px`}><Slider min={0} max={20} step={1} value={[s.strokeWidth]} onValueChange={([v]) => set({ strokeWidth: v })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <ColorField label="Background" value={s.background} onChange={(v) => set({ background: v })} />
        <Field label={`Opacity · ${Math.round(s.backgroundOpacity * 100)}%`}><Slider className="mt-3" min={0} max={1} step={0.05} value={[s.backgroundOpacity]} onValueChange={([v]) => set({ backgroundOpacity: v })} /></Field>
      </div>

      <Field label="Position">
        <div className="grid grid-cols-3 gap-1.5">
          {[["Top", 12], ["Middle", 50], ["Bottom", 85]].map(([n, y]) => (
            <Button key={n} size="sm" variant={Math.abs(s.y - (y as number)) < 1 && s.x === 50 ? "signal" : "panel"} onClick={() => set({ x: 50, y: y as number })}>{n}</Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Or drag the caption on the preview.</p>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`X · ${Math.round(s.x)}%`}><Slider min={0} max={100} step={0.5} value={[s.x]} onValueChange={([v]) => set({ x: v })} /></Field>
        <Field label={`Y · ${Math.round(s.y)}%`}><Slider min={0} max={100} step={0.5} value={[s.y]} onValueChange={([v]) => set({ y: v })} /></Field>
      </div>
      <Field label={`Box width · ${s.maxWidth}%`}><Slider min={20} max={100} step={1} value={[s.maxWidth]} onValueChange={([v]) => set({ maxWidth: v })} /></Field>

      <Field label="Animation">
        <div className="grid grid-cols-4 gap-1.5">
          {(["none", "fade", "pop", "slide"] as const).map((a) => (
            <Button key={a} size="sm" variant={s.animation === a ? "signal" : "panel"} onClick={() => set({ animation: a })} className="capitalize">{a}</Button>
          ))}
        </div>
      </Field>

      <Button variant="panel" className="w-full" onClick={() => onApplyAll(s)}><Copy /> Apply style to all captions</Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return <Button size="icon" variant={on ? "signal" : "panel"} onClick={onClick} aria-label={label} aria-pressed={on} title={label}>{children}</Button>;
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-xs uppercase text-muted-foreground">{value}</span>
      </div>
    </Field>
  );
}
function Shortcuts() {
  const rows = [["Space", "Play / pause"], ["← →", "Nudge playhead (Shift = 1s)"], ["C", "Add caption at playhead"], ["Del", "Delete selected"], ["Ctrl Z", "Undo clip edit"]];
  return (
    <section className="rounded-2xl border border-border p-4">
      <p className="font-mono text-[10px] uppercase text-muted-foreground">Shortcuts</p>
      <ul className="mt-2 space-y-1.5 text-xs">{rows.map(([k, v]) => <li key={k} className="flex justify-between gap-2"><kbd className="rounded border border-border bg-surface-raised px-1.5 font-mono">{k}</kbd><span className="text-muted-foreground">{v}</span></li>)}</ul>
      <p className="mt-3 text-xs text-muted-foreground">Drag blocks to move them, drag their edges to trim. Click a caption to style it.</p>
    </section>
  );
}

function PreviewImage({ path }: { path: string }) {
  const { data } = useQuery({ queryKey: ["timeline_preview", path], queryFn: async () => (await supabase.storage.from("project-assets").createSignedUrl(path, 300)).data?.signedUrl || null });
  return data ? <img src={data} className="size-full object-cover" alt="Scene preview" draggable={false} /> : <div className="flex size-full items-center justify-center text-muted-foreground">Loading…</div>;
}
function PreviewVideo({ path, time }: { path: string; time: number }) {
  const { data } = useQuery({ queryKey: ["timeline_preview", path], queryFn: async () => (await supabase.storage.from("project-assets").createSignedUrl(path, 300)).data?.signedUrl || null });
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { const v = ref.current; if (v && Math.abs(v.currentTime - time) > 0.3) { try { v.currentTime = time; } catch { /* not ready */ } } }, [time]);
  return data ? <video ref={ref} src={data} muted className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted-foreground">Loading…</div>;
}
function formatTime(v: number) { const m = Math.floor(v / 60); const s = v - m * 60; return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`; }
function formatShort(v: number) { const m = Math.floor(v / 60); const s = Math.round(v % 60); return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`; }
