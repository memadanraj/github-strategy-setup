import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Frame, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateThumbnail } from "@/lib/thumbnail.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

const STYLES = [
  { id: "bold", label: "Bold" },
  { id: "minimal", label: "Minimal" },
  { id: "documentary", label: "Documentary" },
  { id: "explainer", label: "Explainer" },
] as const;

function Thumb({ asset, onDelete }: { asset: Tables<"assets">; onDelete: () => void }) {
  const { data: url } = useQuery({
    queryKey: ["signed", asset.storage_path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("project-assets").createSignedUrl(asset.storage_path!, 600);
      return data?.signedUrl ?? null;
    },
    enabled: !!asset.storage_path,
  });
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-video bg-muted">{url && <img src={url} alt={asset.name} className="size-full object-cover" />}</div>
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-xs text-muted-foreground">{asset.name}</span>
        <div className="flex gap-1">
          {url && <Button asChild size="icon" variant="ghost" aria-label="Download"><a href={url} download target="_blank" rel="noreferrer"><Download className="size-4" /></a></Button>}
          <Button size="icon" variant="ghost" aria-label="Delete" onClick={onDelete}><Trash2 className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}

export function ThumbnailPanel({ project }: { project: Tables<"projects"> }) {
  const qc = useQueryClient();
  const fn = useServerFn(generateThumbnail);
  const [headline, setHeadline] = useState("");
  const [concept, setConcept] = useState(project.idea ?? "");
  const [style, setStyle] = useState<(typeof STYLES)[number]["id"]>("bold");
  const [busy, setBusy] = useState(false);
  const key = ["thumbnails", project.id];
  const { data: thumbs = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("*").eq("project_id", project.id).eq("kind", "thumbnail").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const { data: cost } = useQuery({
    queryKey: ["ai_task_cost", "generate_thumbnail"],
    queryFn: async () => (await supabase.from("ai_tasks").select("credit_cost").eq("slug", "generate_thumbnail").maybeSingle()).data?.credit_cost ?? null,
  });

  async function run() {
    setBusy(true);
    try {
      const res = await fn({ data: { projectId: project.id, headline, concept, style } });
      if (!res.ok) toast.error(res.error);
      else toast.success("Thumbnail ready");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["assets", project.id] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  async function remove(a: Tables<"assets">) {
    if (a.storage_path) await supabase.storage.from("project-assets").remove([a.storage_path]);
    const { error } = await supabase.from("assets").delete().eq("id", a.id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div>
          <label className="text-sm font-medium">Headline text <span className="text-muted-foreground">(optional, keep it short)</span></label>
          <Input className="mt-1" maxLength={40} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. THE $1 WINE TRICK" />
        </div>
        <div>
          <label className="text-sm font-medium">What should the thumbnail show?</label>
          <Textarea className="mt-1" rows={3} maxLength={500} value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="A shocked sommelier holding a cheap bottle…" />
        </div>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <Button key={s.id} size="sm" variant={style === s.id ? "signal" : "outline"} onClick={() => setStyle(s.id)}>{s.label}</Button>
          ))}
        </div>
        <Button variant="signal" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Frame className="size-4" />}
          {busy ? "Creating thumbnail…" : `Generate thumbnail${cost != null ? ` · ${cost} credits` : ""}`}
        </Button>
      </div>
      {thumbs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No thumbnails yet. Generate a few and pick your favourite.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {thumbs.map((t) => <Thumb key={t.id} asset={t} onDelete={() => remove(t)} />)}
        </div>
      )}
    </div>
  );
}
