import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileQuery, projectsQuery, creditTxnsQuery } from "@/lib/studio";
import { ProjectCard } from "@/components/studio/ProjectCard";
import { NewProjectDialog } from "@/components/studio/NewProjectDialog";

export const Route = createFileRoute("/_authenticated/_studio/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Reelforge" },
      { name: "description", content: "Your Reelforge studio overview." },
      { property: "og:title", content: "Dashboard — Reelforge" },
      { property: "og:description", content: "Your Reelforge studio overview." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { data: profile } = useQuery(profileQuery(user.id));
  const { data: projects = [] } = useQuery(projectsQuery);
  const { data: txns = [] } = useQuery(creditTxnsQuery);

  const stats = [
    { label: "Projects", value: projects.length },
    { label: "In production", value: projects.filter((p) => !["draft", "published"].includes(p.status)).length },
    { label: "Published", value: projects.filter((p) => p.status === "published").length },
    { label: "Credits", value: profile?.credits_balance ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <p className="font-mono text-xs text-signal">STUDIO</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-bold">Welcome back, {profile?.display_name ?? "creator"}.</h1>
        <NewProjectDialog><Button variant="signal"><Plus /> New project</Button></NewProjectDialog>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-surface p-5">
            <p className="font-mono text-[10px] text-muted-foreground">{s.label.toUpperCase()}</p>
            <p className="mt-2 font-display text-3xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Recent projects</h2>
            <Link to="/projects" className="text-sm text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          {projects.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border p-10 text-center">
              <p className="font-display text-lg font-bold">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Start with an idea — the AI does the heavy lifting.</p>
              <NewProjectDialog><Button variant="signal" className="mt-5"><Plus /> Create your first video</Button></NewProjectDialog>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {projects.slice(0, 4).map((p) => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}
        </section>
        <section>
          <h2 className="text-xl font-bold">Credit activity</h2>
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
            {txns.length === 0 && <li className="p-4 text-sm text-muted-foreground">No activity yet.</li>}
            {txns.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-4 text-sm">
                <span>{t.description ?? t.kind}</span>
                <span className={`font-mono ${t.amount >= 0 ? "text-track-2" : "text-signal"}`}>
                  {t.amount >= 0 ? "+" : ""}{t.amount}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
