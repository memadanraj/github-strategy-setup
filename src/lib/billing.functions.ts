import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function stripeEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} environment variable.`);
  return value;
}
function encodeForm(entries: Record<string,string>) {
  const form = new URLSearchParams();
  for (const [key,value] of Object.entries(entries)) form.set(key,value);
  return form;
}
async function stripe(path: string, method: "GET"|"POST", form?: URLSearchParams) {
  const secret = stripeEnv("STRIPE_SECRET_KEY");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${secret}`, ...(form ? {"Content-Type":"application/x-www-form-urlencoded"} : {}) },
    body: form,
  });
  const data: any = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data?.error?.message || `Stripe request failed (${r.status}).`);
  return data;
}
async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}
async function customerFor(userId: string, email: string) {
  const db:any = await admin();
  const existing=(await db.from("stripe_customers").select("*").eq("user_id",userId).maybeSingle()).data;
  if(existing?.stripe_customer_id) return existing;
  const customer=await stripe("customers","POST",encodeForm({email, "metadata[user_id]":userId}));
  await db.from("stripe_customers").upsert({
    user_id:userId, stripe_customer_id:customer.id, email, updated_at:new Date().toISOString()
  },{onConflict:"user_id"});
  return {stripe_customer_id:customer.id,email};
}

export const createSubscriptionCheckout=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((d)=>z.object({planSlug:z.string().min(1).max(50)}).parse(d))
  .handler(async({data,context})=>{
    const db:any=await admin();
    const plan=(await db.from("plans").select("slug,name,stripe_price_id,is_active").eq("slug",data.planSlug).maybeSingle()).data;
    if(!plan?.is_active) throw new Error("Plan not found or inactive.");
    if(!plan.stripe_price_id) throw new Error("This plan is not connected to a Stripe Price yet.");
    const userEmail=context.claims?.email || "";
    const customer=await customerFor(context.userId,userEmail);
    const req=getRequest();
    const origin=new URL(req.url).origin;
    const session=await stripe("checkout/sessions","POST",encodeForm({
      mode:"subscription",
      customer:customer.stripe_customer_id,
      "line_items[0][price]":plan.stripe_price_id,
      "line_items[0][quantity]":"1",
      success_url:`${origin}/settings?billing=success`,
      cancel_url:`${origin}/settings?billing=cancelled`,
      "metadata[user_id]":context.userId,
      "metadata[plan_slug]":plan.slug,
      "metadata[type]":"subscription",
      "subscription_data[metadata][user_id]":context.userId,
      "subscription_data[metadata][plan_slug]":plan.slug,
    }));
    return {ok:true,url:session.url as string};
  });

export const createCreditPackCheckout=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((d)=>z.object({packSlug:z.string().min(1).max(50)}).parse(d))
  .handler(async({data,context})=>{
    const db:any=await admin();
    const pack=(await db.from("credit_packs").select("*").eq("slug",data.packSlug).maybeSingle()).data;
    if(!pack?.is_active) throw new Error("Credit pack not found or inactive.");
    if(!pack.stripe_price_id) throw new Error("This credit pack is not connected to a Stripe Price yet.");
    const customer=await customerFor(context.userId,context.claims?.email || "");
    const req=getRequest(), origin=new URL(req.url).origin;
    const session=await stripe("checkout/sessions","POST",encodeForm({
      mode:"payment", customer:customer.stripe_customer_id,
      "line_items[0][price]":pack.stripe_price_id, "line_items[0][quantity]":"1",
      success_url:`${origin}/settings?billing=success`,
      cancel_url:`${origin}/settings?billing=cancelled`,
      "metadata[user_id]":context.userId, "metadata[pack_slug]":pack.slug,
      "metadata[credits]":String(pack.credits), "metadata[type]":"credit_pack",
    }));
    return {ok:true,url:session.url as string};
  });

export const createBillingPortal=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const db:any=await admin();
    const customer=(await db.from("stripe_customers").select("stripe_customer_id").eq("user_id",context.userId).maybeSingle()).data;
    if(!customer?.stripe_customer_id) throw new Error("No Stripe customer exists yet.");
    const origin=new URL(getRequest().url).origin;
    const session=await stripe("billing_portal/sessions","POST",encodeForm({
      customer:customer.stripe_customer_id, return_url:`${origin}/settings`,
    }));
    return {ok:true,url:session.url as string};
  });

export const getBillingStatus=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const db:any=await admin();
    const [customer,subscription,plans,packs]=await Promise.all([
      db.from("stripe_customers").select("*").eq("user_id",context.userId).maybeSingle(),
      db.from("stripe_subscriptions").select("*").eq("user_id",context.userId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
      db.from("plans").select("slug,name,tagline,price_monthly_cents,monthly_credits,max_projects,max_storage_gb,max_video_minutes,max_resolution,features,is_featured,stripe_price_id").eq("is_active",true).order("sort_order"),
      db.from("credit_packs").select("*").eq("is_active",true).order("sort_order"),
    ]);
    return {customer:customer.data||null,subscription:subscription.data||null,plans:plans.data||[],packs:packs.data||[]};
  });
