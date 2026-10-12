export type PaddleLineItem = {
  priceId: string;
  quantity: number;
};

type PaddleItemLike = {
  price_id?: unknown;
  priceId?: unknown;
  price?: { id?: unknown } | null;
  quantity?: unknown;
};

/**
 * Normalize Paddle's transaction/subscription item shapes without trusting
 * client custom_data. Current Paddle payloads generally carry items[].price.id.
 */
export function extractPaddleLineItems(value: unknown): PaddleLineItem[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw): PaddleLineItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as PaddleItemLike;
    const possibleId = item.price?.id ?? item.price_id ?? item.priceId;
    const priceId = typeof possibleId === "string" ? possibleId.trim() : "";
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);

    if (!priceId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
      return [];
    }
    return [{ priceId, quantity }];
  });
}

/** Checkout is intentionally one item at a time; reject price injection/add-on lines. */
export function hasExactCheckoutPrice(items: PaddleLineItem[], expectedPriceId: string): boolean {
  return items.length === 1 && items[0]?.priceId === expectedPriceId;
}

/** Returns only the server-configured pack credit total if a paid line matches it. */
export function calculatePackCredits(
  pack: { credits: number; paddle_price_id: string | null },
  items: PaddleLineItem[],
): number | null {
  if (!pack.paddle_price_id || !Number.isSafeInteger(pack.credits) || pack.credits <= 0) {
    return null;
  }
  if (items.length !== 1 || items[0]?.priceId !== pack.paddle_price_id) return null;
  const total = pack.credits * (items[0]?.quantity ?? 0);
  if (!Number.isSafeInteger(total) || total <= 0 || total > 1_000_000) return null;
  return total;
}

export function getCheckoutIntentId(customData: unknown): string | null {
  if (!customData || typeof customData !== "object") return null;
  const id = (customData as Record<string, unknown>)["checkout_intent"];
  if (typeof id !== "string") return null;
  const normalized = id.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}
