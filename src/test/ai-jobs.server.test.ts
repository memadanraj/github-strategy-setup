import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAiTask } from "@/lib/ai-jobs.server";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  userRpc: vi.fn(),
  adminRpc: vi.fn(),
  generateStructured: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.adminRpc },
}));

vi.mock("@/lib/ai-gateway.server", () => ({
  generateStructured: mocks.generateStructured,
}));

function makeSupabase(task: { model: string } | null = { model: "test-model" }, taskError: unknown = null) {
  return {
    from: mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: task, error: taskError }),
        }),
      }),
    }),
    rpc: mocks.userRpc,
  };
}

function options(supabase: ReturnType<typeof makeSupabase>, persist = vi.fn().mockResolvedValue("saved")) {
  return {
    supabase: supabase as never,
    taskSlug: "test_task",
    projectId: "00000000-0000-4000-8000-000000000001",
    input: { idea: "test" },
    schemaName: "test_schema",
    schema: { type: "object" },
    instructions: "test",
    prompt: "test prompt",
    persist,
  };
}

describe("runAiTask credit settlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    mocks.userRpc.mockResolvedValue({ data: "job-1", error: null });
    mocks.adminRpc.mockResolvedValue({ data: null, error: null });
    mocks.generateStructured.mockResolvedValue({ answer: "generated" });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("does not reserve credits when the task is missing or cannot be loaded", async () => {
    const result = await runAiTask(options(makeSupabase(null)));
    expect(result).toEqual({ ok: false, error: "This AI task is not configured. Please contact support." });
    expect(mocks.userRpc).not.toHaveBeenCalled();
    expect(mocks.generateStructured).not.toHaveBeenCalled();
  });

  it("retries an idempotent completion once after a transient database error", async () => {
    mocks.adminRpc
      .mockResolvedValueOnce({ data: null, error: new Error("temporary db error") })
      .mockResolvedValueOnce({ data: null, error: null });
    const result = await runAiTask(options(makeSupabase()));
    expect(result).toEqual({ ok: true, value: "saved" });
    expect(mocks.adminRpc).toHaveBeenCalledTimes(2);
    expect(mocks.adminRpc).toHaveBeenNthCalledWith(1, "complete_generation_job", {
      _job_id: "job-1",
      _output: { task: "test_task" },
    });
  });

  it("does not claim a refund when the failure settlement RPC also fails", async () => {
    mocks.generateStructured.mockRejectedValueOnce(new Error("provider timeout"));
    mocks.adminRpc.mockResolvedValueOnce({ data: null, error: new Error("refund rpc failed") });
    const result = await runAiTask(options(makeSupabase()));
    expect(result).toEqual({
      ok: false,
      error: "provider timeout The credit refund could not be confirmed; this job needs admin reconciliation.",
    });
  });

  it("reports a confirmed refund when failure settlement succeeds", async () => {
    mocks.generateStructured.mockRejectedValueOnce(new Error("provider timeout"));
    const result = await runAiTask(options(makeSupabase()));
    expect(result).toEqual({ ok: false, error: "provider timeout Your credits were refunded." });
  });
});
