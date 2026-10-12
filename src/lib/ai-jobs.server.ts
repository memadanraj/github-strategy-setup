// Server-only: reserve credits, run AI, settle the job (auto-refund on failure).
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateStructured } from "./ai-gateway.server";

export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: string };

type GenerationJobFailureState =
  | "failed_refunded"
  | "failed_without_reservation"
  | "already_failed"
  | "already_complete"
  | "not_found"
  | "not_active";

async function failJobChecked(jobId: string, message: string): Promise<GenerationJobFailureState> {
  const { data, error } = await supabaseAdmin.rpc("fail_generation_job_checked", {
    _job_id: jobId,
    _error: message.slice(0, 500),
  });
  if (error || typeof data !== "string") {
    throw new Error("Could not confirm generation job settlement.");
  }

  const states: readonly GenerationJobFailureState[] = [
    "failed_refunded",
    "failed_without_reservation",
    "already_failed",
    "already_complete",
    "not_found",
    "not_active",
  ];
  if (!states.includes(data as GenerationJobFailureState)) {
    throw new Error("Generation job settlement returned an unknown state.");
  }
  return data as GenerationJobFailureState;
}

function failureResult<T>(message: string, state: GenerationJobFailureState): TaskResult<T> {
  if (state === "failed_refunded") {
    return { ok: false, error: `${message} Your credits were refunded.` };
  }
  if (state === "already_failed") {
    return {
      ok: false,
      error: `${message} The job was already marked failed, but this response could not confirm its refund status. Check your credit history or contact support.`,
    };
  }
  if (state === "failed_without_reservation") {
    return { ok: false, error: `${message} The job failed, but no reserved credits were available to refund.` };
  }
  if (state === "already_complete") {
    return { ok: false, error: `${message} The job is already complete; credit/refund status was not changed.` };
  }
  if (state === "not_found") {
    return { ok: false, error: `${message} The job record was not found, so a credit refund could not be confirmed.` };
  }
  return { ok: false, error: `${message} The job state is not active; credit state needs admin reconciliation.` };
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
  /** Optional compensation for persisted output if checked settlement confirms failure. */
  rollback?: (value: R) => Promise<void>;
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

  let persistedValue: R | undefined;
  let persistenceFinished = false;

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
    persistedValue = value;
    persistenceFinished = true;

    const completionArgs = { _job_id: jobId as string, _output: { task: opts.taskSlug } };

    // Retrying is safe because complete_generation_job is a guarded terminal transition.
    let { error: completionError } = await supabaseAdmin.rpc("complete_generation_job", completionArgs);
    if (completionError) {
      console.error(`${opts.taskSlug} completion failed; retrying once`, completionError);
      ({ error: completionError } = await supabaseAdmin.rpc("complete_generation_job", completionArgs));
    }

    if (completionError) {
      console.error(`${opts.taskSlug} completion failed after retry`);
      throw new Error("AI output may have been saved, but completion settlement failed.");
    }

    return { ok: true, value };
  } catch (cause) {
    const message = cause instanceof Error && cause.message.trim()
      ? cause.message
      : "AI generation failed";

    let state: GenerationJobFailureState;
    try {
      state = await failJobChecked(jobId as string, message);
    } catch (settlementError) {
      console.error(`${opts.taskSlug} credit settlement needs reconciliation`, settlementError);
      return {
        ok: false,
        error: `${message} Credit/refund state could not be confirmed; this job needs admin reconciliation.`,
      };
    }

    // A completion response can be lost after the database committed. Never tell
    // users their result failed or refund their credits if completion is confirmed.
    if (state === "already_complete" && persistenceFinished) {
      return { ok: true, value: persistedValue as R };
    }

    console.error(`${opts.taskSlug} failed with job state ${state}`);
    let cleanupFailed = false;
    if (
      persistenceFinished &&
      opts.rollback &&
      (state === "failed_refunded" || state === "failed_without_reservation" || state === "already_failed")
    ) {
      try {
        await opts.rollback(persistedValue as R);
      } catch (cleanupError) {
        cleanupFailed = true;
        console.error(`${opts.taskSlug} persisted-output rollback needs reconciliation`, cleanupError);
      }
    }

    const result = failureResult<R>(message, state);
    if (!result.ok && cleanupFailed) {
      return {
        ok: false,
        error: `${result.error} Generated output cleanup failed; manual reconciliation is required.`,
      };
    }
    return result;
  }
}
