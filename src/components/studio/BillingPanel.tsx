import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { changeSubscriptionPlan, createBillingPortal, createCreditPackCheckout, createSubscriptionCheckout, getBillingStatus } from "@/lib/billing.functions";

function money(cents:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);}

export function BillingPanel({ currentPlan, credits }:{currentPlan:string;credits:number}){
  const status=useServerFn(getBillingStatus), checkout=useServerFn(createSubscriptionCheckout), changePlan=useServerFn(changeSubscriptionPlan), packCheckout=useServerFn(createCreditPackCheckout), portal=useServerFn(createBillingPortal);
  const [busy,setBusy]=useState<string|null>(null);
  const {data,refetch}=useQuery({queryKey:["billing_status"],queryFn:()=>status()});

  useEffect(()=>{
    const q=new URLSearchParams(window.location.search);
    if(q.get("billing")==="success"){toast.success("Payment completed. Your account will update from Stripe shortly.");refetch();window.history.replaceState({}, "", window.location.pathname);}
    if(q.get("billing")==="cancelled"){toast.message("Checkout cancelled.");window.history.replaceState({}, "", window.location.pathname);}
  },[refetch]);

  async function upgrade(planSlug:string){
    setBusy(planSlug);
    try{
      const hasSubscription=["active","trialing","past_due"].includes(data?.subscription?.status||"");
      if(hasSubscription){
        await changePlan({data:{planSlug}});
        toast.success("Subscription plan updated");
        await refetch();
      }else{
        const r=await checkout({data:{planSlug}});
        if(r.ok)window.location.assign(r.url);
      }
    }catch(e:any){toast.error(e.message);}finally{setBusy(null);}
  }
  async function buy(slug:string){
    setBusy(slug);
    try{const r=await packCheckout({data:{packSlug:slug}});if(r.ok)window.location.assign(r.url);}
    catch(e:any){toast.error(e.message);}finally{setBusy(null);}
  }
  async function manage(){
    setBusy("portal");
    try{const r=await portal();if(r.ok)window.location.assign(r.url);}
    catch(e:any){toast.error(e.message);}finally{setBusy(null);}
  }

  return <div className="mt-6 space-y-6">
    <section className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><CreditCard className="size-4 text-signal"/><h2 className="text-lg font-bold">Billing</h2></div><p className="mt-1 text-sm text-muted-foreground">Manage your subscription and purchase extra AI credits.</p></div>
        {data?.customer && <Button variant="panel" size="sm" disabled={busy==="portal"} onClick={manage}>{busy==="portal"?<Loader2 className="animate-spin"/>:<ExternalLink/>} Manage billing</Button>}
      </div>
      <div className="mt-4 rounded-lg border border-border bg-surface-raised p-4">
        <p className="font-mono text-[10px] text-muted-foreground">CURRENT PLAN</p>
        <div className="mt-1 flex items-center justify-between"><span className="text-lg font-semibold capitalize">{currentPlan}</span><span className="font-mono text-sm text-signal">{credits} credits</span></div>
        {data?.subscription && <p className="mt-1 text-xs text-muted-foreground">Stripe status: {data.subscription.status}{data.subscription.cancel_at_period_end ? " · cancels at period end" : ""}</p>}
      </div>
    </section>

    <section>
      <div className="mb-3 flex items-end justify-between"><div><h2 className="text-xl font-bold">Plans</h2><p className="text-sm text-muted-foreground">Upgrade through Stripe Checkout.</p></div></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(data?.plans||[]).map((plan:any)=><div key={plan.slug} className={`rounded-xl border p-5 ${plan.slug===currentPlan?"border-signal bg-surface":"border-border bg-surface"}`}>
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{plan.name}</h3>{plan.is_featured&&<span className="rounded-full bg-signal/10 px-2 py-0.5 text-[10px] text-signal">Popular</span>}</div>
          <p className="mt-1 text-xs text-muted-foreground">{plan.tagline}</p>
          <p className="mt-4 text-2xl font-bold">{plan.price_monthly_cents===0?"Free":money(plan.price_monthly_cents)}<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
          <p className="mt-2 text-sm text-muted-foreground">{plan.monthly_credits.toLocaleString()} monthly credits · {plan.max_resolution}</p>
          <Button className="mt-4 w-full" variant={plan.slug===currentPlan?"panel":"signal"} disabled={plan.slug===currentPlan||plan.slug==="free"||!plan.stripe_price_id||!!busy} onClick={()=>upgrade(plan.slug)}>
            {busy===plan.slug?<Loader2 className="animate-spin"/>:plan.slug===currentPlan?"Current plan":!plan.stripe_price_id?"Stripe price not configured":data?.subscription?.status?"Change plan":"Upgrade"}
          </Button>
        </div>)}
      </div>
    </section>

    <section>
      <div className="mb-3"><h2 className="text-xl font-bold">Credit packs</h2><p className="text-sm text-muted-foreground">One-time credit purchases. Credits are fulfilled by Stripe webhooks.</p></div>
      <div className="grid gap-3 md:grid-cols-3">
        {(data?.packs||[]).map((pack:any)=><div key={pack.slug} className="rounded-xl border border-border bg-surface p-5"><p className="font-semibold">{pack.name}</p><p className="mt-1 text-2xl font-bold">{money(pack.price_cents)}</p><p className="mt-1 text-sm text-muted-foreground">{pack.credits.toLocaleString()} credits</p><Button className="mt-4 w-full" variant="panel" disabled={!pack.stripe_price_id||!!busy} onClick={()=>buy(pack.slug)}>{busy===pack.slug?<Loader2 className="animate-spin"/>:!pack.stripe_price_id?"Stripe price not configured":"Buy credits"}</Button></div>)}
      </div>
    </section>

    <div className="rounded-lg border border-border bg-surface-raised p-4 text-xs text-muted-foreground"><Sparkles className="mr-1 inline size-3 text-signal"/> Payments are processed by Stripe. Reelforge updates plans and credits from verified webhook events rather than trusting the Checkout redirect.</div>
  </div>;
}
