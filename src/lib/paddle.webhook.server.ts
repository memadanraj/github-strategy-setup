import '@tanstack/react-start/server-only';
import { addCredits, admin, paddleEnv } from "./paddle.server";
import {
  calculatePackCredits,
  extractPaddleLineItems,
  getCheckoutIntentId,
  hasExactCheckoutPrice,
} from "./paddle-validation";

type CheckoutIntent = {
  id: string;
  user_id: string;
  item_kind: "subscription" | "credit_pack";
  item_slug: string;
  paddle_price_id: string;
  fulfilled_transaction_id: string | null;
  fulfilled_subscription_id: string | null;
  expires_at: string;
};

function hexBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Paddle-Signature header: "ts=...;h1=..."
async function verifyPaddleSignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(";").map((part) => {
    const i = part.indexOf("=");
    return [part.slice(0, i), part.slice(i + 1)];
  }));
  const timestamp = Number(parts["ts"]);
  const signature = parts["h1"];
  if (!timestamp || !signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      hexBytes(signature),
      new TextEncoder().encode(timestamp + ":" + payload),
    );
  } catch {
    return false;
  }
}

function intentMarker(customData: unknown): { present: boolean; id: string | null } {
  if (!customData || typeof customData !== "object") return { present: false, id: null };
  const record = customData as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "checkout_intent")) {
    return { present: false, id: null };
  }
  return { present: true, id: getCheckoutIntentId(record) };
}

async function getCheckoutIntent(
  db: any,
  customData: unknown,
  items: ReturnType<typeof extractPaddleLineItems>,
  entityType: "transaction" | "subscription",
  entityId: string,
): Promise<CheckoutIntent | null> {
  const marker = intentMarker(customData);
  if (!marker.present) return null;
  if (!marker.id) throw new Error("Invalid server-issued checkout intent.");

  const result = await db
    .from("paddle_checkout_intents")
    .select("*")
    .eq("id", marker.id)
    .maybeSingle();
  if (result.error || !result.data) throw new Error("Checkout intent was not found.");

  const intent = result.data as CheckoutIntent;
  const bindingField = entityType === "transaction"
    ? "fulfilled_transaction_id"
    : "fulfilled_subscription_id";
  const currentBinding = intent[bindingField];

  if (currentBinding && currentBinding !== entityId) {
    throw new Error("Checkout intent has already been used for another payment.");
  }
  if (!currentBinding && !intent.fulfilled_transaction_id && !intent.fulfilled_subscription_id &&
      Date.parse(intent.expires_at) < Date.now()) {
    throw new Error("Checkout intent has expired.");
  }
  if (!hasExactCheckoutPrice(items, intent.paddle_price_id)) {
    throw new Error("Paid price does not match the server-authorized checkout item.");
  }
  if (intent.item_kind === "subscription" && items[0]?.quantity !== 1) {
    throw new Error("Subscription checkout quantity is invalid.");
  }
  return intent;
}

async function bindIntent(
  db: any,
  intent: CheckoutIntent,
  field: "fulfilled_transaction_id" | "fulfilled_subscription_id",
  entityId: string,
) {
  const current = intent[field];
  if (current && current !== entityId) {
    throw new Error("Checkout intent has already been fulfilled.");
  }
  if (current === entityId) return;

  const update = await db
    .from("paddle_checkout_intents")
    .update({ [field]: entityId, updated_at: new Date().toISOString() })
    .eq("id", intent.id)
    .is(field, null)
    .select("id")
    .maybeSingle();
  if (update.error) throw new Error("Couldn't bind checkout intent to the Paddle transaction.");

  if (update.data?.id) return;

  // Another webhook delivery may have claimed this same entity concurrently.
  const latest = await db
    .from("paddle_checkout_intents")
    .select(field)
    .eq("id", intent.id)
    .maybeSingle();
  if (latest.error || latest.data?.[field] !== entityId) {
    throw new Error("Checkout intent has already been fulfilled.");
  }
}

async function getMappedUserId(db: any, paddleCustomerId: string | null | undefined): Promise<string | null> {
  if (!paddleCustomerId) return null;
  const result = await db
    .from("paddle_customers")
    .select("user_id")
    .eq("paddle_customer_id", paddleCustomerId)
    .maybeSingle();
  if (result.error) throw new Error("Couldn't resolve the Paddle customer account.");
  return result.data?.user_id ?? null;
}

async function bindPaddleCustomer(
  db: any,
  userId: string,
  paddleCustomerId: string | null | undefined,
) {
  if (!paddleCustomerId) return;

  const found = await db
    .from("paddle_customers")
    .select("user_id")
    .eq("paddle_customer_id", paddleCustomerId)
    .maybeSingle();
  if (found.error) throw new Error("Couldn't verify Paddle customer ownership.");
  if (found.data && found.data.user_id !== userId) {
    throw new Error("Paddle customer is already linked to another account.");
  }
  if (found.data) return;

  const inserted = await db.from("paddle_customers").insert({
    user_id: userId,
    paddle_customer_id: paddleCustomerId,
    updated_at: new Date().toISOString(),
  });
  if (inserted.error) {
    // Concurrent deliveries may insert the same mapping. Accept only if it now
    // resolves back to this same account.
    const retry = await db
      .from("paddle_customers")
      .select("user_id")
      .eq("paddle_customer_id", paddleCustomerId)
      .maybeSingle();
    if (retry.error || retry.data?.user_id !== userId) {
      throw new Error("Couldn't link this Paddle customer to the account.");
    }
  }
}

async function getPackByPrice(db: any, priceId: string) {
  const result = await db
    .from("credit_packs")
    .select("slug,credits,paddle_price_id")
    .eq("paddle_price_id", priceId)
    .maybeSingle();
  if (result.error) throw new Error("Couldn't look up the purchased credit pack.");
  return result.data;
}

async function getPackForIntent(db: any, intent: CheckoutIntent) {
  const result = await db
    .from("credit_packs")
    .select("slug,credits,paddle_price_id")
    .eq("slug", intent.item_slug)
    .eq("paddle_price_id", intent.paddle_price_id)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Error("Checkout intent does not match a configured credit pack.");
  }
  return result.data;
}

async function getPlanForPrice(db: any, priceId: string) {
  const result = await db
    .from("plans")
    .select("slug,paddle_price_id,monthly_credits")
    .eq("paddle_price_id", priceId)
    .maybeSingle();
  if (result.error) throw new Error("Couldn't look up the Paddle subscription plan.");
  return result.data;
}

async function getPlanForIntent(db: any, intent: CheckoutIntent) {
  const result = await db
    .from("plans")
    .select("slug,paddle_price_id,monthly_credits")
    .eq("slug", intent.item_slug)
    .eq("paddle_price_id", intent.paddle_price_id)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new Error("Checkout intent does not match a configured subscription plan.");
  }
  return result.data;
}

async function upsertSubscription(db: any, sub: any, useCheckoutIntent: boolean) {
  if (!sub?.id || !sub?.customer_id) throw new Error("Paddle subscription payload is incomplete.");

  const items = extractPaddleLineItems(sub.items);
  if (items.length === 0) throw new Error("Paddle subscription has no valid price items.");

  const existingResult = await db
    .from("paddle_subscriptions")
    .select("user_id,plan_slug,paddle_customer_id")
    .eq("paddle_subscription_id", sub.id)
    .maybeSingle();
  if (existingResult.error) throw new Error("Couldn't look up the existing Paddle subscription.");
  const existing = existingResult.data;

  const intent = useCheckoutIntent
    ? await getCheckoutIntent(db, sub.custom_data, items, "subscription", sub.id)
    : null;
  if (intent && intent.item_kind !== "subscription") {
    throw new Error("Checkout intent is not for a subscription.");
  }

  const matchingPlan = intent
    ? await getPlanForIntent(db, intent)
    : await getPlanForPrice(db, items[0]!.priceId);
  if (!matchingPlan) {
    throw new Error("Paddle price is not mapped to an application plan. Configure plans.paddle_price_id.");
  }
  if (intent) await bindIntent(db, intent, "fulfilled_subscription_id", sub.id);

  const mappedUserId = await getMappedUserId(db, sub.customer_id);
  const userId = intent?.user_id ?? existing?.user_id ?? mappedUserId;
  if (!userId) {
    throw new Error("Paddle customer is not linked to an account and no valid checkout intent was supplied.");
  }
  if (existing?.user_id && existing.user_id !== userId) {
    throw new Error("Paddle subscription ownership does not match the checkout account.");
  }
  if (mappedUserId && mappedUserId !== userId) {
    throw new Error("Paddle customer ownership does not match the checkout account.");
  }

  await bindPaddleCustomer(db, userId, sub.customer_id);

  const period = sub.current_billing_period || {};
  const write = await db.from("paddle_subscriptions").upsert({
    user_id: userId,
    paddle_customer_id: sub.customer_id,
    paddle_subscription_id: sub.id,
    plan_slug: matchingPlan.slug,
    status: sub.status,
    current_period_start: period.starts_at || null,
    current_period_end: period.ends_at || null,
    cancel_at_period_end: sub.scheduled_change?.action === "cancel",
    canceled_at: sub.canceled_at || null,
    metadata: {
      source: "paddle",
      price_ids: items.map((item) => item.priceId),
      checkout_intent_id: intent?.id ?? null,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: "paddle_subscription_id" });
  if (write.error) throw new Error("Couldn't save the Paddle subscription.");

  if (["active", "trialing"].includes(sub.status)) {
    const profile = await db.from("profiles")
      .update({ plan_slug: matchingPlan.slug, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profile.error) throw new Error("Couldn't update the account plan.");
  }

  return { userId, planSlug: matchingPlan.slug, subscriptionId: sub.id };
}

async function fulfillCreditPack(
  db: any,
  userId: string,
  paddleCustomerId: string | null | undefined,
  pack: { slug: string; credits: number; paddle_price_id: string | null },
  items: ReturnType<typeof extractPaddleLineItems>,
  transactionId: string,
) {
  const credits = calculatePackCredits(pack, items);
  if (credits === null) throw new Error("Paid transaction does not match the configured credit pack.");
  if (items.length !== 1 || items[0]?.priceId !== pack.paddle_price_id) {
    throw new Error("Credit pack checkout contains unexpected line items.");
  }

  await bindPaddleCustomer(db, userId, paddleCustomerId);
  await addCredits(
    db,
    userId,
    credits,
    "purchase",
    "Paddle credit pack: " + pack.slug,
    "paddle:transaction:" + transactionId + ":credit-pack:" + pack.slug,
  );
}

async function processTransactionCompleted(db: any, data: any) {
  if (!data?.id) throw new Error("Paddle transaction payload is missing its ID.");
  const items = extractPaddleLineItems(data.items);
  if (items.length === 0) throw new Error("Paddle transaction has no valid price items.");

  // Subscription renewals use the previously verified subscription/customer mapping.
  // A persistent checkout intent copied into custom_data must not be consumed again.
  if (data.subscription_id && data.origin === "subscription_recurring") {
    const subResult = await db.from("paddle_subscriptions")
      .select("user_id,plan_slug,paddle_customer_id")
      .eq("paddle_subscription_id", data.subscription_id)
      .maybeSingle();
    if (subResult.error || !subResult.data) {
      throw new Error("Recurring payment has no verified subscription record.");
    }
    const sub = subResult.data;
    const mappedUserId = await getMappedUserId(db, data.customer_id);
    if (mappedUserId && mappedUserId !== sub.user_id) {
      throw new Error("Recurring payment customer does not match the subscription owner.");
    }

    const planResult = await db.from("plans")
      .select("monthly_credits,paddle_price_id")
      .eq("slug", sub.plan_slug)
      .maybeSingle();
    if (planResult.error || !planResult.data) throw new Error("Subscription plan is missing.");
    if (planResult.data.paddle_price_id &&
        !items.some((item) => item.priceId === planResult.data.paddle_price_id)) {
      throw new Error("Renewal price does not match the stored subscription plan.");
    }

    await bindPaddleCustomer(db, sub.user_id, data.customer_id);
    const amount = Number(planResult.data.monthly_credits);
    if (Number.isSafeInteger(amount) && amount > 0) {
      await addCredits(
        db,
        sub.user_id,
        amount,
        "subscription",
        "Monthly " + sub.plan_slug + " credits",
        "paddle:transaction:" + data.id + ":subscription-renewal",
      );
    }
    return;
  }

  const intent = await getCheckoutIntent(db, data.custom_data, items, "transaction", data.id);
  if (intent) {
    if (intent.item_kind === "credit_pack") {
      const pack = await getPackForIntent(db, intent);
      await bindIntent(db, intent, "fulfilled_transaction_id", data.id);
      await fulfillCreditPack(db, intent.user_id, data.customer_id, pack, items, data.id);
      return;
    }

    if (intent.item_kind === "subscription") {
      await getPlanForIntent(db, intent);
      await bindIntent(db, intent, "fulfilled_transaction_id", data.id);
      await bindPaddleCustomer(db, intent.user_id, data.customer_id);
      return;
    }

    throw new Error("Checkout intent has an unsupported item type.");
  }

  // Legacy transactions without an intent can only be fulfilled when the Paddle
  // customer is already mapped. Never trust custom_data.user_id or custom_data.credits.
  if (items.length !== 1) return;
  const pack = await getPackByPrice(db, items[0]!.priceId);
  if (!pack) return;
  const userId = await getMappedUserId(db, data.customer_id);
  if (!userId) throw new Error("Credit pack transaction has no verified checkout intent or customer mapping.");
  await fulfillCreditPack(db, userId, data.customer_id, pack, items, data.id);
}

async function processPaddleEvent(db: any, event: any) {
  const data = event.data || {};

  if (event.event_type === "transaction.completed") {
    await processTransactionCompleted(db, data);
    return;
  }

  if (event.event_type === "subscription.created" || event.event_type === "subscription.activated") {
    const result = await upsertSubscription(db, data, true);
    if (result && event.event_type === "subscription.activated") {
      const planResult = await db.from("plans")
        .select("monthly_credits")
        .eq("slug", result.planSlug)
        .maybeSingle();
      if (planResult.error) throw new Error("Couldn't look up initial subscription credits.");
      const amount = Number(planResult.data?.monthly_credits ?? 0);
      if (Number.isSafeInteger(amount) && amount > 0) {
        await addCredits(
          db,
          result.userId,
          amount,
          "subscription",
          "Initial " + result.planSlug + " credits",
          "paddle:subscription:" + result.subscriptionId + ":initial-credits",
        );
      }
    }
    return;
  }

  if (event.event_type === "subscription.updated") {
    await upsertSubscription(db, data, false);
    return;
  }

  if (event.event_type === "subscription.canceled") {
    if (!data.id) throw new Error("Paddle cancellation event is missing its subscription ID.");
    const rowResult = await db.from("paddle_subscriptions")
      .select("user_id,paddle_customer_id")
      .eq("paddle_subscription_id", data.id)
      .maybeSingle();
    if (rowResult.error) throw new Error("Couldn't find the cancelled subscription.");
    if (rowResult.data) {
      const mappedUserId = await getMappedUserId(db, data.customer_id);
      if (mappedUserId && mappedUserId !== rowResult.data.user_id) {
        throw new Error("Cancellation customer does not match subscription ownership.");
      }
      const update = await db.from("paddle_subscriptions").update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("paddle_subscription_id", data.id);
      if (update.error) throw new Error("Couldn't update the cancelled subscription.");
      const profile = await db.from("profiles").update({
        plan_slug: "free",
        updated_at: new Date().toISOString(),
      }).eq("id", rowResult.data.user_id);
      if (profile.error) throw new Error("Couldn't update the cancelled account plan.");
    }
    return;
  }

  if (event.event_type === "subscription.past_due") {
    if (!data.id) throw new Error("Paddle past-due event is missing its subscription ID.");
    const update = await db.from("paddle_subscriptions").update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    }).eq("paddle_subscription_id", data.id);
    if (update.error) throw new Error("Couldn't update subscription payment status.");
  }
}

async function claimRetryableEvent(db: any, eventId: string, previousStatus: string, startedAt: string | null) {
  const now = new Date().toISOString();
  let query = db.from("paddle_events").update({
    processing_status: "processing",
    processing_started_at: now,
    last_error: null,
  }).eq("paddle_event_id", eventId);

  if (previousStatus === "failed") {
    query = query.eq("processing_status", "failed");
  } else if (previousStatus === "processing" && startedAt) {
    query = query.eq("processing_status", "processing")
      .lt("processing_started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());
  } else {
    return false;
  }

  const result = await query.select("id").maybeSingle();
  return !result.error && !!result.data?.id;
}

export async function handlePaddleWebhook(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("paddle-signature") || "";
  if (!await verifyPaddleSignature(payload, signature, paddleEnv("PADDLE_WEBHOOK_SECRET"))) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!event || typeof event.event_id !== "string" || !event.event_id ||
      typeof event.event_type !== "string" || !event.event_type) {
    return new Response("Invalid event payload", { status: 400 });
  }

  const db: any = await admin();
  const now = new Date().toISOString();
  const inserted = await db.from("paddle_events").insert({
    paddle_event_id: event.event_id,
    event_type: event.event_type,
    processing_status: "processing",
    processing_started_at: now,
    metadata: { occurred_at: event.occurred_at },
  });

  if (inserted.error?.code === "23505") {
    const previous = await db.from("paddle_events")
      .select("processing_status,processing_started_at")
      .eq("paddle_event_id", event.event_id)
      .maybeSingle();
    if (previous.error || !previous.data) {
      return new Response("Could not read event processing state", { status: 500 });
    }
    if (previous.data.processing_status === "processed") return new Response("ok", { status: 200 });

    const claimed = await claimRetryableEvent(
      db,
      event.event_id,
      previous.data.processing_status,
      previous.data.processing_started_at,
    );
    if (!claimed) return new Response("Event is already being processed", { status: 409 });
  } else if (inserted.error) {
    return new Response("Could not record event", { status: 500 });
  }

  try {
    await processPaddleEvent(db, event);
    const completed = await db.from("paddle_events").update({
      processing_status: "processed",
      processing_started_at: null,
      last_error: null,
      processed_at: new Date().toISOString(),
    }).eq("paddle_event_id", event.event_id);
    if (completed.error) throw new Error("Couldn't mark Paddle event as processed.");
    return new Response("ok", { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await db.from("paddle_events").update({
      processing_status: "failed",
      processing_started_at: null,
      last_error: message.slice(0, 500),
    }).eq("paddle_event_id", event.event_id);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
