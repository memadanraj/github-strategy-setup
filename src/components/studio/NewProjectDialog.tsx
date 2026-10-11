import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildProductionPlan } from "@/lib/production-plan";
import type { Json } from "@/integrations/supabase/types";

function Choice({ value, current, onPick, title, desc }: { value: string; current: string; onPick: (v: string) => void; title: string; desc: string }) {
  const on = value === current;
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`rounded-lg border p-3 text-left ${on ? "border-signal bg-surface-raised" : "border-border hover:bg-surface-raised/60"}`}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}

export function NewProjectDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState("");
  const [format, setFormat] = useState("long");
  const [mode, setMode] = useState("simple");
  const [videoType, setVideoType] = useState("explainer");
  const [targetAudience, setTargetAudience] = useState("");
  const [tone, setTone] = useState("engaging");
  const [language, setLanguage] = useState("en");
  const [durationSeconds, setDurationSeconds] = useState(480);
  const [visualStyle, setVisualStyle] = useState("cinematic");
  const [platform, setPlatform] = useState("youtube");
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const productionPlan = buildProductionPlan({
    format, videoType, targetAudience, tone, language, durationSeconds,
    visualStyle, platform, captionsEnabled,
  });
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);

    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) {
        toast.error("Your session has expired. Sign in again to create a project.");
        return;
      }

      const { data: created, error } = await supabase
        .from("projects")
        .insert({
          user_id: userData.user.id,
          title: title.trim() || "Untitled project",
          idea: idea.trim() || null,
          format,
          mode,
          visual_style: visualStyle,
          settings: productionPlan as unknown as Json,
        })
        .select("id")
        .single();

      if (error || !created?.id) {
        toast.error(error?.message ?? "The project could not be created. Please try again.");
        return;
      }

      toast.success("Project created");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setTitle("");
      setIdea("");
      navigate({ to: "/projects/$projectId", params: { projectId: created.id } });
    } catch {
      toast.error("Could not create the project. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-surface">
        <DialogHeader><DialogTitle className="font-display text-2xl">New project</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Working title</Label>
            <Input id="title" placeholder="Why octopuses might be aliens" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="idea">What's the video about?</Label>
            <Textarea id="idea" rows={3} placeholder="Describe the idea, audience and tone…" value={idea} onChange={(e) => setIdea(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Choice value="long" current={format} onPick={(value) => { setFormat(value); setDurationSeconds(480); }} title="Long-form" desc="5–20 min, 16:9" />
            <Choice value="short" current={format} onPick={(value) => { setFormat(value); setDurationSeconds(45); }} title="Short" desc="15–60s, 9:16" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="video-type">Video type</Label>
              <select id="video-type" value={videoType} onChange={(e) => setVideoType(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="explainer">Explainer</option><option value="documentary">Documentary</option><option value="storytelling">Storytelling</option><option value="tutorial">Tutorial</option><option value="product-review">Product review</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="target-duration">Target duration (seconds)</Label>
              <Input id="target-duration" type="number" min={format === "short" ? 15 : 300} max={format === "short" ? 60 : 1200} step={15} value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5"><Label htmlFor="target-audience">Target audience</Label>
              <Input id="target-audience" maxLength={160} placeholder="e.g. beginner creators" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} />
            </div>
            <div className="space-y-1.5"><Label htmlFor="video-tone">Tone</Label>
              <select id="video-tone" value={tone} onChange={(e) => setTone(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="engaging">Engaging</option><option value="cinematic">Cinematic</option><option value="educational">Educational</option><option value="humorous">Humorous</option><option value="calm">Calm</option><option value="dramatic">Dramatic</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="visual-style">Visual style</Label>
              <select id="visual-style" value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="cinematic">Cinematic</option><option value="realistic">Realistic</option><option value="illustrated">Illustrated</option><option value="anime">Anime</option><option value="minimal">Minimal</option><option value="documentary">Documentary</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="video-language">Language</Label>
              <select id="video-language" value={language} onChange={(e) => setLanguage(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="en">English</option><option value="ne">Nepali</option><option value="hi">Hindi</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="pt">Portuguese</option><option value="ja">Japanese</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="target-platform">Target platform</Label>
              <select id="target-platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="other">Other</option>
              </select>
            </div>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={captionsEnabled} onChange={(e) => setCaptionsEnabled(e.target.checked)} /> Include captions in the plan</label>
          </div>
          <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm">
            <p className="font-semibold">Production plan preview</p>
            <p className="mt-1 text-muted-foreground">{Math.round(productionPlan.brief.targetDurationSeconds / 60 * 10) / 10} min · {productionPlan.brief.aspectRatio} · {productionPlan.plan.recommendedSceneCount} suggested scenes</p>
            <ol className="mt-2 grid gap-1 sm:grid-cols-2">{productionPlan.plan.stages.map((stage, index) => <li key={stage} className="text-xs text-muted-foreground">{index + 1}. {stage}</li>)}</ol>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Choice value="simple" current={mode} onPick={setMode} title="Simple mode" desc="AI drafts everything" />
            <Choice value="advanced" current={mode} onPick={setMode} title="Advanced mode" desc="Control every step" />
          </div>
          <Button variant="signal" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create project"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
