import '@tanstack/react-start/server-only';
import { addCredits, admin, paddleEnv } from "./paddle.server";

function hexBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Paddle-Signature header: "ts=...;h1=..."
async function verifyPaddleSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(";").map((x) => {
    const i = x.indexOf("=");
    return [x.slice(0, i), x.slice(i + 1)];
  }));
  const timestamp = Number(parts["ts"]);
  const signature = parts["h1"];
  if (!timestamp || !signature || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, hexBytes(signature), new TextEncoder().encode(`${timestamp}:${payload}`));
}

async function upsertSubscription(db: any, sub: any, fallbackUserId?: string, fallbackPlanSlug?: string) {
  const custom = sub.custom_data || {};
  const existing = (await db.from("paddle_subscriptions").select("user_id,plan_slug").eq("paddle_subscription_id", sub.id).maybeSingle()).data;
  const userId = custom.user_id || fallbackUserId || existing?.user_id;
  if (!userId) return null;
  const planSlug = custom.plan_slug || fallbackPlanSlug || existing?.plan_slug || "free";
  const period = sub.current_billing_period || {};
  await db.from("paddle_subscriptions").upsert({
    user_id: userId,
    paddle_customer_id: String(sub.customer_id || ""),
    paddle_subscription_id: sub.id,
    plan_slug: planSlug,
    status: sub.status,
    current_period_start: period.starts_at || null,
    current_period_end: period.ends_at || null,
    cancel_at_period_end: !!sub.scheduled_change,
    canceled_at: sub.canceled_at || null,
    metadata: custom,
    updated_at: new Date().toISOString(),
  }, { onConflict: "paddle_subscription_id" });
  if (["active", "trialing"].includes(sub.status)) {
    await db.from("profiles").update({ plan_slug: planSlug, updated_at: new Date().toISOString() }).eq("id", userId);
  }
  return { userId, planSlug };
}

export async function handlePaddleWebhook(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("paddle-signature") || "";
  if (!await verifyPaddleSignature(payload, signature, paddleEnv("PADDLE_WEBHOOK_SECRET"))) {
    return new Response("Invalid signature", { status: 400 });
  }
  const event: any = JSON.parse(payload);
  const db: any = await admin();
  const seen = await db.from("paddle_events").insert({
    paddle_event_id: event.event_id,
    event_type: event.event_type,
    metadata: { occurred_at: event.occurred_at },
  });
  if (seen.error?.code === "23505") return new Response("ok", { status: 200 });
  if (seen.error) return new Response("Could not record event", { status: 500 });

  try {
    const data = event.data || {};
    const custom = data.custom_data || {};

    if (event.event_type === "transaction.completed") {
      const userId = custom.user_id;
      if (userId && custom.type === "credit_pack") {
        await addCredits(db, userId, Number(custom.credits || 0), "purchase", `Paddle credit pack: ${custom.pack_slug}`);
      }
      // Monthly renewal: grant plan credits on recurring subscription charges.
      if (data.subscription_id && data.origin === "subscription_recurring") {
        const subRow = (await db.from("paddle_subscriptions").select("user_id,plan_slug").eq("paddle_subscription_id", data.subscription_id).maybeSingle()).data;
        if (subRow) {
          const plan = (await db.from("plans").select("monthly_credits").eq("slug", subRow.plan_slug).maybeSingle()).data;
          if (plan?.monthly_credits) await addCredits(db, subRow.user_id, Number(plan.monthly_credits), "subscription", `Monthly ${subRow.plan_slug} credits`);
        }
      }
    } else if (event.event_type === "subscription.created" || event.event_type === "subscription.activated") {
      const result = await upsertSubscription(db, data);
      if (result && event.event_type === "subscription.activated") {
        const plan = (await db.from("plans").select("monthly_credits").eq("slug", result.planSlug).maybeSingle()).data;
        if (plan?.monthly_credits) await addCredits(db, result.userId, Number(plan.monthly_credits), "subscription", `Initial ${result.planSlug} credits`);
      }
    } else if (event.event_type === "subscription.updated") {
      await upsertSubscription(db, data);
    } else if (event.event_type === "subscription.canceled") {
      const row = (await db.from("paddle_subscriptions").select("user_id").eq("paddle_subscription_id", data.id).maybeSingle()).data;
      await db.from("paddle_subscriptions").update({ status: "canceled", canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("paddle_subscription_id", data.id);
      if (row) await db.from("profiles").update({ plan_slug: "free", updated_at: new Date().toISOString() }).eq("id", row.user_id);
    } else if (event.event_type === "subscription.past_due") {
      await db.from("paddle_subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("paddle_subscription_id", data.id);
    }
    return new Response("ok", { status: 200 });
  } catch (error: any) {
    await db.from("paddle_events").delete().eq("paddle_event_id", event.event_id);
    return new Response(error?.message || "Webhook processing failed", { status: 500 });
  }
}
