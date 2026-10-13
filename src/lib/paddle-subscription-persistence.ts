type WriteResult = {
  data: unknown;
  error: { message: string } | null;
};

type WriteOperation = () => PromiseLike<WriteResult>;

export type PaddleSubscriptionSyncResult =
  | { ok: true }
  | { ok: false; stage: "subscription" | "profile"; message: string };

export async function persistPaddleSubscriptionPlanChange(options: {
  updateSubscription: WriteOperation;
  updateProfile: WriteOperation;
}): Promise<PaddleSubscriptionSyncResult> {
  let subscriptionWrite: WriteResult;
  try {
    subscriptionWrite = await options.updateSubscription();
  } catch {
    return {
      ok: false,
      stage: "subscription",
      message: "Paddle accepted the plan change, but the local subscription record could not be synchronized. Retry later or contact support.",
    };
  }

  if (subscriptionWrite.error || !subscriptionWrite.data) {
    return {
      ok: false,
      stage: "subscription",
      message: "Paddle accepted the plan change, but the local subscription record could not be synchronized. Retry later or contact support.",
    };
  }

  let profileWrite: WriteResult;
  try {
    profileWrite = await options.updateProfile();
  } catch {
    return {
      ok: false,
      stage: "profile",
      message: "Paddle changed the subscription, but the local plan could not be synchronized. Billing reconciliation is required.",
    };
  }

  if (profileWrite.error || !profileWrite.data) {
    return {
      ok: false,
      stage: "profile",
      message: "Paddle changed the subscription, but the local plan could not be synchronized. Billing reconciliation is required.",
    };
  }

  return { ok: true };
}

export type PaddleSubscriptionCancellationResult =
  | { ok: true }
  | { ok: false; message: string };

export async function persistPaddleSubscriptionCancellation(options: {
  updateSubscription: WriteOperation;
}): Promise<PaddleSubscriptionCancellationResult> {
  try {
    const result = await options.updateSubscription();
    if (result.error || !result.data) {
      return {
        ok: false,
        message: "Paddle accepted the cancellation, but the local subscription record could not be synchronized. Billing reconciliation is required.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Paddle accepted the cancellation, but the local subscription record could not be synchronized. Billing reconciliation is required.",
    };
  }
}

/**
 * Select the newest subscription that still grants the account its existing
 * paid-plan entitlement after one subscription is cancelled.
 *
 * `past_due` remains eligible to match the webhook's current grace-period
 * behavior; canceled/paused/other terminal states are not entitled.
 */
export type PaddleSubscriptionPlanCandidate = {
  plan_slug: string | null;
  status: string | null;
  updated_at: string | null;
};

export function resolveEffectivePlanAfterCancellation(
  subscriptions: readonly PaddleSubscriptionPlanCandidate[],
): string {
  const eligibleStatuses = new Set(["active", "trialing", "past_due"]);
  const candidates = subscriptions.filter((subscription) =>
    typeof subscription.plan_slug === "string" &&
    subscription.plan_slug.trim().length > 0 &&
    typeof subscription.status === "string" &&
    eligibleStatuses.has(subscription.status.toLowerCase()),
  );

  candidates.sort((left, right) => {
    const leftTime = Date.parse(left.updated_at ?? "");
    const rightTime = Date.parse(right.updated_at ?? "");
    const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedRight - normalizedLeft;
  });

  return candidates[0]?.plan_slug?.trim() || "free";
}
