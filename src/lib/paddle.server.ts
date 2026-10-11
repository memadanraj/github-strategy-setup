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

export async function addCredits(
  db: any,
  userId: string,
  amount: number,
  kind: string,
  description: string,
  idempotencyKey: string,
) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error("Credit grant amount is invalid.");
  }
  if (!idempotencyKey.trim() || idempotencyKey.length > 200) {
    throw new Error("Credit grant idempotency key is invalid.");
  }

  const result = await db.rpc("apply_credit_transaction", {
    _user_id: userId,
    _amount: amount,
    _kind: kind,
    _description: description,
    _idempotency_key: idempotencyKey,
  });
  if (result.error) throw new Error("Couldn't apply the credit ledger transaction.");
}
