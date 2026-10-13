import { describe, expect, it, vi } from "vitest";
import {
  persistPaddleSubscriptionCancellation,
  persistPaddleSubscriptionPlanChange,
  resolveEffectivePlanAfterCancellation,
} from "@/lib/paddle-subscription-persistence";

describe("Paddle subscription persistence", () => {
  it("writes subscription then profile before reporting a successful plan change", async () => {
    const calls: string[] = [];
    const result = await persistPaddleSubscriptionPlanChange({
      updateSubscription: vi.fn(async () => {
        calls.push("subscription");
        return { data: { paddle_subscription_id: "sub-1" }, error: null };
      }),
      updateProfile: vi.fn(async () => {
        calls.push("profile");
        return { data: { id: "user-1" }, error: null };
      }),
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(["subscription", "profile"]);
  });

  it("reports subscription-write errors without attempting the profile update", async () => {
    const updateProfile = vi.fn(async () => ({ data: { id: "user-1" }, error: null }));
    const result = await persistPaddleSubscriptionPlanChange({
      updateSubscription: vi.fn(async () => ({ data: null, error: { message: "db unavailable" } })),
      updateProfile,
    });
    expect(result).toMatchObject({ ok: false, stage: "subscription" });
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("treats a missing subscription row as a failure", async () => {
    const result = await persistPaddleSubscriptionPlanChange({
      updateSubscription: vi.fn(async () => ({ data: null, error: null })),
      updateProfile: vi.fn(async () => ({ data: { id: "user-1" }, error: null })),
    });
    expect(result).toMatchObject({ ok: false, stage: "subscription" });
  });

  it("reports profile-write failure after the subscription is synchronized", async () => {
    const result = await persistPaddleSubscriptionPlanChange({
      updateSubscription: vi.fn(async () => ({ data: { paddle_subscription_id: "sub-1" }, error: null })),
      updateProfile: vi.fn(async () => ({ data: null, error: { message: "profile update rejected" } })),
    });
    expect(result).toMatchObject({ ok: false, stage: "profile" });
    if (!result.ok) expect(result.message).toContain("Billing reconciliation is required");
  });

  it("reports thrown write failures instead of returning success", async () => {
    const result = await persistPaddleSubscriptionPlanChange({
      updateSubscription: vi.fn(async () => { throw new Error("network unavailable"); }),
      updateProfile: vi.fn(async () => ({ data: { id: "user-1" }, error: null })),
    });
    expect(result).toMatchObject({ ok: false, stage: "subscription" });
  });

  it("checks cancellation persistence", async () => {
    await expect(persistPaddleSubscriptionCancellation({
      updateSubscription: vi.fn(async () => ({ data: { paddle_subscription_id: "sub-1" }, error: null })),
    })).resolves.toEqual({ ok: true });
    await expect(persistPaddleSubscriptionCancellation({
      updateSubscription: vi.fn(async () => ({ data: null, error: { message: "no row" } })),
    })).resolves.toMatchObject({ ok: false });
  });
});

describe("effective plan after subscription cancellation", () => {
  it("keeps the newest remaining active or trialing plan instead of downgrading to free", () => {
    expect(resolveEffectivePlanAfterCancellation([
      { plan_slug: "creator", status: "active", updated_at: "2026-01-01T00:00:00.000Z" },
      { plan_slug: "pro", status: "trialing", updated_at: "2026-02-01T00:00:00.000Z" },
    ])).toBe("pro");
  });

  it("preserves a past-due plan during the existing payment-recovery grace period", () => {
    expect(resolveEffectivePlanAfterCancellation([
      { plan_slug: "creator", status: "past_due", updated_at: "2026-03-01T00:00:00.000Z" },
      { plan_slug: "pro", status: "canceled", updated_at: "2026-04-01T00:00:00.000Z" },
    ])).toBe("creator");
  });

  it("ignores cancelled/paused subscriptions and falls back to free when none remain", () => {
    expect(resolveEffectivePlanAfterCancellation([
      { plan_slug: "creator", status: "canceled", updated_at: "2026-04-01T00:00:00.000Z" },
      { plan_slug: "pro", status: "paused", updated_at: "2026-05-01T00:00:00.000Z" },
    ])).toBe("free");
    expect(resolveEffectivePlanAfterCancellation([])).toBe("free");
  });

  it("handles invalid timestamps without losing a valid entitlement", () => {
    expect(resolveEffectivePlanAfterCancellation([
      { plan_slug: "creator", status: "active", updated_at: "invalid" },
      { plan_slug: "pro", status: "canceled", updated_at: "2026-05-01T00:00:00.000Z" },
    ])).toBe("creator");
  });
});
