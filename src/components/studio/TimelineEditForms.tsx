import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Scissors } from "lucide-react";

export type TimelineCaptionFormValue = {
  id: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  position: string;
};

export type TimelineClipFormValue = {
  id: string;
  clip_type: string;
  start_seconds: number;
  duration_seconds: number;
  source_start_seconds: number;
  volume: number;
};

type CaptionDraft = { text: string; start: string; end: string };
type ClipDraft = { start: string; duration: string; sourceStart: string; volume: string };
type CaptionPatch = { text: string; start_seconds: number; end_seconds: number };
type ClipPatch = { start_seconds: number; duration_seconds: number; source_start_seconds: number; volume: number };

function numericInput(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toCaptionDraft(caption: TimelineCaptionFormValue): CaptionDraft {
  return { text: caption.text, start: String(caption.start_seconds), end: String(caption.end_seconds) };
}

function toClipDraft(clip: TimelineClipFormValue): ClipDraft {
  return {
    start: String(clip.start_seconds),
    duration: String(clip.duration_seconds),
    sourceStart: String(clip.source_start_seconds),
    volume: String(clip.volume),
  };
}

export function CaptionCueEditor({
  caption,
  selected,
  onSelect,
  onSave,
}: {
  caption: TimelineCaptionFormValue;
  selected: boolean;
  onSelect: (id: string) => void;
  onSave: (id: string, patch: CaptionPatch) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<CaptionDraft>(() => toCaptionDraft(caption));
  const [baseline, setBaseline] = useState<CaptionDraft>(() => toCaptionDraft(caption));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = toCaptionDraft(caption);
    setDraft(next);
    setBaseline(next);
  }, [caption.id, caption.text, caption.start_seconds, caption.end_seconds]);

  const dirty = draft.text !== baseline.text || draft.start !== baseline.start || draft.end !== baseline.end;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const patch: CaptionPatch = {
        text: draft.text,
        start_seconds: numericInput(draft.start),
        end_seconds: numericInput(draft.end),
      };
      const saved = await onSave(caption.id, patch);
      if (saved) {
        const next = { ...draft };
        setDraft(next);
        setBaseline(next);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={() => onSelect(caption.id)} className={`rounded-lg border p-3 ${selected ? "border-signal" : "border-border"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label htmlFor={`caption-text-${caption.id}`} className="text-xs font-medium text-muted-foreground">Caption text</label>
        {dirty && <span role="status" className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
      <Input id={`caption-text-${caption.id}`} value={draft.text} maxLength={5000}
        onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} className="h-8" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label htmlFor={`caption-start-${caption.id}`} className="text-xs text-muted-foreground">
          Start (seconds)
          <Input id={`caption-start-${caption.id}`} type="number" step=".01" min="0" max="86400"
            value={draft.start} onChange={(event) => setDraft((current) => ({ ...current, start: event.target.value }))} />
        </label>
        <label htmlFor={`caption-end-${caption.id}`} className="text-xs text-muted-foreground">
          End (seconds)
          <Input id={`caption-end-${caption.id}`} type="number" step=".01" min="0.01" max="86400"
            value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="panel" disabled={!dirty || saving}
          onClick={(event) => { event.stopPropagation(); void save(); }}>
          {saving ? "Saving…" : "Save caption"}
        </Button>
      </div>
    </div>
  );
}

export function ClipInspectorForm({
  clip,
  onSave,
  onDelete,
}: {
  clip: TimelineClipFormValue;
  onSave: (id: string, patch: ClipPatch) => Promise<boolean>;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<ClipDraft>(() => toClipDraft(clip));
  const [baseline, setBaseline] = useState<ClipDraft>(() => toClipDraft(clip));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = toClipDraft(clip);
    setDraft(next);
    setBaseline(next);
  }, [clip.id, clip.start_seconds, clip.duration_seconds, clip.source_start_seconds, clip.volume]);

  const dirty = draft.start !== baseline.start ||
    draft.duration !== baseline.duration ||
    draft.sourceStart !== baseline.sourceStart ||
    draft.volume !== baseline.volume;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const patch: ClipPatch = {
        start_seconds: numericInput(draft.start),
        duration_seconds: numericInput(draft.duration),
        source_start_seconds: numericInput(draft.sourceStart),
        volume: numericInput(draft.volume),
      };
      const saved = await onSave(clip.id, patch);
      if (saved) {
        const next = { ...draft };
        setDraft(next);
        setBaseline(next);
      }
    } finally {
      setSaving(false);
    }
  }

  function nudgeStart(delta: number) {
    const current = numericInput(draft.start);
    const safeCurrent = Number.isFinite(current) ? current : clip.start_seconds;
    setDraft((value) => ({ ...value, start: String(Math.max(0, safeCurrent + delta)) }));
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs text-muted-foreground">CLIP INSPECTOR</p>
          <h3 className="font-semibold capitalize">{clip.clip_type}</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onDelete(clip.id)}><Scissors /> Remove</Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label htmlFor="clip-start" className="text-xs text-muted-foreground">
          Start (seconds)
          <Input id="clip-start" type="number" step=".01" min="0" max="86400" value={draft.start}
            onChange={(event) => setDraft((value) => ({ ...value, start: event.target.value }))} />
        </label>
        <label htmlFor="clip-duration" className="text-xs text-muted-foreground">
          Duration (seconds)
          <Input id="clip-duration" type="number" step=".01" min=".1" max="86400" value={draft.duration}
            onChange={(event) => setDraft((value) => ({ ...value, duration: event.target.value }))} />
        </label>
        <label htmlFor="clip-source-start" className="text-xs text-muted-foreground">
          Source in (seconds)
          <Input id="clip-source-start" type="number" step=".01" min="0" max="86400" value={draft.sourceStart}
            onChange={(event) => setDraft((value) => ({ ...value, sourceStart: event.target.value }))} />
        </label>
        <label htmlFor="clip-volume" className="text-xs text-muted-foreground">
          Volume
          <Input id="clip-volume" type="number" step=".05" min="0" max="2" value={draft.volume}
            onChange={(event) => setDraft((value) => ({ ...value, volume: event.target.value }))} />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button size="sm" variant="panel" onClick={() => nudgeStart(-0.1)}>← 0.1s</Button>
          <Button size="sm" variant="panel" onClick={() => nudgeStart(0.1)}>0.1s →</Button>
        </div>
        <Button size="sm" variant="signal" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save clip changes"}
        </Button>
      </div>
      {dirty && <p role="status" className="mt-2 text-xs text-muted-foreground">Unsaved changes</p>}
    </section>
  );
}
 

export type TimelineSettingsFormValue = {
  fps: number;
  grid_seconds: number;
};

type SettingsDraft = { fps: string; grid: string };
type SettingsPatch = { fps: number; grid_seconds: number };

function toSettingsDraft(settings?: TimelineSettingsFormValue | null): SettingsDraft {
  return {
    fps: String(settings?.fps ?? 30),
    grid: String(settings?.grid_seconds ?? 1),
  };
}

export function TimelineSettingsForm({
  settings,
  onSave,
}: {
  settings?: TimelineSettingsFormValue | null;
  onSave: (patch: SettingsPatch) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<SettingsDraft>(() => toSettingsDraft(settings));
  const [baseline, setBaseline] = useState<SettingsDraft>(() => toSettingsDraft(settings));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = toSettingsDraft(settings);
    setDraft(next);
    setBaseline(next);
  }, [settings?.fps, settings?.grid_seconds]);

  const dirty = draft.fps !== baseline.fps || draft.grid !== baseline.grid;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const patch: SettingsPatch = {
        fps: numericInput(draft.fps),
        grid_seconds: numericInput(draft.grid),
      };
      const saved = await onSave(patch);
      if (saved) {
        const next = { ...draft };
        setDraft(next);
        setBaseline(next);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <p className="font-mono text-xs text-muted-foreground">PROJECT SETTINGS</p>
      <h3 className="mt-1 font-semibold">Timeline</h3>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label htmlFor="timeline-fps" className="text-xs text-muted-foreground">
          FPS
          <select
            id="timeline-fps"
            value={draft.fps}
            onChange={(event) => setDraft((value) => ({ ...value, fps: event.target.value }))}
            className="mt-1 h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="24">24</option>
            <option value="25">25</option>
            <option value="30">30</option>
            <option value="50">50</option>
            <option value="60">60</option>
          </select>
        </label>
        <label htmlFor="timeline-grid" className="text-xs text-muted-foreground">
          Grid (seconds)
          <Input
            id="timeline-grid"
            type="number"
            min=".1"
            max="10"
            step=".1"
            value={draft.grid}
            onChange={(event) => setDraft((value) => ({ ...value, grid: event.target.value }))}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {dirty && <p role="status" className="text-xs text-muted-foreground">Unsaved changes</p>}
        <Button
          className="ml-auto"
          size="sm"
          variant="signal"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        These settings are consumed by the render/export pipeline.
      </p>
    </section>
  );
}
