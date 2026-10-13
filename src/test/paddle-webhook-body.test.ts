import { describe, expect, it } from "vitest";
import { readBoundedRequestText } from "@/lib/paddle-webhook-body";

describe("bounded Paddle webhook body reads", () => {
  it("accepts a request at the configured byte limit", async () => {
    const result = await readBoundedRequestText(
      new Request("https://example.test/webhook", { method: "POST", body: "1234" }),
      4,
    );
    expect(result).toEqual({ ok: true, text: "1234" });
  });

  it("rejects an oversized streamed body even without relying on Content-Length", async () => {
    const result = await readBoundedRequestText(
      new Request("https://example.test/webhook", { method: "POST", body: "12345" }),
      4,
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects an excessive declared Content-Length before reading the body", async () => {
    const result = await readBoundedRequestText(
      new Request("https://example.test/webhook", {
        method: "POST",
        headers: { "content-length": "500" },
        body: "tiny",
      }),
      4,
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });
});
