import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiGatewayError,
  DEFAULT_AI_GATEWAY_TIMEOUT_MS,
  MAX_AI_GATEWAY_OUTPUT_CHARS,
  generateStructured,
} from "@/lib/ai-gateway.server";

function responseFromChunks(chunks: string[], status = 200): Response {
  let index = 0;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index++] ?? ""));
    },
  });
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}

function delta(text: string): string {
  return "data: " + JSON.stringify({ type: "response.output_text.delta", delta: text }) + "\n\n";
}

function options(timeoutMs?: number) {
  return {
    apiKey: "test-key",
    model: "test-model",
    instructions: "Return structured JSON.",
    input: "test input",
    schemaName: "test_response",
    schema: { type: "object", properties: { answer: { type: "string" } } },
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

describe("AI gateway streaming reliability", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses OpenAI Responses SSE text deltas and the final JSON", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(responseFromChunks([
      delta('{"answer":'),
      delta('"hello"}'),
      "data: [DONE]\n\n",
    ]));

    await expect(generateStructured<{ answer: string }>(options()))
      .resolves.toEqual({ answer: "hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect((init?.headers as Record<string, string>)["Lovable-API-Key"]).toBe("test-key");
    expect(DEFAULT_AI_GATEWAY_TIMEOUT_MS).toBe(120_000);
  });

  it("parses standard CRLF frames even when line endings split across chunks", async () => {
    const fetchMock = vi.mocked(fetch);
    const first = "data: " + JSON.stringify({
      type: "response.output_text.delta",
      delta: '{"answer":"crlf"}',
    });
    fetchMock.mockResolvedValueOnce(responseFromChunks([first + "\r", "\n\r", "\n"]));

    await expect(generateStructured<{ answer: string }>(options()))
      .resolves.toEqual({ answer: "crlf" });
  });

  it("returns a safe structured error for provider-declared failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(responseFromChunks([
      "data: " + JSON.stringify({
        type: "response.failed",
        response: { error: { message: "private internal provider detail" } },
      }) + "\n\n",
    ]));

    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 502,
      message: "AI provider failed during generation.",
    });
  });

  it("maps 429 and 402 responses to actionable safe messages", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("sensitive provider body", { status: 429 }));
    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 429,
      message: "AI is busy right now. Please try again shortly.",
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response("sensitive provider body", { status: 402 }));
    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 402,
      message: "AI credits for this workspace are exhausted.",
    });
  });

  it("bounds request timeout and maps timeout rejection to a 504", async () => {
    await expect(generateStructured(options(999))).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 500,
      message: "AI gateway timeout configuration is invalid.",
    });
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 504,
      message: "AI generation timed out. Please try again.",
    });
  });

  it("rejects empty or malformed structured content explicitly", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(responseFromChunks(["data: [DONE]\n\n"]));
    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 502,
      message: "AI returned no content.",
    });

    vi.mocked(fetch).mockResolvedValueOnce(responseFromChunks([delta("not-json")]));
    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 502,
      message: "AI returned invalid structured data.",
    });
  });

  it("rejects output exceeding the configured response limit", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(responseFromChunks([
      delta("x".repeat(MAX_AI_GATEWAY_OUTPUT_CHARS + 1)),
    ]));
    await expect(generateStructured(options())).rejects.toMatchObject({
      name: "AiGatewayError",
      status: 502,
      message: "AI output exceeded the configured size limit.",
    });
  });

  it("exports the gateway error class for callers and tests", () => {
    expect(new AiGatewayError("test", 502)).toBeInstanceOf(Error);
  });
});
