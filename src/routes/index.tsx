import { createFileRoute, Link } from "@tanstack/react-router";
import { NavAuth } from "@/components/landing/NavAuth";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Search, PenLine, Clapperboard, ImageIcon, Mic, Music, Captions, Frame, Scissors, Upload, BarChart3, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { StudioPreview } from "@/components/landing/StudioPreview";
import { plansQuery } from "@/lib/plans";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reelforge — Create YouTube Videos with AI" },
      { name: "description", content: "One studio from idea to upload: research, script, visuals, voice, edit, render and publish with AI." },
      { property: "og:title", content: "Reelforge — Create YouTube Videos with AI" },
      { property: "og:description", content: "Research. Write. Generate. Edit. Render. Publish. All in one creative studio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  component: Index,
});

const pipeline = [
  { icon: Search, label: "Research" }, { icon: PenLine, label: "Script" }, { icon: Clapperboard, label: "Scenes" },
  { icon: ImageIcon, label: "Visuals" }, { icon: Mic, label: "Voice" }, { icon: Music, label: "Music" },
  { icon: Captions, label: "Captions" }, { icon: Frame, label: "Thumbnail" }, { icon: Scissors, label: "Edit" },
  { icon: Upload, label: "Publish" }, { icon: BarChart3, label: "Analyze" },
];

const features = [
  { title: "Research", items: ["Niche & topic discovery", "Competitor analysis", "Content gaps"] },
  { title: "Writing", items: ["Titles & hooks", "Full scripts", "Descriptions"] },
  { title: "Visuals", items: ["AI images & video", "Stock footage", "Consistent characters"] },
  { title: "Audio", items: ["Natural voiceover", "Music beds", "Sound effects"] },
  { title: "Production", items: ["Timeline editor", "Auto captions", "Thumbnail studio"] },
  { title: "Publishing", items: ["YouTube upload", "Scheduling", "Analytics"] },
];

const faqs = [
  { q: "Do I need editing experience?", a: "No. Simple Mode turns one sentence into a full draft video. Advanced Mode exposes every scene, prompt and track when you want control." },
  { q: "Can I change what the AI makes?", a: "Every piece is editable — regenerate, replace, reorder, approve or reject any script line, scene, image or voice take." },
  { q: "How do credits work?", a: "Each generation costs credits based on the model and length. Credits are reserved before a job starts and refunded if it fails." },
  { q: "Does it publish to YouTube?", a: "Yes. Connect your channel and upload or schedule finished videos with titles, descriptions and thumbnails." },
];

function Index() {
  const { data: plans } = useSuspenseQuery(plansQuery);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-6">
          <a href="/" className="flex items-center gap-2 font-display text-lg font-extrabold">
            <span className="grid size-7 place-items-center rounded-md bg-gradient-signal text-signal-foreground">▶</span>
            Reelforge
          </a>
          <div className="hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#workflow" className="hover:text-foreground">Workflow</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </div>
          <NavAuth />
        </nav>
      </header>

      <section className="relative">
        <div className="absolute inset-0 bg-glow" />
        <div className="absolute inset-0 bg-grid opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-16 text-center md:pt-28">
          <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-signal animate-pulse-rec" /> ON AIR · AI VIDEO STUDIO
          </p>
          <h1 className="animate-rise mx-auto mt-6 max-w-4xl text-5xl font-extrabold leading-[0.95] md:text-8xl [animation-delay:80ms]">
            Create YouTube videos <span className="text-gradient-signal">with AI.</span>
          </h1>
          <p className="animate-rise mx-auto mt-6 max-w-xl text-lg text-muted-foreground [animation-delay:160ms]">
            Research. Write. Generate. Edit. Render. Publish. All in one creative studio.
          </p>
          <div className="animate-rise mt-9 flex flex-wrap justify-center gap-3 [animation-delay:240ms]">
            <Button variant="signal" size="xl" asChild><Link to="/auth">Start Creating</Link></Button>
            <Button variant="panel" size="xl" asChild><a href="#workflow">See How It Works</a></Button>
          </div>
          <div className="animate-rise mt-16 [animation-delay:320ms]">
            <StudioPreview />
          </div>
        </div>
      </section>

      <section id="workflow" className="border-y border-border bg-surface py-20">
        <div className="mx-auto max-w-7xl px-6">
          <p className="font-mono text-xs text-signal">THE PIPELINE</p>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold md:text-5xl">One idea in. A finished video out.</h2>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Not a pile of AI tools — a single production line where every step hands off to the next, and you can step in anywhere.
          </p>
        </div>
        <div className="mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <div className="flex w-max animate-marquee gap-3">
            {[...pipeline, ...pipeline].map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-background px-5 py-4">
                <s.icon className="size-5 text-signal" />
                <span className="font-display font-semibold">{s.label}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">→</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-16 grid max-w-7xl gap-4 px-6 md:grid-cols-2">
          {[
            { tag: "SIMPLE MODE", title: "Describe it. Review it. Render it.", body: "Type one sentence. Get a researched script, scenes, visuals, voice and music — ready to tweak." },
            { tag: "ADVANCED MODE", title: "Every scene, prompt and track.", body: "Pick models, lock characters, edit prompts, cut on the timeline and fine-tune captions." },
          ].map((m) => (
            <div key={m.tag} className="rounded-2xl border border-border bg-background p-8">
              <p className="font-mono text-xs text-muted-foreground">{m.tag}</p>
              <h3 className="mt-3 text-2xl font-bold">{m.title}</h3>
              <p className="mt-3 text-muted-foreground">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <p className="font-mono text-xs text-signal">EVERYTHING IN ONE PLACE</p>
        <h2 className="mt-3 max-w-2xl text-4xl font-bold md:text-5xl">A whole production crew, on call.</h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="bg-background p-8">
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
              <h3 className="mt-2 text-xl font-bold">{f.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                {f.items.map((it) => <li key={it}>— {it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-t border-border bg-surface py-24">
        <div className="mx-auto max-w-7xl px-6">
          <p className="font-mono text-xs text-signal">PRICING</p>
          <h2 className="mt-3 text-4xl font-bold md:text-5xl">Pay for what you produce.</h2>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {plans.map((p) => (
              <div
                key={p.id}
                className={`flex flex-col rounded-2xl border p-6 ${p.is_featured ? "border-signal bg-background shadow-signal" : "border-border bg-background"}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">{p.name}</h3>
                  {p.is_featured && <span className="rounded-full bg-signal px-2 py-0.5 font-mono text-[10px] text-signal-foreground">POPULAR</span>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{p.tagline}</p>
                <p className="mt-6 font-display text-4xl font-extrabold">
                  ${(p.price_monthly_cents / 100).toFixed(0)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {p.monthly_credits.toLocaleString()} credits · {p.max_resolution}
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {(p.features as string[]).map((f) => (
                    <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-signal" />{f}</li>
                  ))}
                </ul>
                <Button variant={p.is_featured ? "signal" : "panel"} className="mt-6 rounded-full" asChild><Link to="/auth">Choose {p.name}</Link></Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-4xl font-bold">Questions</h2>
        <Accordion type="single" collapsible className="mt-8">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="px-6 pb-24">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-border bg-surface px-8 py-20 text-center">
          <div className="absolute inset-0 bg-glow" />
          <h2 className="relative text-4xl font-extrabold md:text-6xl">Your next upload starts here.</h2>
          <Button variant="signal" size="xl" className="relative mt-8" asChild><Link to="/auth">Start Creating</Link></Button>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-muted-foreground">
          <span className="font-display font-bold text-foreground">Reelforge</span>
          <span>© {new Date().getFullYear()} Reelforge. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
