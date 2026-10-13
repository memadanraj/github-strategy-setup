export type GenerationJobCompletionRpc = (
  jobId: string,
  output: unknown,
) => PromiseLike<{ error: { message: string } | null }>;

export type GenerationJobStatusReader = (
  jobId: string,
) => PromiseLike<{
  data: { status: string } | null;
  error: { message: string } | null;
}>;

export async function completeGenerationJobAndConfirm(options: {
  jobId: string;
  output: unknown;
  complete: GenerationJobCompletionRpc;
  readStatus: GenerationJobStatusReader;
  jobLabel: "audio" | "visual";
  completionErrorMessage: string;
}): Promise<void> {
  try {
    const { error } = await options.complete(options.jobId, options.output);
    if (error) throw new Error(options.completionErrorMessage);
  } catch {
    throw new Error(options.completionErrorMessage);
  }

  // The completion RPC returns no state and is a guarded no-op for terminal jobs.
  // A no-error response alone is not proof that this job transitioned to complete.
  let state: Awaited<ReturnType<GenerationJobStatusReader>>;
  try {
    state = await options.readStatus(options.jobId);
  } catch {
    throw new Error(`Could not confirm ${options.jobLabel} generation job completion.`);
  }

  if (state.error || !state.data) {
    throw new Error(`Could not confirm ${options.jobLabel} generation job completion.`);
  }
  if (state.data.status !== "complete") {
    const title = options.jobLabel[0]!.toUpperCase() + options.jobLabel.slice(1);
    if (state.data.status === "failed") {
      throw new Error(`${title} generation job was already marked failed; completion was not confirmed.`);
    }
    throw new Error(`${title} generation job is not confirmed complete.`);
  }
}
