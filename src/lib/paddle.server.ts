import '@tanstack/react-start/server-only';

export function paddleEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}

export function paddleBaseUrl() {
  return process.env["PADDLE_ENVIRONMENT"] === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export async function paddleApi(path: string, method: "GET" | "POST" | "PATCH" = "GET", body?: unknown) {
  const r = await fetch(`${paddleBaseUrl()}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${paddleEnv("PADDLE_API_KEY")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.detail || `Paddle request failed (${r.status}).`);
  return data?.data ?? data;
}

export async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

export async function addCredits(db: any, userId: string, amount: number, kind: string, description: string) {
  const p = (await db.from("profiles").select("credits_balance").eq("id", userId).maybeSingle()).data;
  if (!p) throw new Error("Profile not found.");
  const next = Math.max(0, Number(p.credits_balance) + amount);
  await db.from("profiles").update({ credits_balance: next, updated_at: new Date().toISOString() }).eq("id", userId);
  await db.from("credit_transactions").insert({ user_id: userId, amount, kind, description });
}
