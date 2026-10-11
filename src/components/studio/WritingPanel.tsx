import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles, Search, Type, FileText, Layers, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  researchTopic, generateHooksTitles, generateScript, scriptToScenes,
  type Research, type HookOption, type TitleOption,
} from "@/lib/writing.functions";
import type { Tables } from "@/integrations/supabase/types";

type Slug = "topic_research" | "hooks_titles" | "full_script" | "script_to_scenes";

export function WritingPanel({ project, onScenesChanged }: { project: Tables<"projects">; onScenesChanged: () => void }) {
  const qc = useQueryClient();
  const key = ["writing", project.id];
  const { data: writing } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("project_writing").select("*").eq("project_id", project.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: costs = {} } = useQuery({
    queryKey: ["ai_task_costs"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_tasks").select("slug,credit_cost");
      return Object.fromEntries((data ?? []).map((t) => [t.slug, t.credit_cost])) as Record<string, number>;
    },
  });

  const fns = {
    topic_research: useServerFn(researchTopic),
    hooks_titles: useServerFn(generateHooksTitles),
    full_script: useServerFn(generateScript),
    script_to_scenes: useServerFn(scriptToScenes),
  };
  const [busy, setBusy] = useState<Slug | null>(null);
  const [hook, setHook] = useState<string | null>(null);
  const [script, setScript] = useState("");
  useEffect(() => { setScript(writing?.script ?? ""); }, [writing?.script]);
  const [idea, setIdea] = useState(project.idea ?? "");
  useEffect(() => { setIdea(project.idea ?? ""); }, [project.idea]);

  async function saveIdea() {
    const { error } = await supabase.from("projects").update({ idea: idea.trim() }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Idea saved");
    qc.invalidateQueries({ queryKey: ["project", project.id] });
  }

  async function run(slug: Slug, success: string) {
    if (slug === "script_to_scenes" && !confirm("Replace all current scenes with a breakdown of this script?")) return;
    setBusy(slug);
    try {
      if (idea.trim() !== (project.idea ?? "")) await saveIdea();
      if (slug === "script_to_scenes" && script !== (writing?.script ?? "")) await saveScript(true);
      const res = slug === "full_script"
        ? await fns.full_script({ data: { projectId: project.id, hook: hook ?? undefined } })
        : await fns[slug]({ data: { projectId: project.id } });
      if (!res.ok) toast.error(res.error);
      else toast.success(typeof res.value === "number" ? `Created ${res.value} scenes` : success);
      if (slug === "script_to_scenes") onScenesChanged();
    } catch {
      toast.error("AI generation failed");
    } finally {
      setBusy(null);
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["credit_transactions"] });
    }
  }

  async function saveScript(silent = false) {
    const { error } = await supabase.from("project_writing")
      .upsert({ project_id: project.id, script, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    if (!silent) toast.success("Script saved");
    qc.invalidateQueries({ queryKey: key });
  }

  async function applyTitle(t: string) {
    const { error } = await supabase.from("projects").update({ title: t }).eq("id", project.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Title applied");
    qc.invalidateQueries({ queryKey: ["project", project.id] });
  }

  const research = writing?.research as Research | null;
  const hooks = (writing?.hooks as HookOption[] | null) ?? [];
  const titles = (writing?.titles as TitleOption[] | null) ?? [];
  const words = script.trim() ? script.trim().split(/\s+/).length : 0;

  const AiBtn = ({ slug, label, icon: Icon, success }: { slug: Slug; label: string; icon: typeof Sparkles; success: string }) => (
    <Button variant="panel" size="sm" disabled={busy !== null} onClick={() => run(slug, success)}>
      {busy === slug ? <Loader2 className="animate-spin" /> : <Icon />}
      {busy === slug ? "Working…" : `${label} · ${costs[slug] ?? "…"} cr`}
    </Button>
  );

  return (
    <div className="space-y-8">
      <Section n="00" title="Video idea" action={
        <Button variant="panel" size="sm" disabled={idea === (project.idea ?? "")} onClick={saveIdea}>Save idea</Button>
      }>
        <Textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3}
          placeholder="What is this video about? e.g. 'Why octopuses are smarter than we think'" />
      </Section>
      <Section n="01" title="Topic research" action={<AiBtn slug="topic_research" label={research ? "Redo research" : "Research topic"} icon={Search} success="Research ready" />}>
        {research ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card label="Angle"><p>{research.angle}</p></Card>
            <Card label="Audience"><p>{research.audience}</p></Card>
            <Card label="Key points"><List items={research.key_points} /></Card>
            <Card label="Facts to verify"><List items={research.facts} /></Card>
            <Card label="Viewer questions" className="md:col-span-2"><List items={research.questions} /></Card>
          </div>
        ) : <Empty>Research sharpens your angle and feeds the hooks and script.</Empty>}
      </Section>

      <Section n="02" title="Hooks & titles" action={<AiBtn slug="hooks_titles" label={hooks.length ? "New hooks & titles" : "Generate hooks & titles"} icon={Type} success="Hooks and titles ready" />}>
        {hooks.length || titles.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card label="Opening hooks — pick one for the script">
              <div className="space-y-2">
                {hooks.map((h) => (
                  <button key={h.hook} onClick={() => setHook(hook === h.hook ? null : h.hook)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${hook === h.hook ? "border-signal bg-signal/10" : "border-border hover:border-muted-foreground"}`}>
                    <span className="font-mono text-[10px] uppercase text-signal">{h.style}</span>
                    <p className="mt-1">{h.hook}</p>
                  </button>
                ))}
              </div>
            </Card>
            <Card label="Titles">
              <div className="space-y-2">
                {titles.map((t) => (
                  <div key={t.title} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{t.title}</p>
                      <Button size="sm" variant="ghost" onClick={() => applyTitle(t.title)}>Use</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t.why}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : <Empty>Get scroll-stopping openings and click-worthy titles.</Empty>}
      </Section>

      <Section n="03" title="Script" action={
        <div className="flex flex-wrap gap-2">
          <AiBtn slug="full_script" label={hook ? "Write script with hook" : "Write full script"} icon={FileText} success="Script written" />
          <AiBtn slug="script_to_scenes" label="Break into scenes" icon={Layers} success="Scenes created" />
        </div>
      }>
        <Textarea rows={18} value={script} onChange={(e) => setScript(e.target.value)}
          placeholder="Write your script here, or generate one with AI. Use ## headings for acts."
          className="font-mono text-sm leading-relaxed" />
        <div className="mt-2 flex items-center justify-between">
          <p className="font-mono text-xs text-muted-foreground">{words} WORDS · ~{Math.round(words / 2.5)}s SPOKEN</p>
          <div className="flex gap-2">
            <CopyBtn text={script} />
            {script !== (writing?.script ?? "") && <Button size="sm" variant="signal" onClick={() => saveScript()}>Save script</Button>}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ n, title, action, children }: { n: string; title: string; action: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold"><span className="mr-2 font-mono text-sm text-signal">{n}</span>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Card({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-surface p-4 text-sm ${className}`}>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
function List({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1 pl-4">{items.map((i) => <li key={i}>{i}</li>)}</ul>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</div>;
}
function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="ghost" disabled={!text} onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check /> : <Copy />} Copy
    </Button>
  );
}
