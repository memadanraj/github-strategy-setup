import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelPaddleSubscription, changePaddleSubscriptionPlan, getPaddleBillingStatus, getPaddleClientConfig, preparePaddleCheckout } from "@/lib/paddle.functions";

declare global {
  interface Window { Paddle?: any; }
}

function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }

function loadPaddleJs(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Paddle) return resolve();
    const existing = document.querySelector('script[src*="paddle.js"]');
    if (existing) { existing.addEventListener("load", () => resolve()); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Paddle checkout."));
    document.head.appendChild(s);
  });
}

export function BillingPanel({ currentPlan, credits, userId }: { currentPlan: string; credits: number; userId: string }) {
  const status = useServerFn(getPaddleBillingStatus);
  const clientConfig = useServerFn(getPaddleClientConfig);
  const changePlan = useServerFn(changePaddleSubscriptionPlan);
  const prepareCheckout = useServerFn(preparePaddleCheckout);
  const cancelSub = useServerFn(cancelPaddleSubscription);
  const [busy, setBusy] = useState<string | null>(null);
  const paddleReady = useRef(false);
  const { data, refetch } = useQuery({ queryKey: ["billing_status"], queryFn: () => status() });

  async function ensurePaddle() {
    if (paddleReady.current && window.Paddle) return;
    const config = await clientConfig();
    await loadPaddleJs();
    window.Paddle.Environment.set(config.environment);
    window.Paddle.Initialize({ token: config.token });
    paddleReady.current = true;
  }

  async function openCheckout(kind: "subscription" | "credit_pack", slug: string) {
    // Price and account ownership come from the authenticated server, not from
    // mutable browser custom_data or a client-supplied price identifier.
    const intent = await prepareCheckout({ data: { kind, slug } });
    await ensurePaddle();
    window.Paddle.Checkout.open({
      items: [{ priceId: intent.priceId, quantity: 1 }],
      customData: { checkout_intent: intent.intentId },
      settings: { displayMode: "overlay", theme: "dark" },
    });
  }

  async function upgrade(plan: any) {
    setBusy(plan.slug);
    try {
      const hasSubscription = ["active", "trialing", "past_due"].includes(data?.subscription?.status || "");
      if (hasSubscription) {
        await changePlan({ data: { planSlug: plan.slug } });
        toast.success("Subscription plan updated");
        await refetch();
      } else {
        await openCheckout("subscription", plan.slug);
      }
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  async function buy(pack: any) {
    setBusy(pack.slug);
    try {
      await openCheckout("credit_pack", pack.slug);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await cancelSub();
      toast.success("Subscription will cancel at the end of the billing period");
      await refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }

  return <div className="mt-6 space-y-6">
    <section className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><CreditCard className="size-4 text-signal"/><h2 className="text-lg font-bold">Billing</h2></div><p className="mt-1 text-sm text-muted-foreground">Manage your subscription and purchase extra AI credits.</p></div>
        {data?.subscription && ["active", "trialing"].includes(data.subscription.status) && !data.subscription.cancel_at_period_end &&
          <Button variant="panel" size="sm" disabled={busy === "cancel"} onClick={cancel}>{busy === "cancel" ? <Loader2 className="animate-spin"/> : <XCircle/>} Cancel subscription</Button>}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-surface-raised p-4">
        <p className="font-mono text-[10px] text-muted-foreground">CURRENT PLAN</p>
        <div className="mt-1 flex items-center justify-between"><span className="text-lg font-semibold capitalize">{currentPlan}</span><span className="font-mono text-sm text-signal">{credits} credits</span></div>
        {data?.subscription && <p className="mt-1 text-xs text-muted-foreground">Paddle status: {data.subscription.status}{data.subscription.cancel_at_period_end ? " · cancels at period end" : ""}</p>}
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-end justify-between"><div><h2 className="text-xl font-bold">Plans</h2><p className="text-sm text-muted-foreground">Upgrade through Paddle checkout.</p></div></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(data?.plans || []).map((plan: any) => <div key={plan.slug} className={`rounded-xl border p-5 ${plan.slug === currentPlan ? "border-signal bg-surface" : "border-border bg-surface"}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{plan.name}</h3>{plan.is_featured && <span className="rounded-full bg-signal/10 px-2 py-0.5 text-[10px] text-signal">Popular</span>}</div>
          <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-4 text-2xl font-bold">{plan.price_monthly_cents === 0 ? "Free" : money(plan.price_monthly_cents)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
          <p className="mt-2 text-sm text-muted-foreground">{plan.monthly_credits.toLocaleString()} monthly credits · {plan.max_resolution}</p>
          <Button className="mt-4 w-full" variant={plan.slug === currentPlan ? "panel" : "signal"} disabled={plan.slug === currentPlan || plan.slug === "free" || !plan.paddle_price_id || !!busy} onClick={() => upgrade(plan)}>
            {busy === plan.slug ? <Loader2 className="animate-spin"/> : plan.slug === currentPlan ? "Current plan" : !plan.paddle_price_id ? "Paddle price not configured" : data?.subscription?.status ? "Change plan" : "Upgrade"}
          </Button>
        </div>)}
      </div>
    </section>

    <section>
      <div className="mb-3"><h2 className="text-xl font-bold">Credit packs</h2><p className="text-sm text-muted-foreground">One-time credit purchases. Credits are fulfilled by Paddle webhooks.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        {(data?.packs || []).map((pack: any) => <div key={pack.slug} className="rounded-xl border border-border bg-surface p-5"><p className="font-semibold">{pack.name}</p><p className="mt-1 text-2xl font-bold">{money(pack.price_cents)}</p><p className="mt-1 text-sm text-muted-foreground">{pack.credits.toLocaleString()} credits</p><Button className="mt-4 w-full" variant="panel" disabled={!pack.paddle_price_id || !!busy} onClick={() => buy(pack)}>{busy === pack.slug ? <Loader2 className="animate-spin"/> : !pack.paddle_price_id ? "Paddle price not configured" : "Buy credits"}</Button></div>)}
      </div>
    </section>

    <div className="rounded-lg border border-border bg-surface-raised p-4 text-xs text-muted-foreground"><Sparkles className="mr-1 inline size-3 text-signal"/> Payments are processed by Paddle. Reelforge updates plans and credits from verified webhook events rather than trusting the checkout redirect.</div>
  </div>;
}
