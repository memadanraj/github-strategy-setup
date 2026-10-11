// Server-only: reserve credits, run AI, settle the job (auto-refund on failure).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateStructured } from "./ai-gateway.server";

export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: string };

type RpcResult = { error: unknown | null };

async function failJob(jobId: string, message: string): Promise<unknown | null> {
  try {
    const { error } = await supabaseAdmin.rpc("fail_generation_job", {
      _job_id: jobId,
      _error: message,
    });
    return error ?? null;
  } catch (error) {
    return error;
  }
}

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
  const { data: task, error: taskError } = await supabase
    .from("ai_tasks")
    .select("model")
    .eq("slug", opts.taskSlug)
    .maybeSingle();

  if (taskError || !task) {
    return { ok: false, error: "This AI task is not configured. Please contact support." };
  }

  const { data: jobId, error: startError } = await supabase.rpc("start_generation_job", {
    _task_slug: opts.taskSlug,
    _project_id: opts.projectId,
    _input: opts.input,
  });
  if (startError || !jobId) {
    return {
      ok: false,
      error: startError?.message?.includes("INSUFFICIENT_CREDITS")
        ? "Not enough credits."
        : "Couldn't start the AI job.",
    };
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
    const completionArgs = { _job_id: jobId as string, _output: { task: opts.taskSlug } };

    // Completion is idempotent in the hardened SQL migration. Retry once so a
    // transient database error doesn't leave a successful job reserved forever.
    let { error: completionError } = await supabaseAdmin.rpc("complete_generation_job", completionArgs);
    if (completionError) {
      console.error(`${opts.taskSlug} completion failed; retrying once`, completionError);
      ({ error: completionError } = await supabaseAdmin.rpc("complete_generation_job", completionArgs));
    }

    if (completionError) {
      console.error(`${opts.taskSlug} completion failed after retry`, completionError);
      const refundError = await failJob(jobId as string, "Job output was persisted but completion settlement failed.");
      if (refundError) {
        console.error(`${opts.taskSlug} credit settlement needs reconciliation`, refundError);
        return {
          ok: false,
          error: "The result may have been saved, but job settlement failed. Credit state needs admin reconciliation.",
        };
      }
      return {
        ok: false,
        error: "The result was generated, but final settlement failed. The job was marked failed and its reservation was released.",
      };
    }

    return { ok: true, value };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI generation failed";
    console.error(`${opts.taskSlug} failed`, e);
    const refundError = await failJob(jobId as string, msg);
    if (refundError) {
      console.error(`${opts.taskSlug} refund needs reconciliation`, refundError);
      return {
        ok: false,
        error: `${msg} The credit refund could not be confirmed; this job needs admin reconciliation.`,
      };
    }
    return { ok: false, error: `${msg} Your credits were refunded.` };
  }
}
