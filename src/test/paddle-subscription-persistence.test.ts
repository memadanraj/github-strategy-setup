import { describe, expect, it, vi } from "vitest";
import {
  persistPaddleSubscriptionCancellation,
  persistPaddleSubscriptionPlanChange,
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