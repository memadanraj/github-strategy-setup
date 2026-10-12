import { describe, expect, it } from "vitest";
import {
  calculatePackCredits,
  extractPaddleLineItems,
  getCheckoutIntentId,
  hasExactCheckoutPrice,
} from "@/lib/paddle-validation";

const intentId = "09a5e0c2-0aaf-4f15-8ae6-5ef3bba7f953";

describe("extractPaddleLineItems", () => {
  it("reads the documented Paddle price object and quantity", () => {
    expect(extractPaddleLineItems([
      { price: { id: "pri_creator" }, quantity: 1 },
    ])).toEqual([{ priceId: "pri_creator", quantity: 1 }]);
  });

  it("accepts normalized price_id responses", () => {
    expect(extractPaddleLineItems([{ price_id: "pri_pack", quantity: "2" }]))
      .toEqual([{ priceId: "pri_pack", quantity: 2 }]);
  });

  it("drops malformed or unsafe line items", () => {
    expect(extractPaddleLineItems([
      null,
      {},
      { price: { id: "pri_missing_quantity" }, quantity: 0 },
      { price: { id: "pri_huge_quantity" }, quantity: 1001 },
      { price: { id: "pri_fractional" }, quantity: 1.5 },
      { price: { id: 123 }, quantity: 1 },
    ])).toEqual([]);
  });
});

describe("hasExactCheckoutPrice", () => {
  it("accepts the server-authorized single price", () => {
    expect(hasExactCheckoutPrice([{ priceId: "pri_creator", quantity: 1 }], "pri_creator")).toBe(true);
  });

  it("rejects a different price and extra line items", () => {
    expect(hasExactCheckoutPrice([{ priceId: "pri_pro", quantity: 1 }], "pri_creator")).toBe(false);
    expect(hasExactCheckoutPrice([
      { priceId: "pri_creator", quantity: 1 },
      { priceId: "pri_bonus", quantity: 1 },
    ], "pri_creator")).toBe(false);
  });
});

describe("calculatePackCredits", () => {
  const pack = { credits: 500, paddle_price_id: "pri_pack_500" };

  it("calculates credits from the canonical database pack, not checkout metadata", () => {
    expect(calculatePackCredits(pack, [{ priceId: "pri_pack_500", quantity: 2 }])).toBe(1000);
    // Client-supplied custom_data is deliberately not an input to this function.
  });

  it("rejects a mismatched price or missing server price ID", () => {
    expect(calculatePackCredits(pack, [{ priceId: "pri_other", quantity: 1 }])).toBeNull();
    expect(calculatePackCredits({ credits: 500, paddle_price_id: null }, [{ priceId: "pri_other", quantity: 1 }])).toBeNull();
  });

  it("rejects totals outside the supported credit range", () => {
    expect(calculatePackCredits({ credits: 5000, paddle_price_id: "pri_pack" }, [{ priceId: "pri_pack", quantity: 1000 }])).toBeNull();
  });
});

describe("getCheckoutIntentId", () => {
  it("extracts only a UUID intent from custom_data", () => {
    expect(getCheckoutIntentId({ checkout_intent: intentId, user_id: "ignored", credits: "999999" })).toBe(intentId);
    expect(getCheckoutIntentId({ checkout_intent: "not-a-uuid" })).toBeNull();
    expect(getCheckoutIntentId(null)).toBeNull();
    expect(getCheckoutIntentId({ user_id: intentId })).toBeNull();
  });
});
