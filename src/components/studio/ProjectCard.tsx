import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { statusLabel } from "@/lib/studio";
import type { Tables } from "@/integrations/supabase/types";

export function ProjectCard({ project }: { project: Tables<"projects"> }) {
  const queryClient = useQueryClient();

  async function remove() {
    if (!confirm(`Delete "${project.title}"?`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-surface">
      <div className={`relative bg-surface-raised bg-glow ${project.format === "short" ? "aspect-[16/10]" : "aspect-video"}`}>
        <div className="absolute inset-0 bg-grid opacity-30" />
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2 py-0.5 font-mono text-[10px]">
          {project.format === "short" ? "SHORT · 9:16" : "LONG · 16:9"}
        </span>
        <button
          onClick={remove}
          aria-label="Delete project"
          className="absolute right-3 top-3 rounded-md bg-background/80 p-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="p-4">
        <Link to="/projects/$projectId" params={{ projectId: project.id }} className="block truncate font-display font-bold hover:text-signal">{project.title}</Link>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{statusLabel[project.status] ?? project.status} · {project.mode}</span>
          <span>{new Date(project.updated_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
