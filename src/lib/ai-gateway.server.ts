// Server-only Lovable AI Gateway helper (OpenAI Responses API, streamed).
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";

export class AiGatewayError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function generateStructured<T>(opts: {
  apiKey: string;
  model: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(GATEWAY, {
    method: "POST",
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

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, body);
    if (res.status === 429) throw new AiGatewayError("AI is busy right now. Please try again shortly.", 429);
    if (res.status === 402) throw new AiGatewayError("AI credits for this workspace are exhausted.", 402);
    throw new AiGatewayError("AI generation failed.", res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let failed: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === "response.output_text.delta") text += evt.delta ?? "";
          else if (evt.type === "response.failed" || evt.type === "error")
            failed = evt.response?.error?.message ?? evt.message ?? "AI generation failed";
        } catch {
          /* ignore partial */
        }
      }
    }
  }
  if (failed) throw new AiGatewayError(failed, 500);
  if (!text) throw new AiGatewayError("AI returned no content.", 500);
  return JSON.parse(text) as T;
}
