import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { ArrowLeft, ArrowDown, ArrowUp, Plus, Trash2, Upload, History, RotateCcw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { draftScenesWithAi } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { WritingPanel } from "@/components/studio/WritingPanel";
import { VisualsPanel } from "@/components/studio/VisualsPanel";
import { AudioPanel } from "@/components/studio/AudioPanel";
import { TimelinePanel } from "@/components/studio/TimelinePanel";
import { RenderPanel } from "@/components/studio/RenderPanel";
import { ThumbnailPanel } from "@/components/studio/ThumbnailPanel";
import { YouTubePanel } from "@/components/studio/YouTubePanel";
import { SharePanel } from "@/components/studio/SharePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { statusLabel } from "@/lib/studio";
import { createProjectVersion, restoreProjectVersion } from "@/lib/project-versions";
import type { Tables } from "@/integrations/supabase/types";
import { safeProjectAssetFileName, validateProjectAssetFile } from "@/lib/project-assets";

export const Route = createFileRoute("/_authenticated/_studio/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — Reelforge" },
      { name: "description", content: "Edit scenes, assets and versions of your video project." },
      { property: "og:title", content: "Project — Reelforge" },
      { property: "og:description", content: "Edit scenes, assets and versions of your video project." },
    ],
  }),
  component: ProjectPage,
});

const projectQ = (id: string) => queryOptions({
  queryKey: ["project", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },
});
const scenesQ = (id: string) => queryOptions({
  queryKey: ["scenes", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("scenes").select("*").eq("project_id", id).order("position");
    if (error) throw error;
    return data;
  },
});
const assetsQ = (id: string) => queryOptions({
  queryKey: ["assets", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("assets").select("*").eq("project_id", id).order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});
const versionsQ = (id: string) => queryOptions({
  queryKey: ["versions", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("project_versions").select("*").eq("project_id", id).order("version_number", { ascending: false });
    if (error) throw error;
    return data;
  },
});

type Tab = "writing" | "scenes" | "visuals" | "audio" | "timeline" | "thumbnail" | "render" | "youtube" | "assets" | "versions" | "share";

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data: project, isLoading } = useQuery(projectQ(projectId));
  const [tab, setTab] = useState<Tab>("writing");
  const qc = useQueryClient();

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!project) return <p className="text-muted-foreground">Project not found. <Link to="/projects" className="text-signal">Back to projects</Link></p>;

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Projects</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl font-bold">{project.title}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {project.format === "short" ? "SHORT · 9:16" : "LONG · 16:9"} · {statusLabel[project.status] ?? project.status} · {project.mode.toUpperCase()}
          </p>
        </div>
      </div>
      {project.idea && <p className="mt-3 max-w-2xl text-muted-foreground">{project.idea}</p>}
      <div className="mt-6 flex gap-1 border-b border-border">
        {(["writing", "scenes", "visuals", "audio", "timeline", "thumbnail", "render", "youtube", "assets", "versions", "share"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize ${tab === t ? "border-signal text-foreground" : "border-transparent text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "writing" && <WritingPanel project={project} onScenesChanged={() => setTab("scenes")} />}
        {tab === "scenes" && <Scenes projectId={projectId} />}
        {tab === "visuals" && <VisualsPanel project={project} />}
        {tab === "audio" && <AudioPanel project={project} />}
        {tab === "timeline" && <TimelinePanel project={project} />}
        {tab === "thumbnail" && <ThumbnailPanel project={project} />}
        {tab === "render" && <RenderPanel project={project} />}
        {tab === "youtube" && <YouTubePanel project={project} />}
        {tab === "assets" && <Assets project={project} />}
        {tab === "versions" && <Versions project={project} />}
        {tab === "share" && <SharePanel project={project} />}
      </div>
    </div>
  );
}

function Scenes({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: scenes = [] } = useQuery(scenesQ(projectId));
  const refresh = () => qc.invalidateQueries({ queryKey: ["scenes", projectId] });
  const total = scenes.reduce((s, x) => s + Number(x.duration_seconds), 0);
  const draftFn = useServerFn(draftScenesWithAi);
  const [drafting, setDrafting] = useState(false);
  const { data: cost } = useQuery({
    queryKey: ["ai_task_cost", "draft_scenes"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_tasks").select("credit_cost").eq("slug", "draft_scenes").maybeSingle();
      return data?.credit_cost ?? null;
    },
  });

  async function add() {
    const { error } = await supabase.from("scenes").insert({ project_id: projectId, position: scenes.length, title: `Scene ${scenes.length + 1}` });
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function move(i: number, dir: -1 | 1) {
    const a = scenes[i], b = scenes[i + dir];
    if (!a || !b) return;
    await Promise.all([
      supabase.from("scenes").update({ position: b.position }).eq("id", a.id),
      supabase.from("scenes").update({ position: a.position }).eq("id", b.id),
    ]);
    refresh();
  }
  async function remove(id: string) {
    const { error } = await supabase.from("scenes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  async function draftWithAi() {
    setDrafting(true);
    try {
      const res = await draftFn({ data: { projectId, sceneCount: 6 } });
      if (!res.ok) toast.error(res.error);
      else toast.success(`Drafted ${res.count} scenes`);
    } catch {
      toast.error("AI generation failed");
    } finally {
      setDrafting(false);
      refresh();
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["credit_transactions"] });
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-muted-foreground">{scenes.length} SCENES · {Math.round(total)}s TOTAL</p>
        <div className="flex gap-2">
          <Button variant="panel" size="sm" onClick={draftWithAi} disabled={drafting}>
            {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {drafting ? "Drafting…" : `Draft scenes with AI · ${cost ?? "…"} cr`}
          </Button>
          <Button variant="signal" size="sm" onClick={add}><Plus /> Add scene</Button>
        </div>
      </div>
      {scenes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No scenes yet. Add your first scene.</div>
      ) : (
        <div className="space-y-3">
          {scenes.map((s, i) => (
            <SceneRow key={s.id} scene={s} index={i} last={i === scenes.length - 1}
              onMove={(d) => move(i, d)} onDelete={() => remove(s.id)} onSaved={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function SceneRow({ scene, index, last, onMove, onDelete, onSaved }: {
  scene: Tables<"scenes">; index: number; last: boolean;
  onMove: (d: -1 | 1) => void; onDelete: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(scene.title);
  const [narration, setNarration] = useState(scene.narration ?? "");
  const [visual, setVisual] = useState(scene.visual_prompt ?? "");
  const [duration, setDuration] = useState(String(scene.duration_seconds));
  const dirty = title !== scene.title || narration !== (scene.narration ?? "") || visual !== (scene.visual_prompt ?? "") || duration !== String(scene.duration_seconds);

  async function save() {
    const { error } = await supabase.from("scenes").update({
      title: title.trim() || "Untitled scene", narration: narration || null, visual_prompt: visual || null,
      duration_seconds: Math.max(1, Number(duration) || 5), updated_at: new Date().toISOString(),
    }).eq("id", scene.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Scene saved");
    onSaved();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-signal">{String(index + 1).padStart(2, "0")}</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 flex-1 font-semibold" />
        <Input type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className="h-8 w-20" aria-label="Duration seconds" />
        <span className="text-xs text-muted-foreground">s</span>
        <Button size="icon" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUp /></Button>
        <Button size="icon" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label="Move down"><ArrowDown /></Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete scene"><Trash2 /></Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Textarea rows={3} placeholder="Narration / voiceover" value={narration} onChange={(e) => setNarration(e.target.value)} />
        <Textarea rows={3} placeholder="Visual description" value={visual} onChange={(e) => setVisual(e.target.value)} />
      </div>
      {dirty && <div className="mt-3 flex justify-end"><Button size="sm" variant="signal" onClick={save}>Save scene</Button></div>}
    </div>
  );
}

function kindOf(type: string) {
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  return "other";
}

function Assets({ project }: { project: Tables<"projects"> }) {
  const qc = useQueryClient();
  const { data: assets = [] } = useQuery(assetsQ(project.id));
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["assets", project.id] });

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validateProjectAssetFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const safeName = safeProjectAssetFileName(file.name);
      const path = `${project.user_id}/${project.id}/${crypto.randomUUID()}-${safeName}`;
      const uploadResult = await supabase.storage
        .from("project-assets")
        .upload(path, file, { contentType: file.type });

      if (uploadResult.error) {
        toast.error(uploadResult.error.message);
        return;
      }
      uploadedPath = path;

      const { error } = await supabase.from("assets").insert({
        project_id: project.id,
        kind: kindOf(file.type),
        name: file.name.slice(0, 255),
        storage_path: path,
        meta: { size: file.size, type: file.type },
      });

      if (error) {
        const cleanup = await supabase.storage.from("project-assets").remove([path]);
        if (cleanup.error) {
          toast.error(`Couldn't save the asset record, and its uploaded file could not be cleaned up. Contact support with project ID ${project.id}.`);
          return;
        }
        uploadedPath = null;
        toast.error(error.message);
        return;
      }

      uploadedPath = null;
      toast.success("Uploaded");
      await refresh();
    } catch {
      if (uploadedPath) {
        const cleanup = await supabase.storage.from("project-assets").remove([uploadedPath]);
        if (cleanup.error) {
          toast.error("Upload failed, and temporary-file cleanup also failed. Please contact support.");
          return;
        }
      }
      toast.error("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function open(a: Tables<"assets">) {
    if (!a.storage_path) return;
    const { data, error } = await supabase.storage.from("project-assets").createSignedUrl(a.storage_path, 300);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function remove(a: Tables<"assets">) {
    try {
      if (a.storage_path) {
        const storageResult = await supabase.storage.from("project-assets").remove([a.storage_path]);
        if (storageResult.error) {
          toast.error(`Couldn't remove the file: ${storageResult.error.message}`);
          return;
        }
      }

      const { error } = await supabase.from("assets").delete().eq("id", a.id);
      if (error) {
        toast.error("The file was removed, but its asset record could not be deleted. Retry deleting this asset.");
        return;
      }
      await refresh();
    } catch {
      toast.error("Couldn't delete this asset. Please check your connection and try again.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">{assets.length} ASSETS</p>
        <Button asChild variant="signal" size="sm" disabled={busy}>
          <label className="cursor-pointer"><Upload /> {busy ? "Uploading…" : "Upload file"}
            <input type="file" className="hidden" accept="image/*,video/*,audio/*" onChange={upload} disabled={busy} />
          </label>
        </Button>
      </div>
      {assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No assets yet. Upload images, clips or audio (max 50 MB).</div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {assets.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-16 font-mono text-[10px] uppercase text-signal">{a.kind}</span>
              <button onClick={() => open(a)} className="flex-1 truncate text-left text-sm hover:underline">{a.name}</button>
              <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
              <Button size="icon" variant="ghost" onClick={() => remove(a)} aria-label="Delete asset"><Trash2 /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Versions({ project }: { project: Tables<"projects"> }) {
  const qc = useQueryClient();
  const { data: versions = [] } = useQuery(versionsQ(project.id));
  const [label, setLabel] = useState("");

  async function snapshot() {
    try {
      const result = await createProjectVersion(
        (args) => supabase.rpc("create_project_version", args),
        project.id,
        label,
      );
      setLabel("");
      toast.success(`Saved version ${result.versionNumber}`);
      await qc.invalidateQueries({ queryKey: ["versions", project.id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save project version.");
    }
  }

  async function restore(v: Tables<"project_versions">) {
    if (!confirm(`Restore version ${v.version_number}? Project details and scenes in this version will be restored.`)) return;
    try {
      await restoreProjectVersion(
        (args) => supabase.rpc("restore_project_version", args),
        project.id,
        v.id,
      );
      toast.success(`Restored version ${v.version_number}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["project", project.id] }),
        qc.invalidateQueries({ queryKey: ["scenes", project.id] }),
        qc.invalidateQueries({ queryKey: ["versions", project.id] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't restore project version. Your current data was preserved.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Input placeholder="Version label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="max-w-xs" />
        <Button variant="signal" onClick={snapshot}><History /> Save version</Button>
      </div>
      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No saved versions. Save one to snapshot your scenes.</div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center gap-3 px-4 py-3">
              <span className="font-mono text-xs text-signal">v{v.version_number}</span>
              <span className="flex-1 text-sm">{v.label ?? "Untitled version"} <span className="text-muted-foreground">· {(v.snapshot as { scenes?: unknown[] }).scenes?.length ?? 0} scenes</span></span>
              <span className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
              <Button size="sm" variant="ghost" onClick={() => restore(v)}><RotateCcw /> Restore</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
