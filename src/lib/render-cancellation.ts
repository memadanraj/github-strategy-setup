type CancelRowResult = {
  data: unknown;
  error: { message: string } | null;
};

export type RenderCancellableJob = {
  status: string;
  provider_job_id: string | null;
  finalization_started_at: string | null;
};

export type RenderCancellationProvider = {
  cancel?: (providerJobId: string) => Promise<void>;
} | null;

export type RenderCancellationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function cancelRenderJobWithProvider(
  job: RenderCancellableJob,
  provider: RenderCancellationProvider,
  persistCancellation: () => PromiseLike<CancelRowResult>,
): Promise<RenderCancellationResult> {
  if (!["queued", "processing"].includes(job.status) || job.finalization_started_at) {
    return {
      ok: false,
      error: "The render job is not cancellable or has already started finalizing its export.",
    };
  }

  if (job.provider_job_id) {
    if (!provider?.cancel) {
      return {
        ok: false,
        error: "The configured renderer does not support remote cancellation. The render job was left unchanged.",
      };
    }
    try {
      await provider.cancel(job.provider_job_id);
    } catch {
      return {
        ok: false,
        error: "The renderer could not confirm cancellation. The local render job was left unchanged.",
      };
    }
  }

  let result: CancelRowResult;
  try {
    result = await persistCancellation();
  } catch {
    return {
      ok: false,
      error: job.provider_job_id
        ? "The renderer accepted cancellation, but local render status could not be saved. Reconciliation is required."
        : "Could not save the render cancellation. Please retry.",
    };
  }

  if (result.error || !result.data) {
    return {
      ok: false,
      error: job.provider_job_id
        ? "The renderer accepted cancellation, but the render job changed before local status could be saved. Reconciliation is required."
        : "The render job changed before cancellation could be saved. Please refresh and retry.",
    };
  }

  return { ok: true };
}
