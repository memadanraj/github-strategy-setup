import "@tanstack/react-start/server-only";

// Server-only Lovable AI Gateway helper (OpenAI Responses API streaming).
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
export const DEFAULT_AI_GATEWAY_TIMEOUT_MS = 120_000;
export const MAX_AI_GATEWAY_OUTPUT_CHARS = 2_000_000;

export class AiGatewayError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AiGatewayError";
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function parseEventData(data: string): { delta?: string; failed?: string } | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return null;

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { failed: "AI gateway returned an invalid stream event." };
    }
    event = parsed as Record<string, unknown>;
  } catch {
    return { failed: "AI gateway returned a malformed stream event." };
  }

  if (event["type"] === "response.output_text.delta") {
    const delta = event["delta"];
    if (typeof delta !== "string") return { failed: "AI gateway returned an invalid text delta." };
    return { delta };
  }
  if (event["type"] === "response.failed" || event["type"] === "error") {
    // Avoid returning provider-internal details or reflected prompts to the client.
    return { failed: "AI provider failed during generation." };
  }
  return null;
}

export async function generateStructured<T>(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_AI_GATEWAY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw new AiGatewayError("AI gateway timeout configuration is invalid.", 500);
  }

  let res: Response;
  try {
    res = await fetch(GATEWAY, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": opts.apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: opts.model,
        instructions: opts.instructions,
        input: opts.input,
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      }),
    });
  } catch (error) {
    if (isTimeoutError(error)) throw new AiGatewayError("AI generation timed out. Please try again.", 504);
    throw new AiGatewayError("Could not reach the AI provider. Please try again.", 502);
  }

  if (!res.ok || !res.body) {
    // Do not log the full body: providers may include echoed request data.
    if (!res.ok) console.error("AI gateway request failed", { status: res.status });
    try { await res.body?.cancel(); } catch { /* best-effort cleanup */ }
    if (res.status === 429) throw new AiGatewayError("AI is busy right now. Please try again shortly.", 429);
    if (res.status === 402) throw new AiGatewayError("AI credits for this workspace are exhausted.", 402);
    throw new AiGatewayError("AI generation failed.", res.status || 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let failed: string | null = null;

  function consumeFrame(frame: string) {
    if (failed) return;
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const parsed = parseEventData(line.slice(5));
      if (!parsed) continue;
      if (parsed.failed) { failed = parsed.failed; return; }
      if (parsed.delta) {
        output += parsed.delta;
        if (output.length > MAX_AI_GATEWAY_OUTPUT_CHARS) {
          failed = "AI output exceeded the configured size limit.";
          return;
        }
      }
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Normalizing CRLF after concatenating chunks handles delimiters split across chunks.
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      if (buffer.length > MAX_AI_GATEWAY_OUTPUT_CHARS + 64_000 && !buffer.includes("\n\n")) {
        throw new AiGatewayError("AI stream frame exceeded the configured size limit.", 502);
      }
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        consumeFrame(frame);
        if (failed) break;
      }
      if (failed) break;
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeFrame(buffer);
  } catch (error) {
    if (error instanceof AiGatewayError) throw error;
    if (isTimeoutError(error)) throw new AiGatewayError("AI generation timed out. Please try again.", 504);
    throw new AiGatewayError("AI response stream failed. Please try again.", 502);
  } finally {
    try { reader.releaseLock(); } catch { /* no-op */ }
  }

  if (failed) throw new AiGatewayError(failed, 502);
  if (!output.trim()) throw new AiGatewayError("AI returned no content.", 502);
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new AiGatewayError("AI returned invalid structured data.", 502);
  }
}
