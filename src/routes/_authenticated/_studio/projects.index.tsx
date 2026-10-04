import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { projectsQuery } from "@/lib/studio";
import { ProjectCard } from "@/components/studio/ProjectCard";
import { NewProjectDialog } from "@/components/studio/NewProjectDialog";

export const Route = createFileRoute("/_authenticated/_studio/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Reelforge" },
      { name: "description", content: "All your Reelforge video projects." },
      { property: "og:title", content: "Projects — Reelforge" },
      { property: "og:description", content: "All your Reelforge video projects." },
    ],
  }),
  component: Projects,
});

const filters = [
  { value: "all", label: "All" },
  { value: "long", label: "Long-form" },
  { value: "short", label: "Shorts" },
];

function Projects() {
  const { data: projects = [], isLoading } = useQuery(projectsQuery);
  const [q, setQ] = useState("");
  const [format, setFormat] = useState("all");

  const shown = projects.filter(
    (p) => (format === "all" || p.format === format) && p.title.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-bold">Projects</h1>
        <NewProjectDialog><Button variant="signal"><Plus /> New project</Button></NewProjectDialog>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFormat(f.value)}
              className={`rounded-md px-3 py-1 text-sm ${format === f.value ? "bg-surface-raised text-foreground" : "text-muted-foreground"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <p className="mt-10 text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          {projects.length === 0 ? "No projects yet. Create one to get started." : "No projects match your search."}
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}
