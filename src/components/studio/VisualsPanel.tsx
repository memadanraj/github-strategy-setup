import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImageIcon, Film, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateSceneImage, generateSceneClip } from "@/lib/visuals.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tables } from "@/integrations/supabase/types";

const STYLES = [
  ["cinematic", "Cinematic"], ["photoreal", "Photoreal"], ["anime", "Anime"], ["flat", "Flat"],
  ["watercolor", "Watercolor"], ["retro", "Retro"], ["darkdoc", "Dark doc"],
] as const;

function useSignedUrl(path: string | null) {
  return useQuery({
    queryKey: ["signed", path],
    enabled: !!path,
    staleTime: 240_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("project-assets").createSignedUrl(path!, 300);
      return data?.signedUrl ?? null;
    },
  });
}

export function VisualsPanel({ project }: { project: Tables<"projects"> }) {
  const qc = useQueryClient();
  const { data: scenes = [] } = useQuery({
    queryKey: ["scenes", project.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("scenes").select("*").eq("project_id", project.id).order("position");
      if (error) throw error;
      return data;
    },
  });
  const { data: costs } = useQuery({
    queryKey: ["ai_task_cost", "visuals"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_tasks").select("slug,credit_cost").in("slug", ["generate_image", "generate_clip"]);
      return Object.fromEntries((data ?? []).map((t) => [t.slug, t.credit_cost])) as Record<string, number>;
    },
  });

  async function setStyle(style: string) {
    const { error } = await supabase.from("projects").update({ visual_style: style }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["project", project.id] });
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="mb-2 font-mono text-xs text-muted-foreground">VISUAL STYLE</p>
        <div className="flex flex-wrap gap-2">
          {STYLES.map(([v, l]) => (
            <Button key={v} size="sm" variant={project.visual_style === v ? "signal" : "panel"} onClick={() => setStyle(v)}>{l}</Button>
          ))}
        </div>
      </section>
      <Characters projectId={project.id} />
      <section>
        <p className="mb-2 font-mono text-xs text-muted-foreground">SCENE VISUALS</p>
        {scenes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">Add scenes first, then generate visuals for each.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {scenes.map((s, i) => <SceneVisual key={s.id} scene={s} index={i} project={project} costs={costs} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function SceneVisual({ scene, index, project, costs }: { scene: Tables<"scenes">; index: number; project: Tables<"projects">; costs?: Record<string, number> | undefined }) {
  const qc = useQueryClient();
  const imgFn = useServerFn(generateSceneImage);
  const clipFn = useServerFn(generateSceneClip);
  const [busy, setBusy] = useState<null | "image" | "clip">(null);
  const img = useSignedUrl(scene.image_path);
  const clip = useSignedUrl(scene.clip_path);

  async function run(kind: "image" | "clip") {
    setBusy(kind);
    try {
      const fn = kind === "image" ? imgFn : clipFn;
      const res = await fn({ data: { projectId: project.id, sceneId: scene.id } });
      if (!res.ok) toast.error(res.error);
      else toast.success(kind === "image" ? "Image ready" : "Clip ready");
    } catch {
      toast.error("Generation failed");
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["scenes", project.id] });
      qc.invalidateQueries({ queryKey: ["assets", project.id] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["credit_transactions"] });
    }
  }

  const aspect = project.format === "short" ? "aspect-[9/16] max-h-80 mx-auto" : "aspect-video";
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className={`${aspect} overflow-hidden rounded-lg bg-surface-raised`}>
        {clip.data ? <video src={clip.data} controls className="size-full object-cover" />
          : img.data ? <img src={img.data} alt={scene.title} className="size-full object-cover" />
          : <div className="flex size-full items-center justify-center text-xs text-muted-foreground">{busy ? "Generating…" : "No visual yet"}</div>}
      </div>
      <p className="mt-2 text-sm font-semibold"><span className="font-mono text-xs text-signal">{String(index + 1).padStart(2, "0")}</span> {scene.title}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">{scene.visual_prompt || "No visual description — add one in Scenes."}</p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="panel" disabled={!!busy || !scene.visual_prompt} onClick={() => run("image")}>
          {busy === "image" ? <Loader2 className="animate-spin" /> : <ImageIcon />} Image · {costs?.["generate_image"] ?? "…"} cr
        </Button>
        <Button size="sm" variant="panel" disabled={!!busy || !scene.visual_prompt} onClick={() => run("clip")}>
          {busy === "clip" ? <Loader2 className="animate-spin" /> : <Film />} Clip · {costs?.["generate_clip"] ?? "…"} cr
        </Button>
      </div>
    </div>
  );
}

function Characters({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const key = ["characters", projectId];
  const { data: chars = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("*").eq("project_id", projectId).order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  async function add() {
    if (!name.trim()) return;
    const { error } = await supabase.from("characters").insert({ project_id: projectId, name: name.trim(), description: desc.trim() || null });
    if (error) { toast.error(error.message); return; }
    setName(""); setDesc("");
    qc.invalidateQueries({ queryKey: key });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("characters").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <section>
      <p className="mb-2 font-mono text-xs text-muted-foreground">CHARACTERS · KEPT CONSISTENT ACROSS SCENES</p>
      {chars.length > 0 && (
        <div className="mb-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {chars.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2">
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="flex-1 truncate text-xs text-muted-foreground">{c.description}</span>
              <Button size="icon" variant="ghost" onClick={() => remove(c.id)} aria-label="Delete character"><Trash2 /></Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
        <Input placeholder="Look: age, clothing, features…" value={desc} onChange={(e) => setDesc(e.target.value)} className="min-w-60 flex-1" />
        <Button variant="signal" onClick={add}><Plus /> Add character</Button>
      </div>
    </section>
  );
}
