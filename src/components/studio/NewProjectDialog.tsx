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
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setBusy(false); return; }
    const { data: created, error } = await supabase.from("projects").insert({
      user_id: u.user.id,
      title: title.trim() || "Untitled project",
      idea: idea.trim() || null,
      format,
      mode,
    }).select("id").single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Project created");
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    setOpen(false);
    setTitle(""); setIdea("");
    navigate({ to: "/projects/$projectId", params: { projectId: created.id } });
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
            <Choice value="long" current={format} onPick={setFormat} title="Long-form" desc="5–20 min, 16:9" />
            <Choice value="short" current={format} onPick={setFormat} title="Short" desc="Under 60s, 9:16" />
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
