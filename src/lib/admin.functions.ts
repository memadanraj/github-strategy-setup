import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Response("Forbidden", { status: 403 });
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any).rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { isAdmin: !!data };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const [profiles, plans, jobs, roles, users] = await Promise.all([
      admin.from("profiles").select("id,display_name,plan_slug,credits_balance,created_at").order("created_at", { ascending: false }).limit(200),
      admin.from("plans").select("slug,name"),
      admin.from("generation_jobs").select("id,user_id,task_slug,status,credits_reserved,error,created_at").order("created_at", { ascending: false }).limit(50),
      admin.from("user_roles").select("user_id,role").eq("role", "admin"),
      admin.auth.admin.listUsers({ perPage: 200 }),
    ]);
    const emails = new Map<string, string>((users.data?.users ?? []).map((u: any) => [u.id, u.email ?? ""]));
    const admins = new Set((roles.data ?? []).map((r: any) => r.user_id));
    return {
      users: (profiles.data ?? []).map((p: any) => ({ ...p, email: emails.get(p.id) ?? "", isAdmin: admins.has(p.id) })),
      plans: (plans.data ?? []) as { slug: string; name: string }[],
      jobs: (jobs.data ?? []).map((j: any) => ({ ...j, email: emails.get(j.user_id) ?? "" })),
    };
  });

export const adjustUserCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), amount: z.number().int().min(-1000000).max(1000000).refine((n) => n !== 0), reason: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const p = await admin.from("profiles").select("credits_balance").eq("id", data.userId).maybeSingle();
    if (!p.data) return { ok: false as const, error: "User not found." };
    const next = Math.max(0, p.data.credits_balance + data.amount);
    const u = await admin.from("profiles").update({ credits_balance: next }).eq("id", data.userId);
    if (u.error) return { ok: false as const, error: u.error.message };
    await admin.from("credit_transactions").insert({ user_id: data.userId, amount: next - p.data.credits_balance, kind: "admin", description: `Admin: ${data.reason}` });
    return { ok: true as const, balance: next };
  });

export const setUserPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), planSlug: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin: any = supabaseAdmin;
    const plan = await admin.from("plans").select("slug").eq("slug", data.planSlug).maybeSingle();
    if (!plan.data) return { ok: false as const, error: "Unknown plan." };
    const u = await admin.from("profiles").update({ plan_slug: data.planSlug }).eq("id", data.userId);
    if (u.error) return { ok: false as const, error: u.error.message };
    return { ok: true as const };
  });
