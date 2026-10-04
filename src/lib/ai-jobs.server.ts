// Server-only: reserve credits, run AI, settle the job (auto-refund on failure).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateStructured } from "./ai-gateway.server";

export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: string };

export async function runAiTask<T, R>(opts: {
  supabase: SupabaseClient;
  taskSlug: string;
  projectId: string;
  input: Record<string, unknown>;
  schemaName: string;
  schema: Record<string, unknown>;
  instructions: string;
  prompt: string;
  persist: (result: T) => Promise<R>;
}): Promise<TaskResult<R>> {
  const { supabase } = opts;
  const { data: task } = await supabase.from("ai_tasks").select("model").eq("slug", opts.taskSlug).maybeSingle();
  const { data: jobId, error: je } = await supabase.rpc("start_generation_job", {
    _task_slug: opts.taskSlug,
    _project_id: opts.projectId,
    _input: opts.input,
  });
  if (je || !jobId) {
    return { ok: false, error: je?.message?.includes("INSUFFICIENT_CREDITS") ? "Not enough credits." : "Couldn't start the AI job." };
  }
  try {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");
    const result = await generateStructured<T>({
      apiKey,
      model: (task as { model?: string } | null)?.model ?? "openai/gpt-6-astra",
      schemaName: opts.schemaName,
      schema: opts.schema,
      instructions: opts.instructions,
      input: opts.prompt,
    });
    const value = await opts.persist(result);
    await supabaseAdmin.rpc("complete_generation_job", { _job_id: jobId as string, _output: { task: opts.taskSlug } });
    return { ok: true, value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI generation failed";
    console.error(`${opts.taskSlug} failed`, e);
    await supabaseAdmin.rpc("fail_generation_job", { _job_id: jobId as string, _error: msg });
    return { ok: false, error: `${msg} Your credits were refunded.` };
  }
}
