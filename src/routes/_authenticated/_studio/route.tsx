import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Clapperboard, Settings, LogOut, Plus, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { profileQuery } from "@/lib/studio";
import { NewProjectDialog } from "@/components/studio/NewProjectDialog";

export const Route = createFileRoute("/_authenticated/_studio")({
  component: StudioLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: Clapperboard },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function StudioLayout() {
  const { user } = Route.useRouteContext();
  const { data: profile } = useQuery(profileQuery(user.id));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const name = profile?.display_name ?? user.email ?? "Creator";

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <Link to="/" className="flex items-center gap-2 px-2 font-display text-lg font-extrabold">
          <span className="grid size-7 place-items-center rounded-md bg-gradient-signal text-signal-foreground">▶</span>
          Reelforge
        </Link>
        <NewProjectDialog>
          <Button variant="signal" className="mt-6 w-full"><Plus /> New project</Button>
        </NewProjectDialog>
        <nav className="mt-6 space-y-1">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              activeProps={{ className: "bg-sidebar-accent text-foreground" }}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="font-mono text-[10px] text-muted-foreground">CREDITS</p>
            <p className="mt-1 flex items-center gap-2 font-display text-xl font-bold">
              <Coins className="size-4 text-signal" /> {profile?.credits_balance ?? "—"}
            </p>
            <p className="text-xs capitalize text-muted-foreground">{profile?.plan_slug ?? ""} plan</p>
          </div>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-6 backdrop-blur">
          <div className="flex gap-1 md:hidden">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md p-2 text-muted-foreground" activeProps={{ className: "bg-surface-raised text-foreground" }}>
                <n.icon className="size-4" />
              </Link>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{profile?.credits_balance ?? "—"} credits</span>
            <div className="grid size-8 place-items-center rounded-full bg-surface-raised font-display text-sm font-bold">
              {name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
