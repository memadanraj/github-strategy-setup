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