import '@tanstack/react-start/server-only';

function env(name:string){const v=process.env[name];if(!v)throw new Error(`Missing ${name} environment variable.`);return v;}
function hexBytes(hex:string){const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i++)out[i]=parseInt(hex.slice(i*2,i*2+2),16);return out;}
async function verifySignature(payload:string,header:string,secret:string){
  const parts=Object.fromEntries(header.split(",").map(x=>{const [k,v]=x.split("=");return [k,v];}));
  const timestamp=Number(parts.t); const signature=parts.v1;
  if(!timestamp||!signature||Math.abs(Date.now()/1000-timestamp)>300) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  return crypto.subtle.verify("HMAC",key,hexBytes(signature),new TextEncoder().encode(`${timestamp}.${payload}`));
}
async function admin(){return (await import("@/integrations/supabase/client.server")).supabaseAdmin;}
async function addCredits(db:any,userId:string,amount:number,kind:string,description:string){
  const p=(await db.from("profiles").select("credits_balance").eq("id",userId).maybeSingle()).data;
  if(!p) throw new Error("Profile not found.");
  const next=Math.max(0,Number(p.credits_balance)+amount);
  await db.from("profiles").update({credits_balance:next,updated_at:new Date().toISOString()}).eq("id",userId);
  await db.from("credit_transactions").insert({user_id:userId,amount,kind,description});
}
async function stripeApi(path:string){
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{headers:{Authorization:`Bearer ${env("STRIPE_SECRET_KEY")}`}});
  const d:any=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error?.message||"Stripe API request failed");return d;
}
export async function handleStripeWebhook(request:Request){
  const payload=await request.text(), signature=request.headers.get("stripe-signature")||"";
  if(!await verifySignature(payload,signature,env("STRIPE_WEBHOOK_SECRET"))) return new Response("Invalid signature",{status:400});
  const event:any=JSON.parse(payload), db:any=await admin();
  const seen=await db.from("billing_events").insert({stripe_event_id:event.id,event_type:event.type,metadata:{created:event.created}});
  if(seen.error?.code==="23505") return new Response("ok",{status:200});
  if(seen.error) return new Response("Could not record event",{status:500});
  try{
    if(event.type==="checkout.session.completed"){
      const s=event.data.object, meta=s.metadata||{}, userId=meta.user_id;
      if(userId && meta.type==="credit_pack"){
        await addCredits(db,userId,Number(meta.credits||0),"purchase",`Stripe credit pack: ${meta.pack_slug}`);
      }
      if(userId && meta.type==="subscription" && s.subscription){
        const sub=await stripeApi(`subscriptions/${s.subscription}`);
        const planSlug=meta.plan_slug||sub.metadata?.plan_slug;
        if(planSlug){
          await db.from("stripe_subscriptions").upsert({
            user_id:userId,stripe_customer_id:String(s.customer||""),stripe_subscription_id:sub.id,
            plan_slug:planSlug,status:sub.status,
            current_period_start:sub.current_period_start?new Date(sub.current_period_start*1000).toISOString():null,
            current_period_end:sub.current_period_end?new Date(sub.current_period_end*1000).toISOString():null,
            cancel_at_period_end:!!sub.cancel_at_period_end,metadata:sub.metadata||{},
            updated_at:new Date().toISOString()
          },{onConflict:"stripe_subscription_id"});
          await db.from("profiles").update({plan_slug:planSlug,updated_at:new Date().toISOString()}).eq("id",userId);
          const plan=(await db.from("plans").select("monthly_credits").eq("slug",planSlug).maybeSingle()).data;
          if(plan?.monthly_credits) await addCredits(db,userId,Number(plan.monthly_credits),"subscription",`Initial ${planSlug} credits`);
        }
      }
    } else if(event.type==="invoice.paid"){
      const invoice=event.data.object, subId=typeof invoice.subscription==="string"?invoice.subscription:invoice.subscription?.id;
      if(subId && invoice.billing_reason !== "subscription_create"){
        const subRow=(await db.from("stripe_subscriptions").select("user_id,plan_slug").eq("stripe_subscription_id",subId).maybeSingle()).data;
        if(subRow){
          const plan=(await db.from("plans").select("monthly_credits").eq("slug",subRow.plan_slug).maybeSingle()).data;
          if(plan?.monthly_credits) await addCredits(db,subRow.user_id,Number(plan.monthly_credits),"subscription",`Monthly ${subRow.plan_slug} credits`);
        }
      }
    } else if(event.type==="customer.subscription.updated"){
      const sub=event.data.object, meta=sub.metadata||{};
      const row=(await db.from("stripe_subscriptions").select("user_id").eq("stripe_subscription_id",sub.id).maybeSingle()).data;
      const userId=meta.user_id||row?.user_id;
      const planSlug=meta.plan_slug;
      if(userId){
        const existing=(await db.from("stripe_subscriptions").select("plan_slug").eq("stripe_subscription_id",sub.id).maybeSingle()).data;
        await db.from("stripe_subscriptions").upsert({
          user_id:userId,stripe_customer_id:String(sub.customer||""),stripe_subscription_id:sub.id,
          plan_slug:planSlug||existing?.plan_slug||"free",status:sub.status,
          current_period_start:sub.current_period_start?new Date(sub.current_period_start*1000).toISOString():null,
          current_period_end:sub.current_period_end?new Date(sub.current_period_end*1000).toISOString():null,
          cancel_at_period_end:!!sub.cancel_at_period_end,
          canceled_at:sub.canceled_at?new Date(sub.canceled_at*1000).toISOString():null,
          metadata:meta,updated_at:new Date().toISOString()
        },{onConflict:"stripe_subscription_id"});
      }
    } else if(event.type==="customer.subscription.deleted"){
      const sub=event.data.object;
      const row=(await db.from("stripe_subscriptions").select("user_id").eq("stripe_subscription_id",sub.id).maybeSingle()).data;
      if(row){
        await db.from("stripe_subscriptions").update({status:"canceled",canceled_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("stripe_subscription_id",sub.id);
        await db.from("profiles").update({plan_slug:"free",updated_at:new Date().toISOString()}).eq("id",row.user_id);
      }
    } else if(event.type==="invoice.payment_failed"){
      const invoice=event.data.object, subId=typeof invoice.subscription==="string"?invoice.subscription:invoice.subscription?.id;
      if(subId) await db.from("stripe_subscriptions").update({status:"past_due",updated_at:new Date().toISOString()}).eq("stripe_subscription_id",subId);
    }
    return new Response("ok",{status:200});
  }catch(error:any){
    await db.from("billing_events").delete().eq("stripe_event_id",event.id);
    return new Response(error?.message||"Webhook processing failed",{status:500});
  }
}
