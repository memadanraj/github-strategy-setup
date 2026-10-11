import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LockKeyhole, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveProjectShare } from "@/lib/share.functions";
import type { ResolveProjectShareResult } from "@/lib/share-types";

export const Route = createFileRoute("/share/$token")({
  head: () => ({ meta: [{ title: "Shared video — Reelforge" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: SharedVideoPage,
});

function SharedVideoPage() {
  const { token } = Route.useParams();
  const resolveShare = useServerFn(resolveProjectShare);
  const [result, setResult] = useState<ResolveProjectShareResult | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    resolveShare({ data: { token } })
      .then((value) => { if (!cancelled) setResult(value); })
      .catch(() => {
        if (!cancelled) setResult({ ok: false, error: "This share link is invalid, expired, or has been revoked.", passwordRequired: false });
      });
    return () => { cancelled = true; };
  }, [resolveShare, token]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const value = await resolveShare({ data: { token, password } });
      setResult(value);
      if (value.ok) setPassword("");
    } catch {
      setResult({ ok: false, error: "Couldn't validate this share link. Please try again.", passwordRequired: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <a href="/" className="inline-flex items-center gap-2 font-display font-bold"><span className="grid size-7 place-items-center rounded-md bg-gradient-signal text-signal-foreground">▶</span> Reelforge</a>
        {!result ? (
          <div className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center text-muted-foreground">Preparing shared video…</div>
        ) : result.ok ? (
          <section className="mt-8 space-y-4">
            <div><p className="font-mono text-xs uppercase text-signal">Shared video</p><h1 className="mt-2 text-3xl font-bold">{result.title}</h1><p className="mt-1 text-sm text-muted-foreground">{result.filename} · {result.format.toUpperCase()}</p></div>
            <div className="overflow-hidden rounded-xl border border-border bg-black">
              <video controls playsInline preload="metadata" className="aspect-video w-full" aria-label={result.title}>
                <source src={result.videoUrl} type="video/mp4" />
                Your browser does not support HTML video playback.
              </video>
            </div>
            {result.expiresAt && <p className="text-xs text-muted-foreground">This share link expires {new Date(result.expiresAt).toLocaleString()}.</p>}
          </section>
        ) : result.passwordRequired ? (
          <section className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-surface p-6">
            <div className="flex items-center gap-2"><LockKeyhole className="size-5 text-signal" /><h1 className="text-xl font-semibold">Password-protected video</h1></div>
            <p className="mt-2 text-sm text-muted-foreground">Enter the password provided by the person who shared this video.</p>
            {result.error && <p role="alert" className="mt-3 text-sm text-destructive">{result.error}</p>}
            <form onSubmit={submitPassword} className="mt-4 space-y-3">
              <Input type="password" autoComplete="current-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Share password" required />
              <Button className="w-full" variant="signal" disabled={busy}>{busy ? "Checking…" : "Unlock video"}</Button>
            </form>
          </section>
        ) : (
          <section className="mt-12 rounded-2xl border border-border bg-surface p-8 text-center">
            <Video className="mx-auto size-10 text-muted-foreground" />
            <h1 className="mt-3 text-xl font-semibold">Video unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{result.error}</p>
          </section>
        )}
      </div>
    </main>
  );
}
