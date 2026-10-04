const tracks = [
  { label: "VIDEO", tone: "bg-track-3/70", clips: [18, 26, 14, 22, 20] },
  { label: "VOICE", tone: "bg-track-2/70", clips: [30, 12, 28, 30] },
  { label: "MUSIC", tone: "bg-track-1/60", clips: [100] },
  { label: "CAPS", tone: "bg-signal/70", clips: [10, 14, 9, 16, 12, 11, 13] },
];

const steps = ["Research", "Script", "Scenes", "Visuals", "Voice", "Render"];

export function StudioPreview() {
  return (
    <div className="relative mx-auto w-full max-w-5xl rounded-2xl bg-surface shadow-panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-signal animate-pulse-rec" />
        <span className="font-mono text-xs text-muted-foreground">
          project / why-octopuses-are-aliens.mp4
        </span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">00:08:42 · 1080p</span>
      </div>

      <div className="grid gap-px bg-border md:grid-cols-[180px_1fr_220px]">
        <aside className="hidden flex-col gap-1 bg-surface p-3 md:flex">
          {steps.map((s, i) => (
            <div
              key={s}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                i === 3 ? "bg-surface-raised text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="font-mono text-[10px] opacity-60">0{i + 1}</span>
              {s}
              {i < 3 && <span className="ml-auto text-track-2">✓</span>}
            </div>
          ))}
        </aside>

        <div className="bg-surface p-4">
          <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-raised bg-glow">
            <div className="absolute inset-0 bg-grid opacity-40" />
            <div className="absolute inset-x-6 bottom-6">
              <p className="font-display text-lg font-bold md:text-2xl">
                Octopuses have <span className="text-gradient-signal">three hearts</span>
              </p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">SCENE 04 · AI IMAGE · CINEMATIC</p>
            </div>
          </div>
        </div>

        <aside className="hidden flex-col gap-3 bg-surface p-4 text-xs md:flex">
          <p className="font-mono text-[10px] text-muted-foreground">SCENE 04 PROMPT</p>
          <p className="leading-relaxed text-foreground/80">
            Bioluminescent octopus drifting through a deep-sea trench, volumetric light, 35mm.
          </p>
          <div className="mt-auto space-y-2">
            {["Regenerate", "Variations", "Replace"].map((a) => (
              <div key={a} className="rounded-md border border-border px-3 py-1.5 text-muted-foreground">
                {a}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="relative space-y-1.5 border-t border-border p-4">
        <div className="pointer-events-none absolute inset-y-2 left-[84px] right-4">
          <div className="absolute top-0 bottom-0 w-px bg-signal animate-playhead" />
        </div>
        {tracks.map((t) => (
          <div key={t.label} className="flex items-center gap-3">
            <span className="w-14 font-mono text-[10px] text-muted-foreground">{t.label}</span>
            <div className="flex flex-1 gap-1">
              {t.clips.map((w, i) => (
                <div key={i} className={`h-5 rounded-sm ${t.tone}`} style={{ flexGrow: w }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
