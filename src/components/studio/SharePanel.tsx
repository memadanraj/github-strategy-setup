import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { createProjectShareLink, listProjectShareLinks, revokeProjectShareLink } from "@/lib/share.functions";
import type { Tables } from "@/integrations/supabase/types";

export function SharePanel({ project }: { project: Tables<"projects"> }) {
  const qc = useQueryClient();
  const createLink = useServerFn(createProjectShareLink);
  const listLinks = useServerFn(listProjectShareLinks);
  const revokeLink = useServerFn(revokeProjectShareLink);
  const [selectedExportId, setSelectedExportId] = useState("");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState<"1" | "7" | "30" | "never">("7");
  const [busy, setBusy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  const { data: exports = [], isLoading: exportsLoading } = useQuery({
    queryKey: ["shareable_exports", project.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("exports")
        .select("id,filename,created_at,status")
        .eq("project_id", project.id).eq("status", "ready")
        .order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: links = [], isLoading: linksLoading, error: linksError } = useQuery({
    queryKey: ["project_share_links", project.id],
    queryFn: async () => {
      const result = await listLinks({ data: { projectId: project.id } });
      if (!result.ok) throw new Error(result.error);
      return result.links;
    },
  });

  async function create() {
    const exportId = selectedExportId || exports[0]?.id;
    if (!exportId) {
      toast.error("Render a video successfully before sharing it.");
      return;
    }
    if (password.length > 0 && password.length < 8) {
      toast.error("Share passwords must be at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      const result = await createLink({
        data: {
          projectId: project.id,
          exportId,
          password: password || undefined,
          expiresInDays: expiry === "never" ? null : Number(expiry) as 1 | 7 | 30,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCreatedUrl(`${window.location.origin}/share/${result.token}`);
      setPassword("");
      toast.success("Share link created. Copy it now; the token cannot be retrieved later.");
      await qc.invalidateQueries({ queryKey: ["project_share_links", project.id] });
    } catch {
      toast.error("Couldn't create the share link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!createdUrl) return;
    try {
      await navigator.clipboard.writeText(createdUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard access is unavailable. Select and copy the link manually.");
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this share link? Existing signed media URLs may work for up to 15 minutes.")) return;
    try {
      const result = await revokeLink({ data: { projectId: project.id, shareId: id } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Share link revoked");
      await qc.invalidateQueries({ queryKey: ["project_share_links", project.id] });
    } catch {
      toast.error("Couldn't revoke this share link.");
    }
  }

  function statusOf(link: { revokedAt: string | null; expiresAt: string | null }) {
    if (link.revokedAt) return "Revoked";
    if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return "Expired";
    return "Active";
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2"><Link2 className="size-5 text-signal" /><h2 className="font-semibold">Share a finished video</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">
          Links point to a completed export, not the editable project. Tokens are stored as hashes; the full link is shown only when you create it.
        </p>
        {exportsLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading completed exports…</p>
        ) : exports.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No completed exports yet. Render an MP4 first.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="share-export" className="text-sm font-medium">Video export</label>
              <select id="share-export" value={selectedExportId || exports[0]?.id || ""} onChange={(e) => setSelectedExportId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {exports.map((item) => <option key={item.id} value={item.id}>{item.filename} · {new Date(item.created_at).toLocaleDateString()}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="share-expiry" className="text-sm font-medium">Link expiration</label>
              <select id="share-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value as "1" | "7" | "30" | "never")} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="never">Never</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="share-password" className="text-sm font-medium">Password (optional, minimum 8 characters)</label>
              <Input id="share-password" type="password" autoComplete="new-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank for an unprotected link" />
            </div>
            <div className="sm:col-span-2"><Button variant="signal" onClick={create} disabled={busy || exports.length === 0}><Link2 /> {busy ? "Creating link…" : "Create share link"}</Button></div>
          </div>
        )}
        {createdUrl && (
          <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Copy your new link now</p>
            <div className="flex gap-2"><Input value={createdUrl} readOnly aria-label="New share URL" onFocus={(e) => e.currentTarget.select()} /><Button variant="panel" onClick={copyLink} aria-label="Copy share URL"><Copy /></Button></div>
            <p className="text-xs text-muted-foreground">For security, this URL cannot be recovered from the share list after you leave this screen.</p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-semibold">Existing share links</h2>
        {linksLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading share links…</p> :
          linksError ? <p className="mt-3 text-sm text-destructive">Couldn't load share links. Refresh and try again.</p> :
          links.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No share links have been created for this project.</p> :
          <div className="mt-3 divide-y divide-border">
            {links.map((link) => {
              const status = statusOf(link);
              const exportName = exports.find((row) => row.id === link.exportId)?.filename ?? `Export ${link.exportId.slice(0, 8)}`;
              return (
                <div key={link.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{exportName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Created {new Date(link.createdAt).toLocaleString()} · {link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleString()}` : "No expiry"} · {link.passwordProtected ? "Password protected" : "No password"}</p>
                  </div>
                  <span className={status === "Active" ? "text-xs text-signal" : "text-xs text-muted-foreground"}>{status}</span>
                  {status === "Active" && <Button variant="ghost" size="sm" onClick={() => revoke(link.id)}><ShieldOff /> Revoke</Button>}
                </div>
              );
            })}
          </div>
        }
      </section>
    </div>
  );
}
