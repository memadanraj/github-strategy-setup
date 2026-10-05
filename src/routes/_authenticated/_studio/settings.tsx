import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { profileQuery } from "@/lib/studio";
import { BillingPanel } from "@/components/studio/BillingPanel";

export const Route = createFileRoute("/_authenticated/_studio/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Reelforge" },
      { name: "description", content: "Manage your Reelforge profile and account." },
      { property: "og:title", content: "Settings — Reelforge" },
      { property: "og:description", content: "Manage your Reelforge profile and account." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = Route.useRouteContext();
  const { data: profile } = useQuery(profileQuery(user.id));
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const isEmailUser = user.app_metadata?.provider === "email";

  useEffect(() => { if (profile?.display_name) setName(profile.display_name); }, [profile?.display_name]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile saved");
    queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: next, current_password: current } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Password updated");
    setCurrent(""); setNext("");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-4xl font-bold">Settings</h1>

      <form onSubmit={saveProfile} className="mt-8 space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-bold">Profile</h2>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input value={user.email ?? ""} disabled />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button variant="signal">Save profile</Button>
      </form>

      <BillingPanel currentPlan={profile?.plan_slug ?? "free"} credits={profile?.credits_balance ?? 0} />

      {isEmailUser && (
        <form onSubmit={changePassword} className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-bold">Password</h2>
          <div className="space-y-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <Button variant="panel">Change password</Button>
        </form>
      )}
    </div>
  );
}
