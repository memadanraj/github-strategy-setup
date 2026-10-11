import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Pause, RotateCcw, Wand2, Captions as CaptionsIcon, Scissors, Lock, Unlock, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

const db:any = supabase;
const PX = 72;

type Project = Tables<"projects">;
type Clip = any;
type Track = any;
type Caption = any;

export function TimelinePanel({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [captioning, setCaptioning] = useState(false);
  const [zoom, setZoom] = useState(1);

  const { data: scenes = [] } = useQuery({
    queryKey: ["scenes", project.id],
    queryFn: async () => {
      const r = await db.from("scenes").select("*").eq("project_id", project.id).order("position");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: tracks = [] } = useQuery({
    queryKey: ["timeline_tracks", project.id],
    queryFn: async () => {
      const r = await db.from("timeline_tracks").select("*").eq("project_id", project.id).order("position");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: clips = [] } = useQuery({
    queryKey: ["timeline_clips", project.id],
    queryFn: async () => {
      const r = await db.from("timeline_clips").select("*").eq("project_id", project.id).order("start_seconds");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: captions = [] } = useQuery({
    queryKey: ["captions", project.id],
    queryFn: async () => {
      const r = await db.from("captions").select("*").eq("project_id", project.id).order("start_seconds");
      if (r.error) throw r.error;
      return r.data ?? [];
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["timeline_settings", project.id],
    queryFn: async () => {
      const r = await db.from("timeline_settings").select("*").eq("project_id", project.id).maybeSingle();
      if (r.error) throw r.error;
      return r.data;
    },
  });

  const duration = Math.max(
    scenes.reduce((n:number,s:any)=>n + Number(s.duration_seconds || 0), 0),
    clips.reduce((n:number,c:any)=>Math.max(n, Number(c.start_seconds)+Number(c.duration_seconds)), 0),
    1
  );
  const scale = PX * zoom;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setTime((t) => {
      const next = t + 0.05;
      if (next >= duration) { setPlaying(false); return 0; }
      return next;
    }), 50);
    return () => window.clearInterval(id);
  }, [playing, duration]);

  const activeCaption = useMemo(
    () => captions.find((c:any) => time >= Number(c.start_seconds) && time < Number(c.end_seconds)),
    [captions, time]
  );

  async function buildTimeline() {
    if (!scenes.length) { toast.error("Add scenes first."); return; }
    if (clips.length && !confirm("Rebuild the timeline? Existing timeline clips will be replaced.")) return;
    setBuilding(true);
    try {
      if (clips.length) {
        const d = await db.from("timeline_clips").delete().eq("project_id", project.id);
        if (d.error) throw d.error;
      }
      let videoTrack = tracks.find((t:any)=>t.track_type==="video");
      let audioTrack = tracks.find((t:any)=>t.track_type==="audio");
      let captionTrack = tracks.find((t:any)=>t.track_type==="caption");
      if (!videoTrack) videoTrack = await addTrack("Video", "video", 0);
      if (!audioTrack) audioTrack = await addTrack("Audio", "audio", 1);
      if (!captionTrack) captionTrack = await addTrack("Captions", "caption", 2);
      let cursor = 0;
      const visualRows:any[] = [];
      for (const scene of scenes) {
        const dur = Math.max(0.1, Number(scene.duration_seconds || 5));
        visualRows.push({
          project_id: project.id, track_id: videoTrack.id, scene_id: scene.id,
          clip_type: scene.clip_path ? "video" : "image", start_seconds: cursor,
          duration_seconds: dur, metadata: { source: scene.clip_path || scene.image_path || null }
        });
        cursor += dur;
      }
      const ins = await db.from("timeline_clips").insert(visualRows);
      if (ins.error) throw ins.error;
      await db.from("timeline_settings").upsert({ project_id: project.id, width: project.format === "short" ? 1080 : 1920, height: project.format === "short" ? 1920 : 1080, updated_at: new Date().toISOString() });
      await refresh();
      toast.success("Timeline built from scenes.");
    } catch (e:any) { toast.error(e.message || "Couldn't build timeline."); }
    finally { setBuilding(false); }
  }

  async function generateCaptions() {
    if (!scenes.length) { toast.error("Add scenes first."); return; }
    if (captions.length && !confirm("Replace existing captions?")) return;
    setCaptioning(true);
    try {
      await db.from("captions").delete().eq("project_id", project.id);
      let cursor = 0;
      const rows:any[] = [];
      for (const scene of scenes) {
        const text = String(scene.narration || "").trim();
        const dur = Math.max(0.1, Number(scene.duration_seconds || 5));
        if (text) {
          const words = text.split(/\s+/).filter(Boolean);
          const chunkSize = 5;
          const count = Math.ceil(words.length / chunkSize);
          for (let i=0;i<count;i++) {
            const chunk = words.slice(i*chunkSize,(i+1)*chunkSize).join(" ");
            const start = cursor + (dur * i / count);
            const end = cursor + (dur * (i+1) / count);
            rows.push({ project_id: project.id, scene_id: scene.id, text: chunk, start_seconds: start, end_seconds: end, position: "bottom" });
          }
        }
        cursor += dur;
      }
      if (rows.length) {
        const r = await db.from("captions").insert(rows);
        if (r.error) throw r.error;
      }
      await refresh();
      toast.success(`Created ${rows.length} caption cues.`);
    } catch (e:any) { toast.error(e.message || "Caption generation failed."); }
    finally { setCaptioning(false); }
  }

  async function addTrack(name:string,type:string,position:number) {
    const r = await db.from("timeline_tracks").insert({ project_id: project.id, name, track_type:type, position }).select("*").single();
    if (r.error) throw r.error;
    return r.data;
  }
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({queryKey:["timeline_tracks",project.id]}),
      qc.invalidateQueries({queryKey:["timeline_clips",project.id]}),
      qc.invalidateQueries({queryKey:["captions",project.id]}),
      qc.invalidateQueries({queryKey:["timeline_settings",project.id]}),
    ]);
  }

  async function updateClip(id:string, patch:any) {
    const r = await db.from("timeline_clips").update({...patch,updated_at:new Date().toISOString()}).eq("id",id);
    if (r.error) toast.error(r.error.message); else qc.invalidateQueries({queryKey:["timeline_clips",project.id]});
  }
  async function deleteClip(id:string) {
    const r = await db.from("timeline_clips").delete().eq("id",id);
    if (r.error) toast.error(r.error.message); else {setSelected(null);refresh();}
  }
  async function updateCaption(id:string, patch:any) {
    const r = await db.from("captions").update({...patch,updated_at:new Date().toISOString()}).eq("id",id);
    if (r.error) toast.error(r.error.message); else qc.invalidateQueries({queryKey:["captions",project.id]});
  }
  async function saveSettings(patch:any) {
    const r = await db.from("timeline_settings").upsert({project_id:project.id,...patch,updated_at:new Date().toISOString()});
    if (r.error) toast.error(r.error.message); else qc.invalidateQueries({queryKey:["timeline_settings",project.id]});
  }

  const selectedClip = clips.find((c:any)=>c.id===selected);
  const selectedCaption = captions.find((c:any)=>c.id===selected);
  const currentVisual = clips
    .filter((c:any)=>c.clip_type==="video"||c.clip_type==="image")
    .find((c:any)=>time>=Number(c.start_seconds)&&time<Number(c.start_seconds)+Number(c.duration_seconds));
  const currentScene = currentVisual ? scenes.find((s:any)=>s.id===currentVisual.scene_id) : null;

  return <div className="space-y-5">
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-mono text-xs text-signal">TIMELINE EDITOR</p><h2 className="text-2xl font-semibold">Cut, align & caption</h2><p className="text-sm text-muted-foreground">Scene-based editing foundation for the render pipeline.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="panel" onClick={buildTimeline} disabled={building}><Wand2/>{building?"Building…":"Build timeline"}</Button>
          <Button size="sm" variant="panel" onClick={generateCaptions} disabled={captioning}><CaptionsIcon/>{captioning?"Generating…":"Generate captions"}</Button>
          <Button size="icon" variant="panel" onClick={()=>setPlaying(p=>!p)} aria-label={playing?"Pause":"Play"}>{playing?<Pause/>:<Play/>}</Button>
          <Button size="icon" variant="panel" onClick={()=>{setPlaying(false);setTime(0)}}><RotateCcw/></Button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-xl border border-border bg-black">
          <div className={project.format==="short"?"mx-auto aspect-[9/16] max-h-[520px]":"aspect-video"}>
            {currentScene?.clip_path ? <PreviewVideo path={currentScene.clip_path} time={Math.max(0,time-Number(currentVisual.start_seconds))}/> :
             currentScene?.image_path ? <PreviewImage path={currentScene.image_path}/> :
             <div className="flex size-full items-center justify-center text-sm text-white/60">Build the timeline to preview scenes.</div>}
            {activeCaption && <div className={`pointer-events-none absolute left-0 right-0 px-8 text-center text-white ${activeCaption.position==="top"?"top-8":activeCaption.position==="center"?"top-1/2 -translate-y-1/2":"bottom-8"}`}><span className="inline-block rounded bg-black/70 px-3 py-2 text-lg font-semibold shadow-lg">{activeCaption.text}</span></div>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-3">
          <p className="font-mono text-[10px] uppercase text-muted-foreground">Preview time</p>
          <p className="mt-1 font-mono text-2xl">{formatTime(time)}</p>
          <div className="mt-3 h-2 rounded bg-border"><div className="h-2 rounded bg-signal" style={{width:`${Math.min(100,time/duration*100)}%`}}/></div>
          <p className="mt-4 text-xs text-muted-foreground">{currentScene?.title || "No active scene"}</p>
          {activeCaption && <div className="mt-4 rounded-lg border border-border p-3"><p className="font-mono text-[10px] uppercase text-muted-foreground">Caption</p><p className="mt-1 text-sm">{activeCaption.text}</p></div>}
          <div className="mt-4 flex items-center gap-2"><span className="text-xs text-muted-foreground">Zoom</span><Button size="sm" variant="ghost" onClick={()=>setZoom(z=>Math.max(.5,z-.25))}>−</Button><span className="w-12 text-center font-mono text-xs">{zoom.toFixed(2)}x</span><Button size="sm" variant="ghost" onClick={()=>setZoom(z=>Math.min(4,z+.25))}>+</Button></div>
        </div>
      </div>
    </div>

    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <div className="min-w-[900px]">
        <div className="flex border-b border-border bg-surface-raised">
          <div className="w-36 shrink-0 p-3 font-mono text-[10px] text-muted-foreground">TRACKS</div>
          <div className="relative h-10 flex-1">
            {Array.from({length:Math.ceil(duration)+1},(_,i)=><button key={i} onClick={()=>setTime(i)} className="absolute top-0 h-full border-l border-border/60 px-1 font-mono text-[9px] text-muted-foreground" style={{left:i*scale}}>{i}s</button>)}
            <div className="absolute bottom-0 top-0 w-px bg-signal" style={{left:time*scale}}/>
          </div>
        </div>
        {tracks.map((track:any)=><TrackRow key={track.id} track={track} clips={clips.filter((c:any)=>c.track_id===track.id)} scale={scale} time={time} selected={selected} onSelect={(id:string)=>setSelected(id)} onTime={setTime} onUpdate={updateClip} />)}
        {tracks.length===0&&<div className="p-8 text-center text-sm text-muted-foreground">No tracks yet. Click Build timeline.</div>}
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <CaptionEditor captions={captions} selected={selectedCaption} onSelect={setSelected} onUpdate={updateCaption} />
      <Inspector clip={selectedClip} caption={selectedCaption} settings={settings} onClipUpdate={updateClip} onClipDelete={deleteClip} onCaptionUpdate={updateCaption} onSettings={saveSettings} />
    </div>
  </div>;
}

function TrackRow({track,clips,scale,time,selected,onSelect,onTime,onUpdate}:{track:any;clips:any[];scale:number;time:number;selected:string|null;onSelect:(id:string)=>void;onTime:(t:number)=>void;onUpdate:(id:string,p:any)=>void}) {
  return <div className="flex min-h-[72px] border-b border-border last:border-0">
    <div className="flex w-36 shrink-0 items-center gap-2 border-r border-border px-3"><span className="text-xs font-medium">{track.name}</span><span className="ml-auto text-muted-foreground">{track.locked?<Lock className="size-3"/>:track.muted?<VolumeX className="size-3"/>:<Volume2 className="size-3"/>}</span></div>
    <div className="relative flex-1" style={{minWidth:Math.max(900,80*scale)}}>
      <div className="absolute inset-y-0 w-px bg-signal/70" style={{left:time*scale}}/>
      {clips.map((c:any)=><ClipBlock key={c.id} clip={c} scale={scale} selected={selected===c.id} onSelect={()=>onSelect(c.id)} onTime={onTime} onUpdate={onUpdate}/>)}
    </div>
  </div>
}
function ClipBlock({clip,scale,selected,onSelect,onTime,onUpdate}:{clip:any;scale:number;selected:boolean;onSelect:()=>void;onTime:(t:number)=>void;onUpdate:(id:string,p:any)=>void}) {
  const [start,setStart]=useState(Number(clip.start_seconds));
  const [dur,setDur]=useState(Number(clip.duration_seconds));
  useEffect(()=>{setStart(Number(clip.start_seconds));setDur(Number(clip.duration_seconds))},[clip.start_seconds,clip.duration_seconds]);
  return <button onClick={()=>{onSelect();onTime(start)}} className={`absolute top-2 h-14 overflow-hidden rounded-md border px-2 text-left text-xs transition ${selected?"border-signal ring-1 ring-signal":"border-border"} bg-surface-raised hover:bg-surface`} style={{left:start*scale,width:Math.max(36,dur*scale)}} title={`${clip.clip_type} · ${formatTime(start)} · ${formatTime(dur)}`}>
    <span className="font-mono text-[9px] uppercase text-signal">{clip.clip_type}</span><span className="ml-2 block truncate">{formatTime(start)} → {formatTime(start+dur)}</span>
    <span className="absolute bottom-0 left-0 right-0 h-1 bg-signal/30"/>
  </button>
}
function CaptionEditor({captions,selected,onSelect,onUpdate}:{captions:any[];selected:any;onSelect:(id:string)=>void;onUpdate:(id:string,p:any)=>void}) {
 return <section className="rounded-2xl border border-border bg-surface p-4"><div className="flex items-center justify-between"><div><p className="font-mono text-xs text-muted-foreground">CAPTIONS</p><h3 className="font-semibold">Caption cues</h3></div><span className="font-mono text-xs text-signal">{captions.length} CUES</span></div>
  <div className="mt-3 max-h-[420px] space-y-2 overflow-auto">{captions.length===0?<p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Generate captions from scene narration.</p>:captions.map((c:any)=><div key={c.id} onClick={()=>onSelect(c.id)} className={`cursor-pointer rounded-lg border p-3 ${selected?.id===c.id?"border-signal":"border-border"}`}><Input value={c.text} onChange={e=>onUpdate(c.id,{text:e.target.value})} className="h-8"/><div className="mt-2 flex gap-2"><Input type="number" step=".01" value={Number(c.start_seconds).toFixed(2)} onChange={e=>onUpdate(c.id,{start_seconds:Number(e.target.value)})}/><Input type="number" step=".01" value={Number(c.end_seconds).toFixed(2)} onChange={e=>onUpdate(c.id,{end_seconds:Math.max(Number(c.start_seconds)+.05,Number(e.target.value))})}/></div></div>)}</div>
 </section>
}
function Inspector({clip,caption,settings,onClipUpdate,onClipDelete,onCaptionUpdate,onSettings}:{clip:any;caption:any;settings:any;onClipUpdate:(id:string,p:any)=>void;onClipDelete:(id:string)=>void;onCaptionUpdate:(id:string,p:any)=>void;onSettings:(p:any)=>void}) {
 if (caption) return <section className="rounded-2xl border border-border bg-surface p-4"><p className="font-mono text-xs text-muted-foreground">CAPTION INSPECTOR</p><h3 className="mt-1 font-semibold">Cue styling</h3><div className="mt-4 grid gap-2"><select value={caption.position} onChange={e=>onCaptionUpdate(caption.id,{position:e.target.value})} className="h-9 rounded-md border border-border bg-surface px-2 text-sm"><option value="bottom">Bottom</option><option value="center">Center</option><option value="top">Top</option></select><p className="text-xs text-muted-foreground">Caption text and timing remain editable in the cue list.</p></div></section>;
 if (!clip) return <section className="rounded-2xl border border-border bg-surface p-4"><p className="font-mono text-xs text-muted-foreground">PROJECT SETTINGS</p><h3 className="mt-1 font-semibold">Timeline</h3><div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">FPS<select value={settings?.fps||30} onChange={e=>onSettings({fps:Number(e.target.value)})} className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"><option>24</option><option>25</option><option>30</option><option>50</option><option>60</option></select></label><label className="text-xs text-muted-foreground">Grid<input className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm" type="number" min=".1" max="10" step=".1" value={settings?.grid_seconds||1} onChange={e=>onSettings({grid_seconds:Number(e.target.value)})}/></label></div><p className="mt-3 text-xs text-muted-foreground">These settings are consumed by the future render/export phase.</p></section>;
 return <section className="rounded-2xl border border-border bg-surface p-4"><div className="flex items-center justify-between"><div><p className="font-mono text-xs text-muted-foreground">CLIP INSPECTOR</p><h3 className="font-semibold capitalize">{clip.clip_type}</h3></div><Button size="sm" variant="ghost" onClick={()=>onClipDelete(clip.id)}><Scissors/> Remove</Button></div><div className="mt-4 grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">Start<input className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2" type="number" step=".01" min="0" value={clip.start_seconds} onChange={e=>onClipUpdate(clip.id,{start_seconds:Math.max(0,Number(e.target.value))})}/></label><label className="text-xs text-muted-foreground">Duration<input className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2" type="number" step=".01" min=".1" value={clip.duration_seconds} onChange={e=>onClipUpdate(clip.id,{duration_seconds:Math.max(.1,Number(e.target.value))})}/></label><label className="text-xs text-muted-foreground">Source in<input className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2" type="number" step=".01" min="0" value={clip.source_start_seconds} onChange={e=>onClipUpdate(clip.id,{source_start_seconds:Math.max(0,Number(e.target.value))})}/></label><label className="text-xs text-muted-foreground">Volume<input className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2" type="number" step=".05" min="0" max="2" value={clip.volume} onChange={e=>onClipUpdate(clip.id,{volume:Math.max(0,Math.min(2,Number(e.target.value)))})}/></label></div><div className="mt-3 flex gap-2"><Button size="sm" variant="panel" onClick={()=>onClipUpdate(clip.id,{start_seconds:Math.max(0,Number(clip.start_seconds)-.1)})}>← 0.1s</Button><Button size="sm" variant="panel" onClick={()=>onClipUpdate(clip.id,{start_seconds:Number(clip.start_seconds)+.1})}>0.1s →</Button></div></section>
}
function PreviewImage({path}:{path:string}){const {data}=useQuery({queryKey:["timeline_preview",path],queryFn:async()=>{const r=await supabase.storage.from("project-assets").createSignedUrl(path,300);return r.data?.signedUrl||null}});return data?<img src={data} className="size-full object-contain" alt="Scene preview"/>:<div className="flex size-full items-center justify-center text-white/50">Loading…</div>}
function PreviewVideo({path,time}:{path:string;time:number}){const {data}=useQuery({queryKey:["timeline_preview",path],queryFn:async()=>{const r=await supabase.storage.from("project-assets").createSignedUrl(path,300);return r.data?.signedUrl||null}});return data?<video src={data} className="size-full object-contain" controls onLoadedMetadata={e=>{try { e.currentTarget.currentTime = time; } catch { /* Browser may reject seeking before metadata is ready. */ }}}/>:<div className="flex size-full items-center justify-center text-white/50">Loading…</div>}
function formatTime(v:number){const m=Math.floor(v/60);const s=v-m*60;return `${String(m).padStart(2,"0")}:${s.toFixed(1).padStart(4,"0")}`}
