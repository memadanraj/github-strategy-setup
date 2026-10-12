import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { admin, paddleApi, paddleEnv } from "./paddle.server";
import { persistPaddleSubscriptionCancellation, persistPaddleSubscriptionPlanChange } from "./paddle-subscription-persistence";

export const preparePaddleCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      kind: z.enum(["subscription", "credit_pack"]),
      slug: z.string().trim().min(1).max(80),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db: any = await admin();
    let priceId: string | null = null;

    if (data.kind === "subscription") {
      if (data.slug === "free") throw new Error("The Free plan does not require checkout.");
      const { data: plan, error } = await db
        .from("plans")
        .select("slug,paddle_price_id,is_active")
        .eq("slug", data.slug)
        .maybeSingle();
      if (error || !plan?.is_active) throw new Error("Plan not found or inactive.");
      priceId = plan.paddle_price_id;
    } else {
      const { data: pack, error } = await db
        .from("credit_packs")
        .select("slug,paddle_price_id,is_active")
        .eq("slug", data.slug)
        .maybeSingle();
      if (error || !pack?.is_active) throw new Error("Credit pack not found or inactive.");
      priceId = pack.paddle_price_id;
    }

    if (!priceId) throw new Error("This item is not connected to a Paddle price yet.");

    const intent = await db
      .from("paddle_checkout_intents")
      .insert({
        user_id: context.userId,
        item_kind: data.kind,
        item_slug: data.slug,
        paddle_price_id: priceId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (intent.error || !intent.data?.id) {
      throw new Error("Couldn't prepare a secure Paddle checkout.");
    }

    return { intentId: intent.data.id as string, priceId: priceId as string };
  });

// Public client token for Paddle.js overlay checkout (safe to expose; it is a
// publishable client-side token, not the secret API key).
export const getPaddleClientConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    token: paddleEnv("PADDLE_CLIENT_TOKEN"),
    environment: process.env["PADDLE_ENVIRONMENT"] === "production" ? "production" : "sandbox",
  }));

export const getPaddleBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: any = await admin();
    const [customer, subscription, plans, packs] = await Promise.all([
      db.from("paddle_customers").select("*").eq("user_id", context.userId).maybeSingle(),
      db.from("paddle_subscriptions").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("plans").select("slug,name,tagline,price_monthly_cents,monthly_credits,max_projects,max_storage_gb,max_video_minutes,max_resolution,features,is_featured,paddle_price_id").eq("is_active", true).order("sort_order"),
      db.from("credit_packs").select("*").eq("is_active", true).order("sort_order"),
    ]);
    if (customer.error || subscription.error || plans.error || packs.error) {
      console.error("Paddle billing status query failed.");
      throw new Error("Couldn't load billing status right now. Refresh and try again.");
    }
    return {
      customer: customer.data || null,
      subscription: subscription.data || null,
      plans: plans.data || [],
      packs: packs.data || [],
    };
  });

// Change an existing Paddle subscription to a different plan (prorated).
export const changePaddleSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planSlug: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const db: any = await admin();
    const planResult = await db.from("plans").select("slug,paddle_price_id,is_active").eq("slug", data.planSlug).maybeSingle();
    if (planResult.error) throw new Error("Couldn't load the selected plan.");
    const plan = planResult.data;
    if (!plan?.is_active) throw new Error("Plan not found or inactive.");
    if (!plan.paddle_price_id) throw new Error("This plan is not connected to a Paddle price yet.");

    const currentResult = await db.from("paddle_subscriptions")
      .select("paddle_subscription_id,status,plan_slug,cancel_at_period_end")
      .eq("user_id", context.userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentResult.error) throw new Error("Couldn't load the current subscription.");
    const current = currentResult.data;
    if (!current?.paddle_subscription_id) throw new Error("No active subscription found. Use checkout to start one.");

    let providerStatus = current.status as string;
    // Avoid repeating a prorated provider mutation if the local subscription was
    // updated by the previous request but profile synchronization then failed.
    if (current.plan_slug !== plan.slug) {
      const updated = await paddleApi("subscriptions/" + current.paddle_subscription_id, "PATCH", {
        items: [{ price_id: plan.paddle_price_id, quantity: 1 }],
        proration_billing_mode: "prorated_immediately",
      });
      providerStatus = updated.status as string;
    }

    const sync = await persistPaddleSubscriptionPlanChange({
      updateSubscription: () => db.from("paddle_subscriptions").update({
        plan_slug: plan.slug,
        status: providerStatus,
        updated_at: new Date().toISOString(),
      }).eq("paddle_subscription_id", current.paddle_subscription_id)
        .eq("user_id", context.userId)
        .select("paddle_subscription_id")
        .maybeSingle(),
      updateProfile: () => db.from("profiles")
        .update({ plan_slug: plan.slug, updated_at: new Date().toISOString() })
        .eq("id", context.userId)
        .select("id")
        .maybeSingle(),
    });
    if (!sync.ok) {
      console.error("Paddle plan change requires local reconciliation.", { stage: sync.stage, userId: context.userId });
      return { ok: false, error: sync.message, status: providerStatus };
    }
    return { ok: true, status: providerStatus };
  });

export const cancelPaddleSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: any = await admin();
    const currentResult = await db.from("paddle_subscriptions")
      .select("paddle_subscription_id,status,cancel_at_period_end")
      .eq("user_id", context.userId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (currentResult.error) throw new Error("Couldn't load the current subscription.");
    const current = currentResult.data;
    if (!current?.paddle_subscription_id) throw new Error("No active subscription found.");

    let providerStatus = current.status as string;
    if (!current.cancel_at_period_end) {
      const updated = await paddleApi("subscriptions/" + current.paddle_subscription_id + "/cancel", "POST", { effective_from: "next_billing_period" });
      providerStatus = updated.status as string;
    }

    const sync = await persistPaddleSubscriptionCancellation({
      updateSubscription: () => db.from("paddle_subscriptions").update({
        cancel_at_period_end: true,
        status: providerStatus,
        updated_at: new Date().toISOString(),
      }).eq("paddle_subscription_id", current.paddle_subscription_id)
        .eq("user_id", context.userId)
        .select("paddle_subscription_id")
        .maybeSingle(),
    });
    if (!sync.ok) {
      console.error("Paddle cancellation requires local reconciliation.", { userId: context.userId });
      return { ok: false, error: sync.message, status: providerStatus };
    }
    return { ok: true, status: providerStatus };
  });
