export type RenderFinalizationClaimState =
  | "claimed"
  | "busy"
  | "already_complete"
  | "not_found"
  | "not_active";

type RenderFinalizationRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

type RenderFinalizationRpc = (args: { _job_id: string }) => PromiseLike<RenderFinalizationRpcResult>;

const allowedStates: RenderFinalizationClaimState[] = [
  "claimed",
  "busy",
  "already_complete",
  "not_found",
  "not_active",
];

export async function claimRenderJobFinalization(
  rpc: RenderFinalizationRpc,
  jobId: string,
): Promise<RenderFinalizationClaimState> {
  const { data, error } = await rpc({ _job_id: jobId });
  if (error) throw new Error("Could not claim render finalization.");
  if (typeof data !== "string" || !allowedStates.includes(data as RenderFinalizationClaimState)) {
    throw new Error("Render finalization claim returned an unknown state.");
  }
  return data as RenderFinalizationClaimState;
}


type RenderRecoveryDbResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export type ReadyExportRenderRecovery<T extends { status?: unknown }> =
  | { kind: "not-needed" }
  | { kind: "recovered"; job: T }
  | { kind: "error"; message: string };

/**
 * Recover a terminal render row when a ready export already exists for it.
 *
 * This closes the crash window where the export row was committed but the job's
 * final status update was not. Callers must scope every query/update to the
 * already-authorized job ID and project.
 */
export async function recoverTerminalRenderWithReadyExport<T extends { status?: unknown }>(
  jobStatus: string,
  operations: {
    findReadyExport: () => PromiseLike<RenderRecoveryDbResult<{ id: string; status: string }>>;
    markCompleted: () => PromiseLike<RenderRecoveryDbResult<T>>;
    reloadJob: () => PromiseLike<RenderRecoveryDbResult<T>>;
  },
): Promise<ReadyExportRenderRecovery<T>> {
  if (jobStatus !== "failed" && jobStatus !== "cancelled") {
    return { kind: "not-needed" };
  }

  let savedExport: RenderRecoveryDbResult<{ id: string; status: string }>;
  try {
    savedExport = await operations.findReadyExport();
  } catch {
    return { kind: "error", message: "Couldn't verify whether a saved export exists for this render." };
  }
  if (savedExport.error) {
    return { kind: "error", message: "Couldn't verify whether a saved export exists for this render." };
  }
  if (!savedExport.data || savedExport.data.status !== "ready") {
    return { kind: "not-needed" };
  }

  try {
    const updated = await operations.markCompleted();
    if (!updated.error && updated.data?.status === "completed") {
      return { kind: "recovered", job: updated.data };
    }
  } catch {
    // The update response may be lost after the database commits. Re-read below.
  }

  let fresh: RenderRecoveryDbResult<T>;
  try {
    fresh = await operations.reloadJob();
  } catch {
    return { kind: "error", message: "A ready export exists, but render status reconciliation is still required." };
  }
  if (!fresh.error && fresh.data?.status === "completed") {
    return { kind: "recovered", job: fresh.data };
  }
  return {
    kind: "error",
    message: "A ready export exists, but render status reconciliation is still required.",
  };
}
