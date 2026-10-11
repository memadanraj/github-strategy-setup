import { describe, expect, it } from "vitest";

import { CLIP_TIMEOUT_MS } from "@/lib/visuals.functions";

// Clip generation runs in the background; a stuck clip must fail and refund
// credits after 15 minutes so users never lose credits to a hung job.
describe("Clip generation rules", () => {
  it("times out stuck clips after 15 minutes", () => {
    expect(CLIP_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });
});
