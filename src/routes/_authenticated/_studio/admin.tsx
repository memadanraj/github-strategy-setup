import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminOverview, adjustUserCredits, setUserPlan, checkIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/_studio/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Reelforge" },
      { name: "description", content: "Manage Reelforge users, plans, credits and AI jobs." },
      { property: "og:title", content: "Admin — Reelforge" },
      { property: "og:description", content: "Manage Reelforge users, plans, credits and AI jobs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const check = useServerFn(checkIsAdmin);
  const overview = useServerFn(getAdminOverview);
  const { data: role, isLoading: roleLoading } = useQuery({ queryKey: ["is_admin"], queryFn: () => check() });
  const { data, isLoading } = useQuery({ queryKey: ["admin_overview"], queryFn: () => overview(), enabled: !!role?.isAdmin });

  if (roleLoading) return <Loader2 className="mx-auto animate-spin" />;
  if (!role?.isAdmin)
    return <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-8 text-center"><ShieldCheck className="mx-auto size-8 text-muted-foreground" /><h1 className="mt-3 text-xl font-bold">Admins only</h1><p className="mt-1 text-sm text-muted-foreground">Your account doesn't have admin access.</p></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div><p className="font-mono text-xs text-signal">ADMIN</p><h1 className="text-4xl font-bold">Admin panel</h1></div>
      {isLoading || !data ? <Loader2 className="animate-spin" /> : <>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-bold">Users ({data.users.length})</h2>
          <div className="mt-4 space-y-2">{data.users.map((u: any) => <UserRow key={u.id} user={u} plans={data.plans} />)}</div>
        </section>
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-lg font-bold">Recent AI jobs</h2>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left font-mono text-xs text-muted-foreground"><tr><th className="py-2">When</th><th>User</th><th>Task</th><th>Status</th><th>Credits</th></tr></thead>
            <tbody>{data.jobs.map((j: any) => <tr key={j.id} className="border-t border-border"><td className="py-2 text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</td><td>{j.email}</td><td className="font-mono text-xs">{j.task_slug}</td><td className={j.status === "failed" ? "text-destructive" : ""} title={j.error ?? ""}>{j.status}</td><td>{j.credits_reserved}</td></tr>)}</tbody></table>
            {data.jobs.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No jobs yet.</p>}</div>
        </section>
      </>}
    </div>
  );
}

function UserRow({ user, plans }: { user: any; plans: { slug: string; name: string }[] }) {
  const qc = useQueryClient();
  const adjust = useServerFn(adjustUserCredits);
  const plan = useServerFn(setUserPlan);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin_overview"] });

  async function apply() {
    const n = parseInt(amount, 10);
    if (!n) { toast.error("Enter a non-zero amount"); return; }
    setBusy(true);
    const r = await adjust({ data: { userId: user.id, amount: n, reason: "Manual adjustment" } });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(`Balance now ${r.balance}`); setAmount(""); refresh();
  }
  async function changePlan(slug: string) {
    const r = await plan({ data: { userId: user.id, planSlug: slug } });
    if (!r.ok) { toast.error(r.error); return; }
    toast.success("Plan updated"); refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
      <div className="min-w-48 flex-1"><p className="text-sm font-medium">{user.display_name || "—"} {user.isAdmin && <span className="ml-1 font-mono text-[10px] text-signal">ADMIN</span>}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
      <select value={user.plan_slug ?? ""} onChange={(e) => changePlan(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
        {plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
      </select>
      <span className="w-20 text-right font-mono text-sm">{user.credits_balance}</span>
      <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="+/- credits" className="h-9 w-28" />
      <Button size="sm" variant="panel" disabled={busy} onClick={apply}>Apply</Button>
    </div>
  );
}
