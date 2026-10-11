import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePaddleWebhook } from "@/lib/paddle.webhook.server";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), verify: vi.fn(), addCredits: vi.fn(), paddleEnv: vi.fn() }));

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/paddle.server", () => ({ admin: mocks.admin, addCredits: mocks.addCredits, paddleEnv: mocks.paddleEnv }));
vi.mock("@/lib/paddle-security", () => ({ verifyPaddleSignature: mocks.verify }));

function makeRequest(body: string, signature = "signature") {
  return new Request("https://example.test/api/public/paddle/webhook", {
    method: "POST",
    headers: { "paddle-signature": signature },
    body,
  });
}

function configureDuplicate(previousStatus: string, startedAt: string | null, claimSucceeds = false) {
  const previousQuery = {
    select: vi.fn(() => previousQuery),
    eq: vi.fn(() => previousQuery),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { processing_status: previousStatus, processing_started_at: startedAt },
      error: null,
    }),
  };
  const claimQuery = {
    eq: vi.fn(() => claimQuery),
    lt: vi.fn(() => claimQuery),
    select: vi.fn(() => claimQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: claimSucceeds ? { id: "event-row" } : null, error: null }),
  };
  const completionQuery = { eq: vi.fn().mockResolvedValue({ error: null }) };
  let updateCount = 0;
  const table = {
    insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
    select: vi.fn(() => previousQuery),
    update: vi.fn(() => {
      updateCount += 1;
      return updateCount === 1 ? claimQuery : completionQuery;
    }),
  };
  mocks.admin.mockResolvedValue({ from: (name: string) => {
    if (name !== "paddle_events") throw new Error("Unexpected table " + name);
    return table;
  } });
  return { table, claimQuery, completionQuery };
}

describe("Paddle webhook delivery idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paddleEnv.mockReturnValue("test-secret");
    mocks.verify.mockResolvedValue(true);
  });

  it("rejects invalid signatures before opening the database", async () => {
    mocks.verify.mockResolvedValueOnce(false);
    const response = await handlePaddleWebhook(makeRequest(JSON.stringify({ event_id: "evt-1", event_type: "transaction.completed" })));
    expect(response.status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and events without an ID/type", async () => {
    expect((await handlePaddleWebhook(makeRequest("{bad-json"))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect((await handlePaddleWebhook(makeRequest(JSON.stringify({ event_type: "transaction.completed" })))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("acknowledges an already processed duplicate without trying fulfillment again", async () => {
    const { table } = configureDuplicate("processed", null);
    const response = await handlePaddleWebhook(makeRequest(JSON.stringify({ event_id: "evt-done", event_type: "transaction.completed", data: { id: "txn-1" } })));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(table.insert).toHaveBeenCalledTimes(1);
    expect(table.update).not.toHaveBeenCalled();
    expect(mocks.addCredits).not.toHaveBeenCalled();
  });

  it("does not claim a duplicate event whose processing lease is still fresh", async () => {
    const recent = new Date().toISOString();
    const { table, claimQuery } = configureDuplicate("processing", recent);
    const response = await handlePaddleWebhook(makeRequest(JSON.stringify({ event_id: "evt-busy", event_type: "transaction.completed" })));
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Event is already being processed");
    expect(claimQuery.lt).toHaveBeenCalledTimes(1);
    expect(table.update).toHaveBeenCalledTimes(1);
  });

  it("reclaims a failed event and marks it processed after successful retry", async () => {
    const { table, claimQuery, completionQuery } = configureDuplicate("failed", null, true);
    const response = await handlePaddleWebhook(makeRequest(JSON.stringify({ event_id: "evt-retry", event_type: "notification.delivered", data: {} })));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(claimQuery.maybeSingle).toHaveBeenCalledTimes(1);
    expect(table.update).toHaveBeenCalledTimes(2);
    expect(completionQuery.eq).toHaveBeenCalledWith("paddle_event_id", "evt-retry");
  });
});
