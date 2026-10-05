import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2, UploadCloud, Unplug, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { disconnectYoutube, getYoutubePublications, getYoutubeStatus, publishYoutubeVideo, startYoutubeOAuth, syncYoutubeAnalytics } from "@/lib/youtube.functions";

export function YouTubePanel({ project }: { project: any }) {
  const start = useServerFn(startYoutubeOAuth), status = useServerFn(getYoutubeStatus), disconnect = useServerFn(disconnectYoutube);
  const publish = useServerFn(publishYoutubeVideo), sync = useServerFn(syncYoutubeAnalytics);
  const [busy, setBusy] = useState(false), [title, setTitle] = useState(project.title || "");
  const [description, setDescription] = useState(project.idea || ""), [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"private"|"unlisted"|"public">("private");
  const [exportId, setExportId] = useState(""), [thumbnailAssetId, setThumbnailAssetId] = useState("");

  const { data: connection, refetch: refetchStatus } = useQuery({ queryKey: ["youtube_status"], queryFn: () => status() });
  const { data: exports = [] } = useQuery({ queryKey: ["exports", project.id], queryFn: async () => {
    const r = await supabase.from("exports").select("*").eq("project_id", project.id).eq("status", "ready").order("created_at", { ascending: false });
    if (r.error) throw r.error; return r.data || [];
  }});
  const { data: images = [] } = useQuery({ queryKey: ["youtube_images", project.id], queryFn: async () => {
    const r = await supabase.from("assets").select("*").eq("project_id", project.id).eq("kind", "image").order("created_at", { ascending: false });
    if (r.error) throw r.error; return r.data || [];
  }});
  const { data: publications = [], refetch: refetchPublications } = useQuery({
    queryKey: ["youtube_publications", project.id],
    queryFn: async () => (await getYoutubePublications({ data: { projectId: project.id } })).rows,
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("youtube") === "connected") { toast.success("YouTube channel connected"); refetchStatus(); window.history.replaceState({}, "", window.location.pathname); }
    if (p.get("youtube") === "error") { toast.error(p.get("reason") || "YouTube connection failed"); window.history.replaceState({}, "", window.location.pathname); }
  }, [refetchStatus]);

  async function connect() {
    setBusy(true); try { const r = await start({ data: { projectId: project.id } }); if (r.ok) window.location.assign(r.url); else toast.error("Couldn't start YouTube connection."); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function publishVideo() {
    if (!exportId) return toast.error("Select a completed export.");
    setBusy(true);
    try {
      const r = await publish({ data: {
        projectId: project.id, exportId, title: title.trim() || project.title, description,
        tags: tags.split(",").map(x => x.trim()).filter(Boolean), privacyStatus: privacy,
        thumbnailAssetId: thumbnailAssetId || undefined,
      }});
      if (r.ok) { toast.success("Published to YouTube"); refetchPublications(); }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function refreshAnalytics(videoId: string) {
    const end = new Date(), startDate = new Date(Date.now() - 29 * 86400000); setBusy(true);
    try {
      const r = await sync({ data: { videoId, startDate: startDate.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }});
      if (r.ok) toast.success(`Synced ${r.count} analytics rows`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-mono text-xs text-signal">YOUTUBE</p><h2 className="text-2xl font-semibold">Publishing</h2><p className="text-sm text-muted-foreground">Connect your channel, publish completed renders, and sync performance data.</p></div>
        {connection?.connected ? <Button variant="panel" size="sm" onClick={async()=>{await disconnect();await refetchStatus();toast.success("YouTube disconnected");}}><Unplug/> Disconnect</Button> :
        <Button variant="signal" size="sm" disabled={busy} onClick={connect}>{busy?<Loader2 className="animate-spin"/>:<UploadCloud/>} Connect YouTube</Button>}
      </div>
      {connection?.connection && <div className="mt-4 rounded-xl border border-border p-3 text-sm"><span className="font-semibold">{connection.connection.channel_title || "YouTube channel"}</span><span className="ml-2 text-muted-foreground">{connection.connection.channel_id}</span></div>}
    </section>
    {connection?.connected && <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div><label className="mb-1 block text-xs text-muted-foreground">Completed export</label><select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={exportId} onChange={e=>setExportId(e.target.value)}><option value="">Choose a render…</option>{exports.map((e:any)=><option key={e.id} value={e.id}>{e.filename}</option>)}</select></div>
        <div><label className="mb-1 block text-xs text-muted-foreground">Privacy</label><select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={privacy} onChange={e=>setPrivacy(e.target.value as any)}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div>
        <div className="md:col-span-2"><label className="mb-1 block text-xs text-muted-foreground">Title</label><Input maxLength={100} value={title} onChange={e=>setTitle(e.target.value)} /></div>
        <div className="md:col-span-2"><label className="mb-1 block text-xs text-muted-foreground">Description</label><Textarea rows={5} maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-muted-foreground">Tags</label><Input placeholder="science, documentary, nature" value={tags} onChange={e=>setTags(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-muted-foreground">Custom thumbnail</label><select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={thumbnailAssetId} onChange={e=>setThumbnailAssetId(e.target.value)}><option value="">No custom thumbnail</option>{images.map((a:any)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      </div>
      <div className="mt-4 flex justify-end"><Button variant="signal" disabled={busy || !exportId} onClick={publishVideo}>{busy?<Loader2 className="animate-spin"/>:<UploadCloud/>} Publish video</Button></div>
    </section>}
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2"><RefreshCw className="size-4 text-signal"/><h3 className="font-semibold">Published videos</h3></div>
      <div className="mt-4 space-y-2">{publications.length===0?<p className="text-sm text-muted-foreground">No YouTube publications yet.</p>:publications.map((p:any)=><div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3"><div className="flex-1"><p className="text-sm font-medium">{p.title}</p><p className="text-xs text-muted-foreground capitalize">{p.status} · {p.privacy_status}</p></div>{p.youtube_url&&<a className="inline-flex items-center gap-1 text-xs text-signal hover:underline" href={p.youtube_url} target="_blank" rel="noreferrer">Open <ExternalLink className="size-3"/></a>}{p.youtube_video_id&&<Button size="sm" variant="panel" disabled={busy} onClick={()=>refreshAnalytics(p.youtube_video_id)}><RefreshCw/> Analytics</Button>}</div>)}</div>
    </section>
  </div>;
}
